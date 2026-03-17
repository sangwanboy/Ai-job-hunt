import { z } from "zod";
import type { BrowserToolInputMap, BrowserToolName } from "@/lib/services/browser/types/browser-types";
import { BrowserServiceError } from "@/lib/services/browser/errors/browser-errors";

const launchBrowserSchema = z
  .object({
    headless: z.boolean().optional(),
  })
  .strict();

const createSessionSchema = z
  .object({
    userId: z.string().min(1).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

const openPageSchema = z
  .object({
    sessionId: z.string().min(1),
  })
  .strict();

const navigateSchema = z
  .object({
    sessionId: z.string().min(1),
    url: z.string().url(),
    pageId: z.string().min(1).optional(),
  })
  .strict();

const clickSchema = z
  .object({
    sessionId: z.string().min(1),
    selector: z.string().min(1),
    pageId: z.string().min(1).optional(),
  })
  .strict();

const typeSchema = z
  .object({
    sessionId: z.string().min(1),
    selector: z.string().min(1),
    text: z.string().max(20_000),
    clearFirst: z.boolean().optional(),
    pageId: z.string().min(1).optional(),
  })
  .strict();

const scrollSchema = z
  .object({
    sessionId: z.string().min(1),
    x: z.number().int().optional(),
    y: z.number().int().optional(),
    pageId: z.string().min(1).optional(),
  })
  .strict();

const extractTextSchema = z
  .object({
    sessionId: z.string().min(1),
    selector: z.string().min(1).optional(),
    maxLength: z.number().int().positive().max(100_000).optional(),
    pageId: z.string().min(1).optional(),
  })
  .strict();

const screenshotSchema = z
  .object({
    sessionId: z.string().min(1),
    fileName: z.string().min(1).max(180).optional(),
    fullPage: z.boolean().optional(),
    pageId: z.string().min(1).optional(),
  })
  .strict();

const closeSessionSchema = z
  .object({
    sessionId: z.string().min(1),
  })
  .strict();

const schemaMap: { [K in BrowserToolName]: z.ZodType<BrowserToolInputMap[K]> } = {
  browser_launch_browser: launchBrowserSchema,
  browser_create_session: createSessionSchema,
  browser_open_session: createSessionSchema,
  browser_open_page: openPageSchema,
  browser_navigate: navigateSchema,
  browser_click: clickSchema,
  browser_type: typeSchema,
  browser_scroll: scrollSchema,
  browser_extract_text: extractTextSchema,
  browser_screenshot: screenshotSchema,
  browser_close_session: closeSessionSchema,
};

export function validateBrowserToolInput<K extends BrowserToolName>(
  tool: K,
  input: unknown,
): BrowserToolInputMap[K] {
  const parsed = schemaMap[tool].safeParse(input ?? {});
  if (!parsed.success) {
    throw new BrowserServiceError({
      code: "VALIDATION_FAILED",
      message: `Invalid input for ${tool}`,
      retriable: false,
      details: {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    });
  }
  return parsed.data;
}
