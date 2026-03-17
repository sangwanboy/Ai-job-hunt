import { NextResponse } from "next/server";
import { runtimeSettingsUpdateSchema } from "@/lib/services/settings/runtime-settings-schemas";
import { runtimeSettingsStore } from "@/lib/services/settings/runtime-settings-store";

export async function GET() {
  try {
    const settings = runtimeSettingsStore.get();
    return NextResponse.json(settings);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load runtime settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const payload = runtimeSettingsUpdateSchema.parse(body);
    const updated = runtimeSettingsStore.update(payload);

    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update runtime settings";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
