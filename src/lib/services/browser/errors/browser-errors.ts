type BrowserErrorCode =
  | "BROWSER_NOT_READY"
  | "SESSION_NOT_FOUND"
  | "PAGE_NOT_FOUND"
  | "DOMAIN_BLOCKED"
  | "ACTION_LIMIT_REACHED"
  | "CONFIRMATION_REJECTED"
  | "VALIDATION_FAILED"
  | "BROWSER_TOOL_ROUTE_ERROR"
  | "ACTION_FAILED";

export class BrowserServiceError extends Error {
  readonly code: BrowserErrorCode;
  readonly retriable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(options: {
    code: BrowserErrorCode;
    message: string;
    retriable?: boolean;
    details?: Record<string, unknown>;
  }) {
    super(options.message);
    this.name = "BrowserServiceError";
    this.code = options.code;
    this.retriable = options.retriable ?? false;
    this.details = options.details;
  }
}

export function toBrowserServiceError(error: unknown): BrowserServiceError {
  if (error instanceof BrowserServiceError) {
    return error;
  }

  if (error instanceof Error) {
    return new BrowserServiceError({
      code: "ACTION_FAILED",
      message: error.message,
      retriable: false,
    });
  }

  return new BrowserServiceError({
    code: "ACTION_FAILED",
    message: "Unknown browser action error",
    retriable: false,
    details: { rawError: String(error) },
  });
}
