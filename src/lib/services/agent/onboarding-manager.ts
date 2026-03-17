import { z } from "zod";
import type { MemoryKind } from "@/lib/domain/enums";
import { agentStore } from "@/lib/services/agent/agent-store";
import { getAiProvider } from "@/lib/services/ai/provider";
import { agentProfileSyncStore, type SyncedAgentProfile } from "@/lib/services/agent/agent-profile-sync";
import type { AgentRuntimeContext } from "@/lib/services/agent/types";

const globalState = globalThis as unknown as {
  onboardingStateMap?: Map<string, boolean>;
};

const onboardingState = globalState.onboardingStateMap ?? new Map<string, boolean>();
globalState.onboardingStateMap = onboardingState;

type OnboardingProfileDraft = {
  desiredName: string;
  roleTitle: string;
  specialization: string;
  communicationStyle: string;
  personalityStyle: string;
  soulMission: string;
  longTermObjective: string;
  principles: string[];
  decisionPhilosophy: string;
  mindModel: string;
  mindConstraints: string[];
  rememberNotes: string;
};

type OnboardingDraftState = {
  step: number;
  profile: OnboardingProfileDraft;
};

type OnboardingStep = {
  key: keyof OnboardingProfileDraft;
  question: string;
  parse: (input: string) => string | string[];
};

const steps: OnboardingStep[] = [
  {
    key: "roleTitle",
    question: "What role title should I operate under? (example: Job Scout Strategist)",
    parse: (input) => input,
  },
  {
    key: "soulMission",
    question: "What is my soul mission for your job search journey?",
    parse: (input) => input,
  },
  {
    key: "longTermObjective",
    question: "What long-term objective should I optimize for?",
    parse: (input) => input,
  },
  {
    key: "communicationStyle",
    question: "How should I communicate with you and what personality style should I keep?",
    parse: (input) => input,
  },
  {
    key: "mindModel",
    question: "Which model should I prefer by default? (example: gemini-2.5-flash)",
    parse: (input) => input,
  },
  {
    key: "mindConstraints",
    question: "Any hard constraints for my reasoning? (comma-separated, or say none)",
    parse: (input) =>
      input
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
  },
  {
    key: "rememberNotes",
    question: "Finally, what should I always remember about your preferences, boundaries, and goals?",
    parse: (input) => input,
  },
];

const conversationalState = globalThis as unknown as {
  onboardingDraftMap?: Map<string, OnboardingDraftState>;
};

const onboardingDraftMap = conversationalState.onboardingDraftMap ?? new Map<string, OnboardingDraftState>();
conversationalState.onboardingDraftMap = onboardingDraftMap;

function getStateKey(agentId: string, userId?: string): string {
  return `${agentId}::${userId ?? "anonymous"}`;
}

function initialDraft(): OnboardingProfileDraft {
  return {
    desiredName: "Atlas",
    roleTitle: "",
    specialization: "Job search intelligence and outreach support",
    communicationStyle: "",
    personalityStyle: "",
    soulMission: "",
    longTermObjective: "",
    principles: ["Be strategic", "Stay concise", "Ask before taking risky actions"],
    decisionPhilosophy: "Prioritize high-fit outcomes with minimal risk and clear evidence.",
    mindModel: "",
    mindConstraints: [],
    rememberNotes: "",
  };
}

const llmProfileSchema = z.object({
  roleTitle: z.string().min(2),
  specialization: z.string().min(2),
  soulMission: z.string().min(5),
  longTermObjective: z.string().min(5),
  principles: z.array(z.string().min(2)).min(1),
  decisionPhilosophy: z.string().min(5),
  communicationStyle: z.string().min(2),
  personalityStyle: z.string().min(2),
  mindModel: z.string().min(2),
  mindConstraints: z.array(z.string().min(2)).min(1),
  memoryAnchors: z.string().min(2),
});

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  return text.slice(start, end + 1);
}

function normalizeText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function isValidAnswer(value: string | string[]): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return value.trim().length >= 2;
}

export class OnboardingManager {
  isComplete(agentId: string, fallback: boolean, userId?: string): boolean {
    // Force onboarding as complete to allow direct chat.
    return true;
  }

