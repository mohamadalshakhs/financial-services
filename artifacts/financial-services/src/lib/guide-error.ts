export type GuideError =
  | "rate"
  | "daily"
  | "usage"
  | "protection"
  | "timeout"
  | "network"
  | "generic";

export function classifyGuideError(err: unknown): GuideError {
  const error = err as { status?: unknown; data?: { error?: unknown } } | null;
  if (error?.status === 429) {
    if (error.data?.error === "DAILY_LIMIT_REACHED") return "daily";
    if (error.data?.error === "USAGE_LIMIT_REACHED") return "usage";
    return "rate";
  }
  if (error?.status === 503 &&
      error.data?.error === "USAGE_PROTECTION_UNAVAILABLE") return "protection";
  if (error?.status === 504 || error?.status === 408) return "timeout";
  if (typeof error?.status !== "number") return "network";
  return "generic";
}
