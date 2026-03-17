import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { OutreachStatus } from "@/lib/domain/enums";
import { getAiProvider } from "@/lib/services/ai/provider";

const requestSchema = z.object({}).passthrough();

type DraftResult = {
  recruiterId: string;
  recruiterName: string;
  channel: string;
  tone: string;
  subject: string;
  body: string;
};

type OutreachQueueEntry = {
  recruiterId: string;
  recruiterName: string;
  channel: string;
  tone: string;
  roleContext: string;
};

const mockQueue: OutreachQueueEntry[] = [
  { recruiterId: "r1", recruiterName: "Priya N.", channel: "LinkedIn", tone: "Direct", roleContext: "Senior Full-Stack Engineer" },
  { recruiterId: "r2", recruiterName: "Marcus T.", channel: "Email", tone: "Warm", roleContext: "AI Product Engineer" },
  { recruiterId: "r3", recruiterName: "Elena R.", channel: "LinkedIn", tone: "Strategic", roleContext: "Staff Platform Engineer" },
];

async function loadQueueEntries(): Promise<OutreachQueueEntry[]> {
  try {
    const rows = (await prisma.outreachMessage.findMany({
      where: {
        status: { in: ["DRAFTED", "NONE"] },
      },
      include: {
        recruiter: true,
        job: true,
      },
      take: 10,
      orderBy: { createdAt: "desc" },
    })) as Array<{
      id: string;
      recruiterId: string | null;
      channel: string;
      generatedByAgent: string | null;
      status: OutreachStatus;
      recruiter: { fullName: string } | null;
      job: { title: string } | null;
    }>;

    if (rows.length === 0) {
      return mockQueue;
    }

    return rows.map((row) => {
      const queueStatus = row.status === "NONE" ? "Queued" : "Draft";
      return {
        recruiterId: row.recruiterId ?? row.id,
        recruiterName: row.recruiter?.fullName ?? "Unknown recruiter",
        channel: row.channel,
        tone: queueStatus === "Queued" ? "Direct" : row.generatedByAgent ? "Strategic" : "Warm",
        roleContext: row.job?.title ?? "Opportunity follow-up",
      };
    });
  } catch {
    return mockQueue;
  }
}

async function generateDraft(entry: OutreachQueueEntry): Promise<DraftResult> {
  const provider = getAiProvider();
  const prompt = [
    `Recruiter: ${entry.recruiterName}`,
    `Channel: ${entry.channel}`,
    `Tone: ${entry.tone}`,
    `Role context: ${entry.roleContext}`,
    "Write a concise, personalized outreach message with subject and body.",
    "Return plain text in this format:",
    "Subject: ...",
    "Body: ...",
  ].join("\n");

  try {
    const response = await provider.chat({
      systemPrompt: "You write concise recruiter outreach drafts for job search workflows.",
      userPrompt: prompt,
      temperature: 0.4,
    });

    const text = response.text.trim();
    const scaffoldLike = /\[Mock .* response generated/i.test(text);
    const subjectMatch = text.match(/Subject:\s*(.+)/i);
    const bodyMatch = text.match(/Body:\s*([\s\S]+)/i);

    if (scaffoldLike) {
      return {
        recruiterId: entry.recruiterId,
        recruiterName: entry.recruiterName,
        channel: entry.channel,
        tone: entry.tone,
        subject: `Quick intro re: ${entry.roleContext}`,
        body: `Hi ${entry.recruiterName}, I noticed the ${entry.roleContext} opportunity and wanted to connect. I have relevant experience and can share a concise fit summary if useful. Would you be open to a brief conversation this week?`,
      };
    }

    return {
      recruiterId: entry.recruiterId,
      recruiterName: entry.recruiterName,
      channel: entry.channel,
      tone: entry.tone,
      subject: subjectMatch?.[1]?.trim() || `Quick intro re: ${entry.roleContext}`,
      body: bodyMatch?.[1]?.trim() || text,
    };
  } catch {
    return {
      recruiterId: entry.recruiterId,
      recruiterName: entry.recruiterName,
      channel: entry.channel,
      tone: entry.tone,
      subject: `Quick intro re: ${entry.roleContext}`,
      body: `Hi ${entry.recruiterName}, I saw the ${entry.roleContext} opportunity and wanted to introduce myself. I believe my background is a strong fit and would value a quick conversation if the role is still active.`,
    };
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as unknown;
    requestSchema.parse(body);

    const queue = await loadQueueEntries();
    const drafts = await Promise.all(queue.map((entry) => generateDraft(entry)));

    return NextResponse.json({ drafts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate outreach draft batch";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
