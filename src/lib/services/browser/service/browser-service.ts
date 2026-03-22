import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { getBrowserRuntimeConfig } from "@/lib/services/browser/config/browser-config";
import { BrowserServiceError, toBrowserServiceError } from "@/lib/services/browser/errors/browser-errors";
import { browserActionLogger, BrowserActionLogger } from "@/lib/services/browser/logger/browser-action-logger";
import {
  browserSessionManager,
  BrowserSessionManager,
} from "@/lib/services/browser/session-manager/browser-session-manager";
import type {
  BrowserActionResult,
  BrowserConfirmationHook,
  BrowserCreateSessionInput,
  BrowserToolName,
  BrowserLaunchInput,
  BrowserOpenPageInput,
  BrowserNavigateInput,
  BrowserClickInput,
  BrowserTypeInput,
  BrowserScrollInput,
  BrowserExtractTextInput,
  BrowserExtractJobsInput,
  BrowserScreenshotInput,
  BrowserCloseSessionInput,
  BrowserRuntimeConfig,
  BrowserSessionSnapshot,
} from "@/lib/services/browser/types/browser-types";

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function isRetriable(error: BrowserServiceError): boolean {
  if (error.retriable) {
    return true;
  }

  const nonRetriableCodes = new Set([
    "VALIDATION_FAILED",
    "SESSION_NOT_FOUND",
    "PAGE_NOT_FOUND",
    "DOMAIN_BLOCKED",
    "ACTION_LIMIT_REACHED",
    "CONFIRMATION_REJECTED",
  ]);

  return !nonRetriableCodes.has(error.code);
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new BrowserServiceError({
          code: "ACTION_FAILED",
          message: `Browser action timed out after ${timeoutMs}ms`,
          retriable: true,
        }),
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export class BrowserService {
  private browser: Browser | null = null;

  constructor(
    private readonly config: BrowserRuntimeConfig = getBrowserRuntimeConfig(),
    private readonly sessionManager: BrowserSessionManager = browserSessionManager,
    private readonly actionLogger: BrowserActionLogger = browserActionLogger,
    private readonly confirmationHook: BrowserConfirmationHook = async () => true,
  ) {}

  async launchBrowser(
    input: BrowserLaunchInput = {},
  ): Promise<BrowserActionResult<{ browserReady: boolean; browserName: string }>> {
    return this.executeAction("browser_launch_browser", undefined, async () => {
      if (!this.browser) {
        this.browser = await chromium.launch({
          headless: input.headless ?? this.config.headless,
        });
      }

      return {
        browserReady: true,
        browserName: "chromium",
      };
    });
  }

  async createSession(
    input: BrowserCreateSessionInput,
  ): Promise<BrowserActionResult<{ sessionId: string; createdAt: string; actionCount: number; maxActions: number }>> {
    return this.executeAction("browser_create_session", undefined, async () => {
      await this.ensureBrowserReady();

      const context = await this.getBrowser().newContext();
      const snapshot = this.sessionManager.createSession({
        context,
        maxActions: this.config.maxActionsPerSession,
        userId: input.userId,
        metadata: input.metadata,
      });

      return {
        sessionId: snapshot.sessionId,
        createdAt: snapshot.createdAt,
        actionCount: snapshot.actionCount,
        maxActions: snapshot.maxActions,
      };
    });
  }

  async openPage(
    input: BrowserOpenPageInput,
  ): Promise<BrowserActionResult<{ sessionId: string; pageId: string; url: string }>> {
    return this.executeSessionAction("browser_open_page", input.sessionId, async () => {
      const session = this.sessionManager.getSession(input.sessionId);
      const page = await session.context.newPage();
      const pageId = this.sessionManager.attachPage(input.sessionId, page);

      await page.goto("about:blank", {
        waitUntil: "domcontentloaded",
        timeout: this.config.defaultTimeoutMs,
      });

      return {
        sessionId: input.sessionId,
        pageId,
        url: page.url(),
      };
    });
  }

  async navigate(
    input: BrowserNavigateInput,
  ): Promise<BrowserActionResult<{ sessionId: string; pageId: string; url: string; title: string }>> {
    return this.executeSessionAction("browser_navigate", input.sessionId, async () => {
      this.assertUrlAllowed(input.url);
      await this.requireConfirmation("browser_navigate", input.sessionId, "Navigate to a new URL", input.url);

      const resolved = await this.getOrCreatePage(input.sessionId, input.pageId);
      await resolved.page.goto(input.url, {
        waitUntil: "domcontentloaded",
        timeout: this.config.defaultTimeoutMs,
      });

      return {
        sessionId: input.sessionId,
        pageId: resolved.pageId,
        url: resolved.page.url(),
        title: await resolved.page.title(),
      };
    });
  }

  async click(input: BrowserClickInput): Promise<BrowserActionResult<{ sessionId: string; pageId: string; selector: string }>> {
    return this.executeSessionAction("browser_click", input.sessionId, async () => {
      await this.requireConfirmation("browser_click", input.sessionId, "Click selector", input.selector);

      const resolved = this.sessionManager.getPage(input.sessionId, input.pageId);
      await resolved.page.locator(input.selector).first().click({
        timeout: this.config.defaultTimeoutMs,
      });

      return {
        sessionId: input.sessionId,
        pageId: resolved.pageId,
        selector: input.selector,
      };
    });
  }

  async type(input: BrowserTypeInput): Promise<BrowserActionResult<{ sessionId: string; pageId: string; selector: string; typedLength: number }>> {
    return this.executeSessionAction("browser_type", input.sessionId, async () => {
      await this.requireConfirmation("browser_type", input.sessionId, "Type text into selector", input.selector);

      const resolved = this.sessionManager.getPage(input.sessionId, input.pageId);
      const locator = resolved.page.locator(input.selector).first();

      if (input.clearFirst ?? true) {
        await locator.fill(input.text, {
          timeout: this.config.defaultTimeoutMs,
        });
      } else {
        await locator.type(input.text, {
          timeout: this.config.defaultTimeoutMs,
        });
      }

      return {
        sessionId: input.sessionId,
        pageId: resolved.pageId,
        selector: input.selector,
        typedLength: input.text.length,
      };
    });
  }

  async scroll(input: BrowserScrollInput): Promise<BrowserActionResult<{ sessionId: string; pageId: string; x: number; y: number }>> {
    return this.executeSessionAction("browser_scroll", input.sessionId, async () => {
      const resolved = this.sessionManager.getPage(input.sessionId, input.pageId);
      const x = input.x ?? 0;
      const y = input.y ?? 500;

      await resolved.page.evaluate(
        ([dx, dy]) => {
          window.scrollBy(dx, dy);
        },
        [x, y],
      );

      return {
        sessionId: input.sessionId,
        pageId: resolved.pageId,
        x,
        y,
      };
    });
  }

  async extractText(
    input: BrowserExtractTextInput,
  ): Promise<BrowserActionResult<{ sessionId: string; pageId: string; text: string; length: number }>> {
    return this.executeSessionAction("browser_extract_text", input.sessionId, async () => {
      const resolved = this.sessionManager.getPage(input.sessionId, input.pageId);
      const maxLength = input.maxLength ?? 8_000;

      const text = input.selector
        ? await resolved.page.locator(input.selector).first().innerText({ timeout: this.config.defaultTimeoutMs })
        : await resolved.page.locator("body").first().innerText({ timeout: this.config.defaultTimeoutMs });

      const normalizedText = text.trim().slice(0, maxLength);

      return {
        sessionId: input.sessionId,
        pageId: resolved.pageId,
        text: normalizedText,
        length: normalizedText.length,
      };
    });
  }

  async extractJobs(
    input: BrowserExtractJobsInput,
  ): Promise<BrowserActionResult<{ sessionId: string; pageId: string; jobs: Array<{ title?: string; company?: string; location?: string; link?: string }> }>> {
    return this.executeSessionAction("browser_extract_jobs", input.sessionId, async () => {
      const resolved = this.sessionManager.getPage(input.sessionId, input.pageId);
      const selector = input.selector || "body";

      const jobs = await resolved.page.evaluate((sel: string) => {
        const container = document.querySelector(sel) || document.body;
        const items = Array.from(container.querySelectorAll(".job, [data-job], article, .card")).filter(el => {
          const text = el.textContent?.toLowerCase() || "";
          return text.includes("job") || text.includes("career") || text.includes("position") || text.includes("engineer") || text.includes("developer");
        });

        if (items.length === 0) {
          return Array.from(document.querySelectorAll("a")).filter(a => {
            const href = a.href.toLowerCase();
            return href.includes("/job/") || href.includes("/careers/") || href.includes("/vacancy/");
          }).slice(0, 10).map(a => ({
            title: a.textContent?.trim() || "Unknown Position",
            link: a.href,
          }));
        }

        return items.slice(0, 15).map(item => {
          const titleEl = item.querySelector("h1, h2, h3, h4, .title, [class*='title']");
          const companyEl = item.querySelector(".company, [class*='company'], .brand");
          const locationEl = item.querySelector(".location, [class*='location'], .address");
          const linkEl = item.querySelector("a");

          return {
            title: titleEl?.textContent?.trim() || "Untitled Role",
            company: companyEl?.textContent?.trim() || "Unknown Company",
            location: locationEl?.textContent?.trim() || "Unknown Location",
            link: linkEl?.href || "",
          };
        });
      }, selector);

      return {
        sessionId: input.sessionId,
        pageId: resolved.pageId,
        jobs,
      };
    });
  }

  async screenshot(
    input: BrowserScreenshotInput,
  ): Promise<BrowserActionResult<{ sessionId: string; pageId: string; filePath: string }>> {
    return this.executeSessionAction("browser_screenshot", input.sessionId, async () => {
      const resolved = this.sessionManager.getPage(input.sessionId, input.pageId);

      await mkdir(this.config.screenshotDir, { recursive: true });
      const fileName = sanitizeFileName(input.fileName || `${input.sessionId}-${Date.now()}.png`);
      const filePath = path.join(this.config.screenshotDir, fileName);

      await resolved.page.screenshot({
        path: filePath,
        fullPage: input.fullPage ?? true,
        timeout: this.config.defaultTimeoutMs,
      });

      return {
        sessionId: input.sessionId,
        pageId: resolved.pageId,
        filePath,
      };
    });
  }

  async closeSession(input: BrowserCloseSessionInput): Promise<BrowserActionResult<{ sessionId: string; closed: boolean }>> {
    return this.executeAction("browser_close_session", input.sessionId, async () => {
      const closed = await this.sessionManager.closeSession(input.sessionId);
      return {
        sessionId: input.sessionId,
        closed,
      };
    });
  }

  listSessions(): BrowserSessionSnapshot[] {
    return this.sessionManager.listSessions();
  }

  async shutdownBrowser(): Promise<void> {
    if (!this.browser) {
      return;
    }

    for (const session of this.sessionManager.listSessions()) {
      await this.sessionManager.closeSession(session.sessionId);
    }

    await this.browser.close();
    this.browser = null;
  }

  private async ensureBrowserReady() {
    if (!this.browser) {
      await this.launchBrowser({});
    }
  }

  private getBrowser(): Browser {
    if (!this.browser) {
      throw new BrowserServiceError({
        code: "BROWSER_NOT_READY",
        message: "Browser is not launched",
      });
    }
    return this.browser;
  }

  private async executeSessionAction<TData>(
    tool: BrowserToolName,
    sessionId: string,
    operation: (snapshot: BrowserSessionSnapshot) => Promise<TData>,
  ): Promise<BrowserActionResult<TData>> {
    let snapshot: BrowserSessionSnapshot;
    try {
      snapshot = this.sessionManager.incrementAction(sessionId);
    } catch (error) {
      // Auto-create session if it doesn't exist (so browser_navigate works without prior create_session)
      const parsed = toBrowserServiceError(error);
      if (parsed.code === "SESSION_NOT_FOUND" || parsed.code === "BROWSER_NOT_READY") {
        console.log(`[BrowserService] Auto-creating session "${sessionId}" for tool ${tool}`);
        await this.ensureBrowserReady();
        const context = await this.getBrowser().newContext();
        this.sessionManager.createSession({
          sessionId,
          context,
          maxActions: this.config.maxActionsPerSession,
        });
        snapshot = this.sessionManager.incrementAction(sessionId);
      } else {
        throw error;
      }
    }
    return this.executeAction(tool, sessionId, () => operation(snapshot), snapshot);
  }

  private async executeAction<TData>(
    tool: BrowserToolName,
    sessionId: string | undefined,
    operation: () => Promise<TData>,
    snapshot?: BrowserSessionSnapshot,
  ): Promise<BrowserActionResult<TData>> {
    const started = Date.now();
    const retries = this.config.actionRetryCount;
    let attempt = 0;

    while (attempt <= retries) {
      attempt += 1;

      try {
        const data = await withTimeout(operation(), this.config.defaultTimeoutMs);
        const durationMs = Date.now() - started;
        const result: BrowserActionResult<TData> = {
          status: "ok",
          tool,
          timestamp: new Date().toISOString(),
          sessionId,
          data,
          metadata: {
            attempt,
            retries,
            durationMs,
            actionCount: snapshot?.actionCount,
            maxActions: snapshot?.maxActions,
          },
        };

        this.actionLogger.log({
          tool,
          status: "ok",
          timestamp: result.timestamp,
          sessionId,
          durationMs,
          attempt,
          retries,
        });

        return result;
      } catch (error) {
        const parsed = toBrowserServiceError(error);
        const durationMs = Date.now() - started;

        if (attempt <= retries && isRetriable(parsed)) {
          continue;
        }

        const result: BrowserActionResult<TData> = {
          status: "error",
          tool,
          timestamp: new Date().toISOString(),
          sessionId,
          error: {
            code: parsed.code,
            message: parsed.message,
            retriable: parsed.retriable,
            details: parsed.details,
          },
          metadata: {
            attempt,
            retries,
            durationMs,
            actionCount: snapshot?.actionCount,
            maxActions: snapshot?.maxActions,
          },
        };

        this.actionLogger.log({
          tool,
          status: "error",
          timestamp: result.timestamp,
          sessionId,
          durationMs,
          attempt,
          retries,
          details: {
            errorCode: parsed.code,
            errorMessage: parsed.message,
          },
        });

        return result;
      }
    }

    return {
      status: "error",
      tool,
      timestamp: new Date().toISOString(),
      sessionId,
      error: {
        code: "ACTION_FAILED",
        message: "Action exhausted retry attempts",
        retriable: false,
      },
      metadata: {
        attempt,
        retries,
        durationMs: Date.now() - started,
        actionCount: snapshot?.actionCount,
        maxActions: snapshot?.maxActions,
      },
    };
  }

  private assertUrlAllowed(url: string) {
    if (!this.config.enforceDomainAllowlist) {
      return;
    }

    let hostname = "";
    try {
      hostname = new URL(url).hostname.toLowerCase();
    } catch {
      throw new BrowserServiceError({
        code: "DOMAIN_BLOCKED",
        message: `Invalid URL: ${url}`,
      });
    }

    const localhostHosts = new Set(["localhost", "127.0.0.1", "::1"]);
    if (localhostHosts.has(hostname)) {
      return;
    }

    const allowed = this.config.allowedDomains.some((domain) => {
      const normalized = domain.toLowerCase();
      if (normalized.startsWith("*.")) {
        const base = normalized.slice(2);
        return hostname === base || hostname.endsWith(`.${base}`);
      }
      return hostname === normalized;
    });

    if (!allowed) {
      throw new BrowserServiceError({
        code: "DOMAIN_BLOCKED",
        message: `Domain blocked by allowlist policy: ${hostname}`,
        details: {
          allowedDomains: this.config.allowedDomains,
          attemptedUrl: url,
        },
      });
    }
  }

  private async requireConfirmation(tool: BrowserToolName, sessionId: string, reason: string, target?: string) {
    if (!this.config.confirmationRequiredActions.includes(tool)) {
      return;
    }

    const approved = await this.confirmationHook({
      tool,
      sessionId,
      reason,
      target,
    });

    if (!approved) {
      throw new BrowserServiceError({
        code: "CONFIRMATION_REJECTED",
        message: `Action ${tool} rejected by confirmation hook`,
        retriable: false,
      });
    }
  }

  private async getOrCreatePage(sessionId: string, pageId?: string) {
    try {
      return this.sessionManager.getPage(sessionId, pageId);
    } catch (error) {
      const parsed = toBrowserServiceError(error);
      
      // If session doesn't exist, create it first
      let session;
      try {
        session = this.sessionManager.getSession(sessionId);
      } catch (e) {
        await this.ensureBrowserReady();
        const context = await this.getBrowser().newContext();
        this.sessionManager.createSession({
          sessionId, // Use the requested ID
          context,
          maxActions: this.config.maxActionsPerSession,
        });
        session = this.sessionManager.getSession(sessionId);
      }

      const page = await session.context.newPage();
      const createdPageId = this.sessionManager.attachPage(sessionId, page);
      return { page, pageId: createdPageId };
    }
  }
}

export const browserService = new BrowserService();
