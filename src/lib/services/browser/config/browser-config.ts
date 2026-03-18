import path from "node:path";
import type { BrowserRuntimeConfig, BrowserToolName } from "@/lib/services/browser/types/browser-types";

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function parseList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseToolList(value: string | undefined): BrowserToolName[] {
  const known = new Set<BrowserToolName>([
    "browser_launch_browser",
    "browser_create_session",
    "browser_open_session",
    "browser_open_page",
    "browser_navigate",
    "browser_click",
    "browser_type",
    "browser_scroll",
    "browser_extract_text",
    "browser_screenshot",
    "browser_close_session",
  ]);

  return parseList(value).filter((item): item is BrowserToolName => known.has(item as BrowserToolName));
}

let cachedConfig: BrowserRuntimeConfig | null = null;

export function getBrowserRuntimeConfig(): BrowserRuntimeConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const allowedDomains = parseList(process.env.BROWSER_ALLOWED_DOMAINS);

  cachedConfig = {
    headless: parseBoolean(process.env.BROWSER_HEADLESS, true),
    defaultTimeoutMs: parseNumber(process.env.BROWSER_ACTION_TIMEOUT_MS, 30_000),
    actionRetryCount: parseNumber(process.env.BROWSER_ACTION_RETRY_COUNT, 1),
    maxActionsPerSession: parseNumber(process.env.BROWSER_MAX_ACTIONS_PER_SESSION, 60),
    allowedDomains,
    enforceDomainAllowlist: parseBoolean(process.env.BROWSER_ENFORCE_ALLOWLIST, false),
    screenshotDir: path.resolve(process.cwd(), process.env.BROWSER_SCREENSHOT_DIR || "artifacts/browser"),
    confirmationRequiredActions: process.env.BROWSER_CONFIRMATION_ACTIONS ? parseToolList(process.env.BROWSER_CONFIRMATION_ACTIONS) : [],
  };

  return cachedConfig;
}

export function clearBrowserConfigCache() {
  cachedConfig = null;
}
