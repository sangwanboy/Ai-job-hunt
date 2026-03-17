import { prisma } from "@/lib/db";
import { activeAgent } from "@/lib/mock/data";

export type SyncedAgentProfile = {
  agentId: string;
  name: string;
  roleTitle: string;
  specialization: string;
  soulMission: string;
  longTermObjective: string;
  principles: string[];
  decisionPhilosophy: string;
  communicationStyle: string;
  personalityStyle: string;
  mindModel: string;
  mindConstraints: string[];
  memoryAnchors: string;
};

const state = globalThis as unknown as {
  syncedAgentProfiles?: Map<string, SyncedAgentProfile>;
  syncedAgentProfilesHydrated?: boolean;
};

const syncedAgentProfiles = state.syncedAgentProfiles ?? new Map<string, SyncedAgentProfile>();
state.syncedAgentProfiles = syncedAgentProfiles;

async function hydrateLatestSnapshotsFromDb(): Promise<void> {
  if (state.syncedAgentProfilesHydrated) {
    return;
  }

  state.syncedAgentProfilesHydrated = true;

  try {
    const snapshots = await prisma.agentProfileSnapshot.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    for (const snapshot of snapshots) {
      if (syncedAgentProfiles.has(snapshot.agentId)) {
        continue;
      }

      syncedAgentProfiles.set(snapshot.agentId, {
        agentId: snapshot.agentId,
        name: "Atlas",
        roleTitle: snapshot.role,
        specialization: "Job search intelligence and outreach support",
        soulMission: snapshot.soul,
        longTermObjective: snapshot.soul,
        principles: activeAgent.soul.principles,
        decisionPhilosophy: "Prioritize evidence-backed opportunities and avoid noisy actions.",
        communicationStyle: snapshot.style,
        personalityStyle: snapshot.style,
        mindModel: snapshot.model,
        mindConstraints: snapshot.constraints,
        memoryAnchors: snapshot.memoryAnchor,
      });
    }
  } catch {
    // Fallback to in-memory defaults when Postgres is unavailable.
  }
}

async function persistSnapshot(profile: SyncedAgentProfile): Promise<void> {
  try {
    await prisma.agentProfileSnapshot.create({
      data: {
        agentId: profile.agentId,
        role: profile.roleTitle,
        soul: profile.soulMission,
        style: profile.communicationStyle,
        model: profile.mindModel,
        memoryAnchor: profile.memoryAnchors,
        constraints: profile.mindConstraints,
      },
    });
  } catch {
    // Fallback to in-memory only when DB write fails.
  }
}

void hydrateLatestSnapshotsFromDb();

function atlasDefaultProfile(): SyncedAgentProfile {
  return {
    agentId: activeAgent.id,
    name: "Atlas",
    roleTitle: activeAgent.identity.roleTitle,
    specialization: "Job search intelligence and outreach support",
    soulMission: activeAgent.soul.mission,
    longTermObjective: "Land high-fit interviews with focused, low-noise actions.",
    principles: activeAgent.soul.principles,
    decisionPhilosophy: "Prioritize evidence-backed opportunities and avoid noisy actions.",
    communicationStyle: activeAgent.identity.communicationStyle,
    personalityStyle: activeAgent.identity.communicationStyle,
    mindModel: activeAgent.mind.model,
    mindConstraints: ["Do not fabricate facts", "Always stay within user-approved actions"],
    memoryAnchors: "Prefer high-fit roles and concise updates.",
  };
}

export class AgentProfileSyncStore {
  getProfile(agentId: string): SyncedAgentProfile {
    void hydrateLatestSnapshotsFromDb();

    const existing = syncedAgentProfiles.get(agentId);
    if (existing) {
      return existing;
    }

    const seeded = atlasDefaultProfile();
    syncedAgentProfiles.set(agentId, seeded);
    return seeded;
  }

  upsertProfile(profile: SyncedAgentProfile): SyncedAgentProfile {
    syncedAgentProfiles.set(profile.agentId, profile);
    void persistSnapshot(profile);
    return profile;
  }
}

export const agentProfileSyncStore = new AgentProfileSyncStore();
