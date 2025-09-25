import crypto from "crypto";

/**
 * Create a random alphanumeric numeric OTP (length digits)
 */
export function genNumericOTP(n = 6) {
  const digits = "0123456789";
  let s = "";
  const buf = crypto.randomBytes(n);
  for (let i = 0; i < n; i++) s += digits[buf[i] % digits.length];
  return s;
}

/**
 * Hash input with random salt, return { salt, hash }
 */
export async function hashString(input) {
  // salt as base64
  const salt = crypto.randomBytes(16).toString("base64");
  const h = crypto.createHash("sha256").update(salt + input).digest("hex");
  return { salt, hash: h };
}

/**
 * Verify input + salt against expected hash
 */
export async function verifyHash(input, salt, expectedHash) {
  const h = crypto.createHash("sha256").update(salt + input).digest("hex");
  return h === expectedHash;
}
