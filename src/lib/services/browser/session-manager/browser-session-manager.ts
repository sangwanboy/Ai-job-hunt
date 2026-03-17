import { randomUUID } from "node:crypto";
import type { BrowserContext, Page } from "playwright";
import { BrowserServiceError } from "@/lib/services/browser/errors/browser-errors";
import type { BrowserSessionSnapshot } from "@/lib/services/browser/types/browser-types";

type BrowserSessionRecord = {
  sessionId: string;
  userId?: string;
  createdAt: string;
  lastActionAt: string;
  actionCount: number;
  maxActions: number;
  context: BrowserContext;
  pages: Map<string, Page>;
  activePageId?: string;
  metadata?: Record<string, unknown>;
};

export class BrowserSessionManager {
  private readonly sessions = new Map<string, BrowserSessionRecord>();

  createSession(input: {
    context: BrowserContext;
    maxActions: number;
    userId?: string;
    metadata?: Record<string, unknown>;
  }): BrowserSessionSnapshot {
    const sessionId = randomUUID();
    const now = new Date().toISOString();

    this.sessions.set(sessionId, {
      sessionId,
      userId: input.userId,
      createdAt: now,
      lastActionAt: now,
      actionCount: 0,
      maxActions: input.maxActions,
      context: input.context,
      pages: new Map(),
      metadata: input.metadata,
    });

    return this.getSnapshot(sessionId);
  }

  getSession(sessionId: string): BrowserSessionRecord {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new BrowserServiceError({
        code: "SESSION_NOT_FOUND",
        message: `Browser session not found: ${sessionId}`,
      });
    }
    return session;
  }

  getSnapshot(sessionId: string): BrowserSessionSnapshot {
    const session = this.getSession(sessionId);
    return {
      sessionId: session.sessionId,
      userId: session.userId,
      createdAt: session.createdAt,
      lastActionAt: session.lastActionAt,
      actionCount: session.actionCount,
      maxActions: session.maxActions,
      activePageId: session.activePageId,
      pageIds: Array.from(session.pages.keys()),
      metadata: session.metadata,
    };
  }

  incrementAction(sessionId: string): BrowserSessionSnapshot {
    const session = this.getSession(sessionId);
    if (session.actionCount >= session.maxActions) {
      throw new BrowserServiceError({
        code: "ACTION_LIMIT_REACHED",
        message: `Max action count reached for session ${sessionId}`,
        retriable: false,
        details: {
          actionCount: session.actionCount,
          maxActions: session.maxActions,
        },
      });
    }

    session.actionCount += 1;
    session.lastActionAt = new Date().toISOString();
    return this.getSnapshot(sessionId);
  }

  attachPage(sessionId: string, page: Page, pageId = randomUUID()): string {
    const session = this.getSession(sessionId);
    session.pages.set(pageId, page);
    session.activePageId = pageId;
    return pageId;
  }

  getPage(sessionId: string, pageId?: string): { page: Page; pageId: string } {
    const session = this.getSession(sessionId);
    const resolvedPageId = pageId ?? session.activePageId;

    if (!resolvedPageId) {
      throw new BrowserServiceError({
        code: "PAGE_NOT_FOUND",
        message: `No active page found for session ${sessionId}`,
      });
    }

    const page = session.pages.get(resolvedPageId);
    if (!page) {
      throw new BrowserServiceError({
        code: "PAGE_NOT_FOUND",
        message: `Page ${resolvedPageId} not found in session ${sessionId}`,
      });
    }

    return { page, pageId: resolvedPageId };
  }

  markActivePage(sessionId: string, pageId: string) {
    const session = this.getSession(sessionId);
    if (!session.pages.has(pageId)) {
      throw new BrowserServiceError({
        code: "PAGE_NOT_FOUND",
        message: `Page ${pageId} not found in session ${sessionId}`,
      });
    }
    session.activePageId = pageId;
  }

  async closeSession(sessionId: string): Promise<boolean> {
    const session = this.getSession(sessionId);
    await session.context.close();
    return this.sessions.delete(sessionId);
  }

  listSessions(): BrowserSessionSnapshot[] {
    return Array.from(this.sessions.keys()).map((sessionId) => this.getSnapshot(sessionId));
  }
}

export const browserSessionManager = new BrowserSessionManager();
