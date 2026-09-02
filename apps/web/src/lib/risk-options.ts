// Client-safe risk vocabulary (ADR-0023) — the store lives behind
// `server-only`, so thresholds shared with client components live here.

/** Ledger transactions scoring at or above this are high-risk alerts. */
export const HIGH_RISK_SCORE = 60;

/** Daily-cap usage at or above this (percent) raises a volume alert. */
export const VOLUME_ALERT_PCT = 75;
