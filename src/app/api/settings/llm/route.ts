import { NextResponse } from "next/server";
import { llmSettingsStore } from "@/lib/services/settings/llm-settings-store";
import { llmSettingsUpdateSchema } from "@/lib/services/settings/llm-schemas";

export async function GET() {
  try {
    const settings = llmSettingsStore.get();
    return NextResponse.json(settings);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load LLM settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const payload = llmSettingsUpdateSchema.parse(body);
    const updated = await llmSettingsStore.update(payload);

    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update LLM settings";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
