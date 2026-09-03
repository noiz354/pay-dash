export type RepositoryErrorCode =
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_TOPOLOGY"
  | "STALE_VERSION";

export class RepositoryError extends Error {
  constructor(
    readonly code: RepositoryErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "RepositoryError";
  }
}
