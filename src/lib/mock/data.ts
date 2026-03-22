import type {
  AgentProfile,
  ChatMessageView,
  DashboardTrendPoint,
  JobRow,
  KpiMetric,
} from "@/types/domain";

export const kpiMetrics: KpiMetric[] = [];

export const dashboardTrend: DashboardTrendPoint[] = [];

export const jobs: JobRow[] = [];

export const activeAgent: AgentProfile = {
  id: "job_scout",
  key: "job_scout",
  soul: {
    mission: "Ready to assist.",
    principles: [],
  },
  identity: {
    name: "Atlas",
    roleTitle: "Assistant",
    communicationStyle: "Strategic",
  },
  mind: {
    model: "gemini-3.1-flash-lite-preview",
    deterministicMode: true,
    maxTurns: 10,
  },
  onboardingCompleted: false,
  memoryBudgetTokens: 5000,
  responseBudgetTokens: 1800,
};

export const initialChat: ChatMessageView[] = [
  {
    id: "greeting-msg",
    role: "ASSISTANT",
    content: "Hello! I'm Atlas. What kind of roles are you looking for today? Give me some details (e.g. title, remote/onsite, industry) and I'll start fetching jobs for you to review.",
    createdAt: new Date().toISOString(),
  }
];
