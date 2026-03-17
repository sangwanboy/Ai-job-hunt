import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { OutreachStatus } from "@/lib/domain/enums";

const mockOutreach = [
  { day: "Mon", replyRate: 18 },
  { day: "Tue", replyRate: 24 },
  { day: "Wed", replyRate: 21 },
  { day: "Thu", replyRate: 29 },
  { day: "Fri", replyRate: 26 },
  { day: "Sat", replyRate: 14 },
  { day: "Sun", replyRate: 17 },
];

export async function GET() {
  try {
    const rows = (await prisma.outreachMessage.findMany({
      where: {
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      select: { createdAt: true, status: true },
      orderBy: { createdAt: "asc" },
    })) as Array<{ createdAt: Date; status: OutreachStatus }>;

    if (rows.length === 0) {
      return NextResponse.json(mockOutreach);
    }

    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const grouped = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(Date.now() - (6 - index) * 24 * 60 * 60 * 1000);
      const dayRows = rows.filter((row) => new Date(row.createdAt).toDateString() === date.toDateString());
      const sentCount = dayRows.length;
      const repliedCount = dayRows.filter((row) => row.status === "REPLIED").length;
      return {
        day: days[date.getDay()],
        replyRate: sentCount === 0 ? 0 : Math.round((repliedCount / sentCount) * 100),
      };
    });

    return NextResponse.json(grouped);
  } catch {
    return NextResponse.json(mockOutreach);
  }
}
