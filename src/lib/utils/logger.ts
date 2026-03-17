type LogLevel = "debug" | "info" | "warn" | "error";

const weight: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const configured = (process.env.LOG_LEVEL as LogLevel | undefined) ?? "info";

function canLog(level: LogLevel): boolean {
  return weight[level] >= weight[configured];
}

function write(level: LogLevel, message: string, context?: Record<string, unknown>) {
  if (!canLog(level)) {
    return;
  }

  const payload = {
    level,
    timestamp: new Date().toISOString(),
    message,
    context,
  };

  // Structured JSON logs are easier to aggregate in hosted environments.
  console.log(JSON.stringify(payload));
}

export const logger = {
  debug(message: string, context?: Record<string, unknown>) {
    write("debug", message, context);
  },
  info(message: string, context?: Record<string, unknown>) {
    write("info", message, context);
  },
  warn(message: string, context?: Record<string, unknown>) {
    write("warn", message, context);
  },
  error(message: string, context?: Record<string, unknown>) {
    write("error", message, context);
  },
};
