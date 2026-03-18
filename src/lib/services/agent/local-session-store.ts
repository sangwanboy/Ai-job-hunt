import * as fs from "fs/promises";
import * as path from "path";
import { MessageRole } from "@/lib/domain/enums";

export type LocalSession = {
  id: string;
  agentId: string;
  userId: string;
  title: string;
  updatedAt: string;
  messages: Array<{
    role: MessageRole;
    content: string;
    createdAt: string;
  }>;
};

const MEMORY_DIR = "project_memory";
const SESSIONS_FILE = path.join(MEMORY_DIR, "local_sessions.json");

export class LocalSessionStore {
  private async ensureDir(): Promise<void> {
    try {
      await fs.mkdir(path.join(process.cwd(), MEMORY_DIR), { recursive: true });
    } catch {
      // ignore
    }
  }

  private async readAll(): Promise<LocalSession[]> {
    await this.ensureDir();
    const filePath = path.join(process.cwd(), SESSIONS_FILE);
    try {
      const data = await fs.readFile(filePath, "utf-8");
      return JSON.parse(data) as LocalSession[];
    } catch {
      return [];
    }
  }

  private async writeAll(sessions: LocalSession[]): Promise<void> {
    await this.ensureDir();
    const filePath = path.join(process.cwd(), SESSIONS_FILE);
    await fs.writeFile(filePath, JSON.stringify(sessions, null, 2), "utf-8");
  }

  async list(agentId: string, userId: string, agentKey?: string): Promise<LocalSession[]> {
    const all = await this.readAll();
    return all
      .filter((s) => (s.agentId === agentId || s.agentId === agentKey || s.agentId === "job_scout") && s.userId === userId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async get(sessionId: string): Promise<LocalSession | null> {
    const all = await this.readAll();
    return all.find((s) => s.id === sessionId) || null;
  }

  async saveMessage(input: {
    sessionId: string;
    agentId: string;
    userId: string;
    role: MessageRole;
    content: string;
    title?: string;
  }): Promise<void> {
    const all = await this.readAll();
    let session = all.find((s) => s.id === input.sessionId);

    if (!session) {
      session = {
        id: input.sessionId,
        agentId: input.agentId,
        userId: input.userId,
        title: input.title || input.content.slice(0, 50),
        updatedAt: new Date().toISOString(),
        messages: [],
      };
      all.push(session);
    }

    session.messages.push({
      role: input.role,
      content: input.content,
      createdAt: new Date().toISOString(),
    });
    session.updatedAt = new Date().toISOString();
    if (input.title) {
      session.title = input.title;
    }

    await this.writeAll(all);
  }
}

export const localSessionStore = new LocalSessionStore();
