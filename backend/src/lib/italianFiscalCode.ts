/**
 * Italian "codice fiscale" validation.
 *
 * Per Review 1.5 (2026-05-04): customer fiscal codes must be validated when
 * provided. We accept the standard 16-character person codice fiscale
 * (6 letters + 2 digits + 1 letter + 2 digits + 1 letter + 3 digits + 1 letter)
 * and verify the trailing checksum digit. Missing / empty codes are allowed
 * (they're optional at customer-create time per the spec).
 *
 * Algorithm reference: D.M. 12 marzo 1974, art. 2. The 15th character is
 * computed by summing pre-table values for odd positions and even positions
 * (1-indexed), modulo 26, mapped to A–Z.
 *
 * The 11-digit company VAT (partita IVA) is intentionally NOT covered here —
 * customers in this app are always individuals.
 */

const CF_RE = /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/;

const ODD: Record<string, number> = {
  "0": 1, "1": 0, "2": 5, "3": 7, "4": 9, "5": 13, "6": 15, "7": 17, "8": 19, "9": 21,
  A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18,
  N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
};

const EVEN: Record<string, number> = {
  "0": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, I: 8, J: 9, K: 10, L: 11, M: 12,
  N: 13, O: 14, P: 15, Q: 16, R: 17, S: 18, T: 19, U: 20, V: 21, W: 22, X: 23, Y: 24, Z: 25,
};

const CHECK_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Returns true if `code` is a syntactically valid Italian codice fiscale with
 * a correct checksum. An empty string returns true (the field is optional).
 */
export function isValidItalianFiscalCode(raw: string | null | undefined): boolean {
  if (!raw) return true;
  const code = raw.trim().toUpperCase();
  if (code.length === 0) return true;
  if (!CF_RE.test(code)) return false;

  let sum = 0;
  for (let i = 0; i < 15; i++) {
    const ch = code[i]!;
    // Position is 1-indexed in the official spec; ODD applies to chars at
    // odd positions (1, 3, 5, …), EVEN at even positions (2, 4, 6, …).
    sum += i % 2 === 0 ? ODD[ch]! : EVEN[ch]!;
  }
  const expected = CHECK_LETTERS[sum % 26];
  return code[15] === expected;
}

/** Same as the predicate but throws so it can be plugged into zod `.refine`. */
export function assertItalianFiscalCode(raw: string | null | undefined): void {
  if (!isValidItalianFiscalCode(raw)) {
    throw new Error("Invalid Italian fiscal code (codice fiscale)");
  }
}
