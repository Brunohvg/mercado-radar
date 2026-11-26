import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, verifyPassword } from "@/lib/workspace-auth";
import {
  hashPassword,
  clientIp,
  loginBlocked,
  registerLoginFailure,
} from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { ADMIN_COOKIE } from "@/lib/admin-token";
export async function POST(request: Request) {
  const user = await requireUser();
  if (user.isOperator)
    return NextResponse.json(
      { error: "A senha do operador é administrada no servidor." },
      { status: 403 },
    );
  const ip = clientIp(request);
  if (loginBlocked(ip))
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde e tente novamente." },
      { status: 429 },
    );
  const parsed = z
    .object({
      currentPassword: z.string().min(1).max(200),
      password: z.string().min(12).max(200),
    })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "A nova senha deve ter pelo menos 12 caracteres." },
      { status: 400 },
    );
  if (
    !user.passwordHash ||
    !(await verifyPassword(parsed.data.currentPassword, user.passwordHash))
  ) {
    registerLoginFailure(ip);
    return NextResponse.json(
      { error: "Senha atual inválida." },
      { status: 401 },
    );
  }
  await prisma.$transaction([
    prisma.radarUser.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(parsed.data.password) },
    }),
    prisma.radarUserSession.deleteMany({ where: { userId: user.id } }),
    prisma.radarExtensionAccess.updateMany({
      where: { account: { workspaceId: user.workspaceId } },
      data: { revokedAt: new Date() },
    }),
  ]);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, "", {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
  });
  return response;
}
