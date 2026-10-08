import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { randomUrlSafe, sha256UrlSafe } from "@/lib/security";
import { getMlSessionForAccount } from "@/lib/mercado-livre";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_DAYS = 30;

type ExtensionAccessPayload = {
  v: 1;
  accessId: string;
  accountId: string;
  deviceId: string;
  iat: number;
  exp: number;
};

function signingKey() {
  const key =
    process.env.RADAR_EXTENSION_SIGNING_KEY?.trim() ||
    process.env.APP_ENCRYPTION_KEY?.trim();

  if (!key) {
    throw new Error(
      "RADAR_EXTENSION_SIGNING_KEY ou APP_ENCRYPTION_KEY não configurada.",
    );
  }

  return key;
}

function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function sign(value: string) {
  return createHmac("sha256", signingKey())
    .update(value)
    .digest("base64url");
}

function issueAccessToken(input: {
  accessId: string;
  accountId: string;
  deviceId: string;
}) {
  const now = Math.floor(Date.now() / 1000);
  const payload: ExtensionAccessPayload = {
    v: 1,
    accessId: input.accessId,
    accountId: input.accountId,
    deviceId: input.deviceId,
    iat: now,
    exp: now + ACCESS_TOKEN_TTL_SECONDS,
  };

  const body = encode(payload);
  return {
    token: `radar.v1.${body}.${sign(body)}`,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
}

function verifyAccessToken(token: string): ExtensionAccessPayload | null {
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "radar" || parts[1] !== "v1") {
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
    ) as ExtensionAccessPayload;

    if (
      payload.v !== 1 ||
      !payload.accessId ||
      !payload.accountId ||
      !payload.deviceId ||
      !payload.exp ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function bearer(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";
}

function utcDay() {
  const value = new Date();
  value.setUTCHours(0, 0, 0, 0);
  return value;
}

export async function createExtensionAuthorizationCode(input: {
  mercadoLivreAccountId: string;
  codeChallenge: string;
  redirectUri: string;
  deviceId: string;
  deviceName?: string | null;
}) {
  const code = randomUrlSafe(40);

  await prisma.radarExtensionAuthCode.create({
    data: {
      codeHash: sha256UrlSafe(code),
      mercadoLivreAccountId: input.mercadoLivreAccountId,
      codeChallenge: input.codeChallenge,
      redirectUri: input.redirectUri,
      deviceId: input.deviceId,
      deviceName: input.deviceName ?? null,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  });

  return code;
}

export async function exchangeExtensionAuthorizationCode(input: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}) {
  const codeHash = sha256UrlSafe(input.code);
  const authCode = await prisma.radarExtensionAuthCode.findUnique({
    where: { codeHash },
  });

  if (
    !authCode ||
    authCode.consumedAt ||
    authCode.expiresAt.getTime() <= Date.now() ||
    authCode.redirectUri !== input.redirectUri ||
    sha256UrlSafe(input.codeVerifier) !== authCode.codeChallenge
  ) {
    return null;
  }

  const refreshToken = randomUrlSafe(48);
  const refreshTokenHash = sha256UrlSafe(refreshToken);
  const refreshExpiresAt = new Date(
    Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  const access = await prisma.$transaction(async (tx) => {
    const updated = await tx.radarExtensionAccess.upsert({
      where: {
        mercadoLivreAccountId_deviceId: {
          mercadoLivreAccountId: authCode.mercadoLivreAccountId,
          deviceId: authCode.deviceId,
        },
      },
      update: {
        name: authCode.deviceName || "Chrome",
        tokenHash: refreshTokenHash,
        expiresAt: refreshExpiresAt,
        revokedAt: null,
        lastUsedAt: new Date(),
      },
      create: {
        mercadoLivreAccountId: authCode.mercadoLivreAccountId,
        deviceId: authCode.deviceId,
        name: authCode.deviceName || "Chrome",
        tokenHash: refreshTokenHash,
        expiresAt: refreshExpiresAt,
        plan: "PRO",
        dailyRequestLimit: 5000,
        capabilities: {
          analytics: true,
          profitability: true,
          market: true,
          monitoring: true,
        },
      },
    });

    await tx.radarExtensionAuthCode.update({
      where: { id: authCode.id },
      data: { consumedAt: new Date() },
    });

    return updated;
  });

  const accessToken = issueAccessToken({
    accessId: access.id,
    accountId: access.mercadoLivreAccountId,
    deviceId: access.deviceId,
  });

  return {
    accessToken: accessToken.token,
    accessTokenExpiresIn: accessToken.expiresIn,
    refreshToken,
    refreshTokenExpiresIn:
      REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
    plan: access.plan,
  };
}

export async function refreshExtensionSession(input: {
  refreshToken: string;
  deviceId: string;
}) {
  const tokenHash = sha256UrlSafe(input.refreshToken);
  const access = await prisma.radarExtensionAccess.findUnique({
    where: { tokenHash },
  });

  if (
    !access ||
    access.revokedAt ||
    access.deviceId !== input.deviceId ||
    (access.expiresAt && access.expiresAt.getTime() <= Date.now())
  ) {
    return null;
  }

  const nextRefreshToken = randomUrlSafe(48);
  const nextHash = sha256UrlSafe(nextRefreshToken);
  const nextExpiry = new Date(
    Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  const updated = await prisma.radarExtensionAccess.update({
    where: { id: access.id },
    data: {
      tokenHash: nextHash,
      expiresAt: nextExpiry,
      lastUsedAt: new Date(),
    },
  });

  const accessToken = issueAccessToken({
    accessId: updated.id,
    accountId: updated.mercadoLivreAccountId,
    deviceId: updated.deviceId,
  });

  return {
    accessToken: accessToken.token,
    accessTokenExpiresIn: accessToken.expiresIn,
    refreshToken: nextRefreshToken,
    refreshTokenExpiresIn:
      REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
    plan: updated.plan,
  };
}

export async function revokeExtensionSession(request: Request) {
  const token = bearer(request);
  const payload = verifyAccessToken(token);
  if (!payload) return false;

  await prisma.radarExtensionAccess.updateMany({
    where: {
      id: payload.accessId,
      mercadoLivreAccountId: payload.accountId,
      deviceId: payload.deviceId,
    },
    data: { revokedAt: new Date() },
  });

  return true;
}

export async function getExtensionSession(request: Request) {
  const token = bearer(request);
  const payload = verifyAccessToken(token);
  if (!payload) return null;

  const access = await prisma.radarExtensionAccess.findUnique({
    where: { id: payload.accessId },
    include: {
      account: true,
    },
  });

  if (
    !access ||
    access.revokedAt ||
    access.mercadoLivreAccountId !== payload.accountId ||
    access.deviceId !== payload.deviceId ||
    (access.expiresAt && access.expiresAt.getTime() <= Date.now())
  ) {
    return null;
  }

  const usage = await prisma.radarExtensionUsage.upsert({
    where: {
      accessId_day: {
        accessId: access.id,
        day: utcDay(),
      },
    },
    update: {
      requests: { increment: 1 },
    },
    create: {
      accessId: access.id,
      day: utcDay(),
      requests: 1,
    },
  });

  if (usage.requests > access.dailyRequestLimit) {
    throw new Error("Limite diário da extensão atingido para este plano.");
  }

  await prisma.radarExtensionAccess.update({
    where: { id: access.id },
    data: { lastUsedAt: new Date() },
  });

  const ml = await getMlSessionForAccount(access.mercadoLivreAccountId);

  return {
    access,
    account: access.account,
    ml,
  };
}