  async handleConversation(
    context: AgentRuntimeContext,
    userId?: string,
  ): Promise<{ reply: string; completed: boolean; profileSnapshot?: SyncedAgentProfile }> {
    const stateKey = getStateKey(context.agentId, userId);
    const existing = onboardingDraftMap.get(stateKey) ?? { step: 0, profile: initialDraft() };
    const normalizedInput = normalizeText(context.message);

    if (/(^|\s)(skip onboarding|skip|use defaults)(\s|$)/i.test(normalizedInput)) {
      const profile = {
        ...existing.profile,
        desiredName: "Atlas",
        roleTitle: existing.profile.roleTitle || "Job Scout Strategist",
        soulMission:
          existing.profile.soulMission || "Find and prioritize high-fit opportunities with evidence.",
        longTermObjective: existing.profile.longTermObjective || "Land high-fit interviews efficiently.",
        communicationStyle: existing.profile.communicationStyle || "Strategic and concise",
        personalityStyle: existing.profile.personalityStyle || "Strategic and concise",
        mindModel: existing.profile.mindModel || "gemini-2.5-flash",
        mindConstraints:
          existing.profile.mindConstraints.length > 0
            ? existing.profile.mindConstraints
            : ["Do not fabricate facts", "Always stay within user-approved actions"],
        rememberNotes: existing.profile.rememberNotes || "Prefer high-fit roles and concise updates.",
      };

      onboardingState.set(stateKey, true);
      onboardingDraftMap.delete(stateKey);

      const syncedProfile = await this.synthesizeFinalProfile(context, profile);
      agentProfileSyncStore.upsertProfile(syncedProfile);

      if (userId) {
        try {
          await agentStore.applyConversationalOnboarding(context.agentId, {
            desiredName: syncedProfile.name,
            desiredHelp: syncedProfile.longTermObjective,
            desiredStyle: syncedProfile.personalityStyle,
            rememberNotes: syncedProfile.memoryAnchors,
            roleTitle: syncedProfile.roleTitle,
            specialization: syncedProfile.specialization,
            communicationStyle: syncedProfile.communicationStyle,
            soulMission: syncedProfile.soulMission,
            longTermObjective: syncedProfile.longTermObjective,
            principles: syncedProfile.principles,
            decisionPhilosophy: syncedProfile.decisionPhilosophy,
            mindModel: syncedProfile.mindModel,
            mindConstraints: syncedProfile.mindConstraints,
          });
        } catch {
          // Local fallback mode.
        }
      }

      return {
        reply:
          `Onboarding skipped. Atlas profile synced: ${syncedProfile.roleTitle}, mission ready, mind model ${syncedProfile.mindModel}.`,
        completed: true,
        profileSnapshot: syncedProfile,
      };
    }

    const currentStep = steps[existing.step];
    if (!currentStep) {
      onboardingState.set(stateKey, true);
      onboardingDraftMap.delete(stateKey);
      return {
        reply: "Onboarding is already complete.",
        completed: true,
        profileSnapshot: agentProfileSyncStore.getProfile(context.agentId),
      };
    }

    const parsedValue = currentStep.parse(normalizedInput);

    if (!isValidAnswer(parsedValue)) {
      return {
        reply: `I need a bit more detail for that. ${currentStep.question}`,
        completed: false,
      };
    }

    const profile: OnboardingProfileDraft = {
      ...existing.profile,
      [currentStep.key]: parsedValue,
    };

    const profileAfterDerived: OnboardingProfileDraft = {
      ...profile,
      personalityStyle:
        currentStep.key === "communicationStyle" ? (parsedValue as string) : profile.personalityStyle,
      mindConstraints:
        currentStep.key === "mindConstraints" && Array.isArray(parsedValue) && parsedValue[0]?.toLowerCase() === "none"
          ? ["Do not fabricate facts", "Always stay within user-approved actions"]
          : profile.mindConstraints,
    };

    const nextStepIndex = existing.step + 1;
    if (nextStepIndex < steps.length) {
      onboardingDraftMap.set(stateKey, {
        step: nextStepIndex,
        profile: profileAfterDerived,
      });

      return {
        reply: steps[nextStepIndex].question,
        completed: false,
        profileSnapshot: agentProfileSyncStore.getProfile(context.agentId),
      };
    }

    onboardingState.set(stateKey, true);
    onboardingDraftMap.delete(stateKey);

    const syncedProfile = await this.synthesizeFinalProfile(context, profile);
    agentProfileSyncStore.upsertProfile(syncedProfile);

    if (userId) {
      try {
        await agentStore.applyConversationalOnboarding(context.agentId, {
          desiredName: syncedProfile.name,
          desiredHelp: syncedProfile.longTermObjective,
          desiredStyle: syncedProfile.personalityStyle,
          rememberNotes: syncedProfile.memoryAnchors,
          roleTitle: syncedProfile.roleTitle,
          specialization: syncedProfile.specialization,
          communicationStyle: syncedProfile.communicationStyle,
          soulMission: syncedProfile.soulMission,
          longTermObjective: syncedProfile.longTermObjective,
          principles: syncedProfile.principles,
          decisionPhilosophy: syncedProfile.decisionPhilosophy,
          mindModel: syncedProfile.mindModel,
          mindConstraints: syncedProfile.mindConstraints,
        });

        await agentStore.saveMemoryChunk({
          agentId: context.agentId,
          userId,
          kind: "LONG_TERM" as MemoryKind,
          content: `Identity: ${syncedProfile.name} (${syncedProfile.roleTitle}, ${syncedProfile.specialization}); Personality: ${syncedProfile.personalityStyle}; Soul: ${syncedProfile.soulMission}; Objective: ${syncedProfile.longTermObjective}; Principles: ${syncedProfile.principles.join(" | ")}; Mind model: ${syncedProfile.mindModel}; Constraints: ${syncedProfile.mindConstraints.join(" | ")}; Memory anchors: ${syncedProfile.memoryAnchors}`,
          summary: "Conversational onboarding profile across soul, identity, mind, and personality",
          importanceScore: 0.98,
          metadata: { source: "onboarding-chat-llm-synced" },
        });
      } catch {
        // DB is optional in local fallback mode; onboarding state remains in memory.
      }
    }

    return {
      reply:
        `Perfect, onboarding complete. Atlas is now synced. ` +
        `Role: ${syncedProfile.roleTitle}. Mission: ${syncedProfile.soulMission}. Mind: ${syncedProfile.mindModel}.`,
      completed: true,
      profileSnapshot: syncedProfile,
    };
  }

