/**
 * Structured Browser Logger
 * Follows the low-cardinality logging pattern for easy search and readability.
 */

type LogContext = Record<string, unknown>;

class Logger {
  info(context: LogContext, message: string) {
    console.log(`[INFO] ${message}`, context);
  }

  warn(context: LogContext, message: string) {
    console.warn(`[WARN] ${message}`, context);
  }

  error(context: LogContext, message: string) {
    console.error(`[ERROR] ${message}`, context);
  }

  debug(context: LogContext, message: string) {
    // We can conditionally disable this in production if needed
    console.debug(`[DEBUG] ${message}`, context);
  }
}

export const logger = new Logger();
