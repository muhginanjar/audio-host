/** Strict ULID shape (Crockford base32, no ambiguous chars) — traversal-proof URL ids. Used by media routes + storage driver joins. */
export const ID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
