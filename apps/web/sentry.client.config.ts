// Sentry init lives in `src/instrumentation-client.ts` (Next 15 canonical location).
// This file is kept to satisfy `withSentryConfig` import but must not double-init.
export const sentryClientConfigPlaceholder = true as const;
