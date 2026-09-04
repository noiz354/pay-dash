import "server-only";

/**
 * Server-side redaction helpers. These guarantee secrets, account numbers, and
 * PII never reach logs, error messages, audit payloads, or the client. They are
 * intentionally conservative: when in doubt, they remove the value entirely.
 */

const REDACTED = "[redacted]";

export function maskSecret(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.length === 0) {
    return null;
  }
  return REDACTED;
}

/** Mask everything but the last `visible` characters (e.g. account number). */
export function maskTail(value: string | null | undefined, visible = 4): string | null {
  if (value === null || value === undefined || value.length === 0) {
    return null;
  }
  if (value.length <= visible) {
    return REDACTED;
  }
  return `${"•".repeat(Math.max(1, value.length - visible))}${value.slice(-visible)}`;
}

export function maskIdentifier(value: string | null | undefined, visible = 5): string | null {
  return maskTail(value, visible);
}

export function maskEmail(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.length === 0) {
    return null;
  }
  const at = value.lastIndexOf("@");
  if (at <= 0) {
    return REDACTED;
  }
  const local = value.slice(0, at);
  const domain = value.slice(at);
  const keep = Math.max(1, Math.min(2, local.length));
  return `${local.slice(0, keep)}${"•".repeat(Math.max(1, local.length - keep))}${domain}`;
}

/** Mask every occurrence of a sensitive value inside a string. */
export function redactValueInText(text: string, secret: string): string {
  if (!secret) {
    return text;
  }
  return text.split(secret).join(REDACTED);
}

/**
 * Compose a loggable context by dropping keys that may carry secrets or other
 * sensitive values. Unknown/free-form keys are preserved only when their value
 * is already safe (string/number/boolean/null).
 */
export function safeLogContext(
  input: Record<string, unknown>,
  sensitiveKeys = ["secret", "authorization", "xendit_secret_key", "stripe_secret_key", "webhook_secret", "otp", "token"],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, valueRaw] of Object.entries(input)) {
    const lower = key.toLowerCase();
    const isSensitive = sensitiveKeys.some((s) => lower.includes(s));
    if (isSensitive) {
      out[key] = REDACTED;
      continue;
    }
    if (valueRaw === null || typeof valueRaw === "string" || typeof valueRaw === "number" || typeof valueRaw === "boolean") {
      out[key] = valueRaw;
    } else {
      out[key] = "[object]";
    }
  }
  return out;
}
