export type KpiMetric = {
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down" | "flat";
};

export type DashboardTrendPoint = {
  date: string;
  applied: number;
  interviews: number;
  replies: number;
};

export type JobRow = {
  id: string;
  title: string;
  company: string;
  location: string;
  workMode: "REMOTE" | "HYBRID" | "ONSITE";
  salaryRange: string;
  score: number;
  status: "NEW" | "SAVED" | "APPLIED" | "INTERVIEW" | "OFFER" | "REJECTED" | "ARCHIVED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  source: string;
  postedAt: string;
  sourceUrl?: string;
};

export type AgentProfile = {
  id: string;
  key: string;
  soul: {
    mission: string;
    principles: string[];
  };
  identity: {
    name: string;
    roleTitle: string;
    communicationStyle: string;
    strengths?: string[];
    cautionAreas?: string[];
  };
  mind: {
    model: string;
    deterministicMode: boolean;
    maxTurns: number;
  };
  onboardingCompleted: boolean;
  memoryBudgetTokens: number;
  responseBudgetTokens: number;
};

export type ChatMessageView = {
  id: string;
  role: "SYSTEM" | "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
};
