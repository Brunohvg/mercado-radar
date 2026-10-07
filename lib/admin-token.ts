/**
 * Sessão do operador do painel web.
 *
 * Usa apenas Web Crypto (HMAC-SHA256) para funcionar tanto no proxy.ts
 * quanto nas rotas Node. Formato do token: base64url(payload).base64url(hmac)
 */
export const ADMIN_COOKIE = "radar_admin";
export const ADMIN_SESSION_SECONDS = 7 * 24 * 60 * 60;

const encoder = new TextEncoder();

/**
 * Segredo que assina o cookie. Usa ADMIN_SESSION_SECRET; se ausente, cai em
 * APP_ENCRYPTION_KEY (já exigida pelo app), para não trancar quem já configurou
 * só o login. Retorna "" se nenhum tiver >= 32 caracteres.
 */
export function adminSessionSecret() {
  const explicit = process.env.ADMIN_SESSION_SECRET?.trim() ?? "";
  if (explicit.length >= 32) return explicit;
  const fallback = process.env.APP_ENCRYPTION_KEY?.trim() ?? "";
  return fallback.length >= 32 ? fallback : "";
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function fromBase64Url(value: string) {
  const padded =
    value.replaceAll("-", "+").replaceAll("_", "/") +
    "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signAdminSession(secret: string, now = Date.now()) {
  const payload = toBase64Url(
    encoder.encode(
      JSON.stringify({
        v: 1,
        exp: Math.floor(now / 1000) + ADMIN_SESSION_SECONDS,
      }),
    ),
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    encoder.encode(payload),
  );

  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifyAdminSession(
  token: string | undefined | null,
  secret: string,
  now = Date.now(),
) {
  if (!token || !secret) return false;

  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return false;

  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      fromBase64Url(signature),
      encoder.encode(payload),
    );
    if (!valid) return false;

    const data = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as {
      v?: number;
      exp?: number;
    };

    return data.v === 1 && typeof data.exp === "number" && data.exp * 1000 > now;
  } catch {
    return false;
  }
}
