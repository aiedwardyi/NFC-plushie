/**
 * Inputs: a DB row or null, a raw cookie token or null, and injected SHA-256 hashFn.
 * Returns NEW for no row, OWNER for a cookie matching a non-null owner_token_hash,
 * or STRANGER for an existing row with a missing/wrong cookie or no owner hash.
 */
export function resolveTap(row, cookieToken, hashFn) {
  if (!row) return "NEW";
  return canRename(row, cookieToken, hashFn) ? "OWNER" : "STRANGER";
}

/**
 * Inputs: a DB row or null, a raw cookie token or null, and injected SHA-256 hashFn.
 * Returns true only for a cookie matching a non-null owner_token_hash.
 * Returns false for no row, no cookie, a wrong cookie, or no owner hash.
 */
export function canRename(row, cookieToken, hashFn) {
  return Boolean(row?.owner_token_hash && cookieToken && hashFn(cookieToken) === row.owner_token_hash);
}

/**
 * Inputs: a DB row or null, a user-typed code, and injected SHA-256 hashFn.
 * Uppercase the code and strip whitespace before hashing; return true on a hash match.
 * Return false for no row, no recovery hash, missing/non-string/empty code, or mismatch.
 */
export function verifyClaim(row, code, hashFn) {
  if (!row?.recovery_code_hash || typeof code !== "string") return false;
  const normalized = code.replace(/\s/g, "").toUpperCase();
  return Boolean(normalized && hashFn(normalized) === row.recovery_code_hash);
}
