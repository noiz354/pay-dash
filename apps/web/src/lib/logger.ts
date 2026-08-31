import pino from "pino";
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  // ponytail: pino only, no transport in prod — swappable to loki/otel later
});
