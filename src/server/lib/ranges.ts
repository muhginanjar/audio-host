export interface ByteSlice {
  start: number;
  end: number; // inclusive
}

export type RangeResult =
  | { mode: "full" }
  | { mode: "partial"; slice: ByteSlice }
  | { mode: "unsatisfiable" };

/**
 * Parses a single-range `Range: bytes=...` header against a known size.
 * Multi-range requests are ignored (treated as full) per RFC 9110 allowance;
 * suffix ranges count from the end; clamp to size-1.
 */
export function parseRange(header: string | undefined | null, size: number): RangeResult {
  if (!header) return { mode: "full" };
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return { mode: "full" };
  if (size === 0) return { mode: "unsatisfiable" };

  let start: number;
  let end: number;
  if (m[1] === "") {
    const suffix = Number(m[2]);
    if (suffix === 0) return { mode: "unsatisfiable" };
    start = Math.max(0, size - Math.min(suffix, size));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
    if (start >= size || start > end) return { mode: "unsatisfiable" };
  }
  return { mode: "partial", slice: { start, end } };
}
