export const applicationStatuses = [
  "NEW",
  "SAVED",
  "APPLIED",
  "INTERVIEW",
  "OFFER",
  "REJECTED",
  "ARCHIVED",
] as const;

export const outreachStatuses = ["NONE", "DRAFTED", "SENT", "REPLIED"] as const;

export const priorities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export const workModes = ["REMOTE", "HYBRID", "ONSITE"] as const;

export const seniorities = ["INTERN", "JUNIOR", "MID", "SENIOR", "STAFF", "LEAD", "PRINCIPAL"] as const;

export const aiProviders = ["OPENAI", "ANTHROPIC", "GEMINI"] as const;

export const memoryKinds = ["SHORT_TERM", "WORKING", "SESSION", "LONG_TERM", "STRUCTURED", "SUMMARY"] as const;

export const messageRoles = ["SYSTEM", "USER", "ASSISTANT", "TOOL"] as const;

export type ApplicationStatus = (typeof applicationStatuses)[number];
export type OutreachStatus = (typeof outreachStatuses)[number];
export type Priority = (typeof priorities)[number];
export type WorkMode = (typeof workModes)[number];
export type Seniority = (typeof seniorities)[number];
export type AiProvider = (typeof aiProviders)[number];
export type MemoryKind = (typeof memoryKinds)[number];
export type MessageRole = (typeof messageRoles)[number];