  getOpeningQuestion(): string {
    const questions = steps.map((step, index) => `${index + 1}. ${step.question}`).join(" ");
    return `Atlas startup sync questions: ${questions}`;
  }

  private async synthesizeFinalProfile(
    context: AgentRuntimeContext,
    profile: OnboardingProfileDraft,
  ): Promise<SyncedAgentProfile> {
    const fallbackProfile: SyncedAgentProfile = {
      agentId: context.agentId,
      name: "Atlas",
      roleTitle: profile.roleTitle,
      specialization: profile.specialization,
      soulMission: profile.soulMission,
      longTermObjective: profile.longTermObjective,
      principles: profile.principles,
      decisionPhilosophy: profile.decisionPhilosophy,
      communicationStyle: profile.communicationStyle,
      personalityStyle: profile.personalityStyle,
      mindModel: profile.mindModel,
      mindConstraints: profile.mindConstraints,
      memoryAnchors: profile.rememberNotes,
    };

    try {
      const provider = getAiProvider(context.preferredProvider);
      const aiResponse = await provider.chat({
        model: context.preferredModel,
        apiKey: context.apiKey,
        temperature: 0.2,
        systemPrompt:
          "You are an agent profile synthesizer. Return only valid JSON with keys: roleTitle, specialization, soulMission, longTermObjective, principles, decisionPhilosophy, communicationStyle, personalityStyle, mindModel, mindConstraints, memoryAnchors.",
        userPrompt: `Build the final Atlas profile from onboarding answers. Keep it concise and action-oriented. Input: ${JSON.stringify(
          fallbackProfile,
        )}`,
      });

      const jsonText = extractJsonObject(aiResponse.text);
      if (!jsonText) {
        return fallbackProfile;
      }

      const parsed = llmProfileSchema.safeParse(JSON.parse(jsonText));
      if (!parsed.success) {
        return fallbackProfile;
      }

      return {
        agentId: context.agentId,
        name: "Atlas",
        ...parsed.data,
      };
    } catch {
      return fallbackProfile;
    }
  }
}

export const onboardingManager = new OnboardingManager();
