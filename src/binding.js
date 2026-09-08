/**
 * Inputs: a DB row or null, a raw cookie token or null, and injected SHA-256 hashFn.
 * Returns NEW for no row, OWNER for a cookie matching a non-null owner_token_hash,
 * or STRANGER for an existing row with a missing/wrong cookie or no owner hash.
 */
export function resolveTap(row, cookieToken, hashFn) {
  throw new Error("not implemented");
}

/**
 * Inputs: a DB row or null, a raw cookie token or null, and injected SHA-256 hashFn.
 * Returns true only for a cookie matching a non-null owner_token_hash.
 * Returns false for no row, no cookie, a wrong cookie, or no owner hash.
 */
export function canRename(row, cookieToken, hashFn) {
  throw new Error("not implemented");
}

/**
 * Inputs: a DB row or null, a user-typed code, and injected SHA-256 hashFn.
 * Uppercase the code and strip whitespace before hashing; return true on a hash match.
 * Return false for no row, no recovery hash, missing/non-string/empty code, or mismatch.
 */
export function verifyClaim(row, code, hashFn) {
  throw new Error("not implemented");
}
