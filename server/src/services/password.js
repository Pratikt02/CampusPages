import argon2 from 'argon2';

const OPTS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }; // OWASP minimum profile
export const hashPassword = (pw) => argon2.hash(pw, OPTS);
export const verifyPassword = (hash, pw) => argon2.verify(hash, pw).catch(() => false);

// Verified against when the email is unknown, so response time doesn't reveal account existence.
let dummy;
export async function dummyVerify(pw) {
  dummy ??= await hashPassword('campuspages-dummy-password');
  await verifyPassword(dummy, pw);
}
export const validatePasswordPolicy = (pw) =>
  typeof pw === 'string' && pw.length >= 10 && pw.length <= 128;
