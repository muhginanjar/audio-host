/** Canonical storage format for every persisted timestamp: ISO-8601 UTC, second precision, "Z" suffix. */
export function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function isoFromMs(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Inclusive UTC day bounds as ISO strings, for `created_at` string comparisons. */
export function utcDayBounds(day: string): { start: string; end: string } {
  return { start: `${day}T00:00:00Z`, end: `${day}T23:59:59Z` };
}

export function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * 86400_000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Storage layout segment: audio/2026/09/28/ */
export function dateSegments(iso: string): { year: string; month: string; day: string } {
  return { year: iso.slice(0, 4), month: iso.slice(5, 7), day: iso.slice(8, 10) };
}
