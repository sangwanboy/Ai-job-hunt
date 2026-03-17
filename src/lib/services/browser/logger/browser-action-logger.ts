import { logger } from "@/lib/utils/logger";
import type { BrowserActionStatus, BrowserToolName } from "@/lib/services/browser/types/browser-types";

type BrowserActionLogEntry = {
  tool: BrowserToolName;
  status: BrowserActionStatus;
  timestamp: string;
  sessionId?: string;
  durationMs: number;
  attempt: number;
  retries: number;
  details?: Record<string, unknown>;
};

export class BrowserActionLogger {
  log(entry: BrowserActionLogEntry) {
    const context = {
      tool: entry.tool,
      status: entry.status,
      timestamp: entry.timestamp,
      sessionId: entry.sessionId,
      durationMs: entry.durationMs,
      attempt: entry.attempt,
      retries: entry.retries,
      ...entry.details,
    };

    if (entry.status === "error") {
      logger.error("browser_action_failed", context);
      return;
    }

    logger.info("browser_action_succeeded", context);
  }
}

export const browserActionLogger = new BrowserActionLogger();
