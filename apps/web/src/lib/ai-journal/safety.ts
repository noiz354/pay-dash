export const UNSAFE_PROMPT_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /reveal\s+(the\s+)?(system\s+)?prompt/i,
  /show\s+(me\s+)?(the\s+)?(api\s+key|secret|token|service\s+account)/i,
  /print\s+(the\s+)?(api\s+key|secret|token|service\s+account)/i,
  /another\s+user'?s\s+(journal|history|data)/i,
  /mark\s+.*successful/i,
  /retry\s+all\s+failed\s+payments\s+automatically/i,
];

export function detectUnsafePromptIntent(text: string): string[] {
  const findings: string[] = [];
  for (const pattern of UNSAFE_PROMPT_PATTERNS) {
    if (pattern.test(text)) findings.push(pattern.source);
  }
  return findings;
}

export function hasUnsafePromptIntent(text: string): boolean {
  return detectUnsafePromptIntent(text).length > 0;
}

export function redactSensitiveText(text: string): string {
  let customerIndex = 0;
  const customerMap = new Map<string, string>();

  function aliasFor(value: string) {
    const key = value.toLowerCase();
    const existing = customerMap.get(key);
    if (existing) return existing;
    customerIndex += 1;
    const alias = `Customer ${String.fromCharCode(64 + Math.min(customerIndex, 26))}`;
    customerMap.set(key, alias);
    return alias;
  }

  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<redacted-email>")
    .replace(/\b(?:Sarah Chen|Acme Corp|Budi Santoso|Nadia Rahman|Globex Retail|Kevin Tan|Warung Kopi Nusantara|Initech BV)\b/g, (match) => aliasFor(match))
    .replace(/\b(Visa|Mastercard|Amex)\s+••••\s+\d{4}\b/g, (_match, brand: string) => `${brand} •••• <redacted>`)
    .replace(/\b(ACH)\s+••••\s+\d{4}\b/g, (_match, brand: string) => `${brand} •••• <redacted>`);
}

export function copySafeText(text: string, redact: boolean): string {
  return redact ? redactSensitiveText(text) : text;
}
