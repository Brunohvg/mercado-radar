import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { adminSessionSecret } from "@/lib/admin-token";

/**
 * Credenciais do operador (painel web single-tenant).
 *
 * ADMIN_EMAIL            e-mail de login
 * ADMIN_PASSWORD_HASH    gerado por `node scripts/hash-password.mjs`
 *                        formato: scrypt:<salt base64url>:<hash base64url>
 *                        (sem '$' de propósito: Docker Compose/Coolify interpolam '$')
 * ADMIN_SESSION_SECRET   segredo (>= 32 caracteres) que assina o cookie
 */
const KEY_LENGTH = 64;
const MIN_SECRET_LENGTH = 32;

const BCRYPT_PREFIX = /^\$2[aby]\$/;

function isSupportedHash(hash: string) {
  return hash.startsWith("scrypt:") || BCRYPT_PREFIX.test(hash);
}

async function verifyBcrypt(password: string, hash: string) {
  // Compatibilidade com hashes bcrypt já configurados. Carrega sob demanda.
  const bcrypt = await import("bcryptjs");
  return bcrypt.compare(password, hash);
}

export function adminAuthConfig() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? "";
  const passwordHash = process.env.ADMIN_PASSWORD_HASH?.trim() ?? "";
  const secret = adminSessionSecret();

  return {
    email,
    passwordHash,
    secret,
    configured:
      Boolean(email) &&
      isSupportedHash(passwordHash) &&
      secret.length >= MIN_SECRET_LENGTH,
  };
}

function scryptAsync(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt);
  return `scrypt:${salt.toString("base64url")}:${derived.toString("base64url")}`;
}

export async function verifyAdminCredentials(email: string, password: string) {
  const config = adminAuthConfig();
  if (!config.configured) return false;

  if (BCRYPT_PREFIX.test(config.passwordHash)) {
    const passwordOk = await verifyBcrypt(password, config.passwordHash);
    const emailOk = email.trim().toLowerCase() === config.email;
    return passwordOk && emailOk;
  }

  const [, saltRaw, hashRaw] = config.passwordHash.split(":");
  if (!saltRaw || !hashRaw) return false;

  // Sempre calcula o scrypt, mesmo com e-mail errado, para não vazar por tempo.
  const derived = await scryptAsync(password, Buffer.from(saltRaw, "base64url"));
  const expected = Buffer.from(hashRaw, "base64url");

  const passwordOk =
    derived.length === expected.length && timingSafeEqual(derived, expected);
  const emailOk = email.trim().toLowerCase() === config.email;

  return passwordOk && emailOk;
}

/* ---------- limite de tentativas (memória do processo) ---------- */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_IP = 5;
const MAX_GLOBAL = 30;

const failures = new Map<string, { count: number; resetAt: number }>();

function bump(key: string, now: number) {
  const current = failures.get(key);
  if (!current || current.resetAt <= now) {
    failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  current.count += 1;
}

export function loginBlocked(ip: string, now = Date.now()) {
  const byIp = failures.get(ip);
  const global = failures.get("*");
  return (
    (byIp && byIp.resetAt > now && byIp.count >= MAX_PER_IP) ||
    (global && global.resetAt > now && global.count >= MAX_GLOBAL)
  );
}

export function registerLoginFailure(ip: string, now = Date.now()) {
  bump(ip, now);
  bump("*", now);
}

export function clearLoginFailures(ip: string) {
  failures.delete(ip);
}

export function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
