import { cookies } from "next/headers";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sha256UrlSafe } from "@/lib/security";
import { ADMIN_COOKIE, ADMIN_SESSION_SECONDS } from "@/lib/admin-token";

export async function verifyPassword(password: string, hash: string) {
  if (/^\$2[aby]\$/.test(hash)) {
    return (await import("bcryptjs")).compare(password, hash);
  }
  const [version, salt, digest, extra] = hash.split(":");
  if (version !== "scrypt" || !salt || !digest || extra) return false;
  const expected = Buffer.from(digest, "base64url");
  if (expected.length !== 64) return false;
  const actual = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, Buffer.from(salt, "base64url"), 64, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
  return timingSafeEqual(actual, expected);
}

export async function getUserSession(token?: string | null) {
  const value =
    token === undefined ? (await cookies()).get(ADMIN_COOKIE)?.value : token;
  if (!value || !/^[A-Za-z0-9_-]{64}$/.test(value)) return null;
  const session = await prisma.radarUserSession.findUnique({
    where: { tokenHash: sha256UrlSafe(value) },
    include: { user: { include: { workspace: true } } },
  });
  if (
    !session ||
    session.expiresAt.getTime() <= Date.now() ||
    !session.user.active ||
    !session.user.workspace.active
  )
    return null;
  return session.user;
}

export async function requireUser() {
  const user = await getUserSession();
  if (!user)
    throw new Error("Sessão expirada. Entre novamente no Mercado Radar.");
  return user;
}

export async function getWorkspaceId() {
  return (await requireUser()).workspaceId;
}

export async function createUserSession(userId: string) {
  const token = randomBytes(48).toString("base64url");
  await prisma.radarUserSession.create({
    data: {
      tokenHash: sha256UrlSafe(token),
      userId,
      expiresAt: new Date(Date.now() + ADMIN_SESSION_SECONDS * 1000),
    },
  });
  return token;
}

export async function revokeUserSession() {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (token)
    await prisma.radarUserSession.deleteMany({
      where: { tokenHash: sha256UrlSafe(token) },
    });
}
