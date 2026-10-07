import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE = "radar_admin_session";
export const ADMIN_SESSION_MAX_AGE = 7 * 24 * 60 * 60;

export type AdminSessionPayload = {
  v: 1;
  email: string;
  accountId: string | null;
  iat: number;
  exp: number;
};

function signingKey() {
  const key = process.env.APP_ENCRYPTION_KEY?.trim();
  if (!key) {
    throw new Error("APP_ENCRYPTION_KEY não configurada.");
  }
  return key;
}

function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function sign(body: string) {
  return createHmac("sha256", signingKey()).update(body).digest("base64url");
}

export function createAdminSessionToken(input: {
  email: string;
  accountId: string | null;
}) {
  const now = Math.floor(Date.now() / 1000);
  const payload: AdminSessionPayload = {
    v: 1,
    email: input.email.toLowerCase(),
    accountId: input.accountId,
    iat: now,
    exp: now + ADMIN_SESSION_MAX_AGE,
  };

  const body = encode(payload);
  return `admin.v1.${body}.${sign(body)}`;
}

export function verifyAdminSessionToken(
  token: string | undefined | null,
): AdminSessionPayload | null {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "admin" || parts[1] !== "v1") {
    return null;
  }

  const body = parts[2];
  const signature = parts[3];
  const expected = sign(body);

  const left = Buffer.from(signature);
  const right = Buffer.from(expected);

  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as AdminSessionPayload;

    if (
      payload.v !== 1 ||
      !payload.email ||
      typeof payload.exp !== "number" ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
