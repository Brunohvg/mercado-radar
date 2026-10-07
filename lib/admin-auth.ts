import bcrypt from "bcryptjs";

type Attempt = {
  count: number;
  firstAt: number;
  blockedUntil: number | null;
};

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const BLOCK_MS = 15 * 60 * 1000;

const attempts = new Map<string, Attempt>();

function credentials() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const passwordHash = process.env.ADMIN_PASSWORD_HASH?.trim();

  if (!email || !passwordHash) {
    throw new Error(
      "ADMIN_EMAIL e ADMIN_PASSWORD_HASH precisam estar configurados.",
    );
  }

  return { email, passwordHash };
}

export function adminAuthConfigured() {
  return Boolean(
    process.env.ADMIN_EMAIL?.trim() &&
      process.env.ADMIN_PASSWORD_HASH?.trim() &&
      process.env.APP_ENCRYPTION_KEY?.trim(),
  );
}

export function loginAttemptKey(ip: string, email: string) {
  return `${ip || "unknown"}:${email.trim().toLowerCase()}`;
}

export function getLoginRateLimit(key: string) {
  const now = Date.now();
  const current = attempts.get(key);

  if (!current) {
    return { blocked: false, retryAfterSeconds: 0 };
  }

  if (current.blockedUntil && current.blockedUntil > now) {
    return {
      blocked: true,
      retryAfterSeconds: Math.ceil((current.blockedUntil - now) / 1000),
    };
  }

  if (now - current.firstAt > WINDOW_MS) {
    attempts.delete(key);
    return { blocked: false, retryAfterSeconds: 0 };
  }

  return { blocked: false, retryAfterSeconds: 0 };
}

export function registerLoginFailure(key: string) {
  const now = Date.now();
  const current = attempts.get(key);

  if (!current || now - current.firstAt > WINDOW_MS) {
    attempts.set(key, {
      count: 1,
      firstAt: now,
      blockedUntil: null,
    });
    return;
  }

  current.count += 1;
  if (current.count >= MAX_ATTEMPTS) {
    current.blockedUntil = now + BLOCK_MS;
  }
  attempts.set(key, current);
}

export function clearLoginFailures(key: string) {
  attempts.delete(key);
}

export async function verifyAdminCredentials(input: {
  email: string;
  password: string;
}) {
  const { email, passwordHash } = credentials();
  const candidateEmail = input.email.trim().toLowerCase();

  if (candidateEmail !== email) {
    return false;
  }

  if (!input.password || bcrypt.truncates(input.password)) {
    return false;
  }

  return bcrypt.compare(input.password, passwordHash);
}
