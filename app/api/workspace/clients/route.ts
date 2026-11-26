import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/workspace-auth";
import { hashPassword } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const createSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(12).max(200),
  dailyRequestLimit: z.number().int().min(50).max(50000).default(500),
});
export async function GET() {
  if (!(await requireUser()).isOperator)
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  const clients = await prisma.radarUser.findMany({
    where: { isOperator: false },
    select: {
      id: true,
      email: true,
      active: true,
      createdAt: true,
      workspace: {
        select: {
          name: true,
          plan: true,
          dailyRequestLimit: true,
          active: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ clients });
}
export async function POST(request: Request) {
  if (!(await requireUser()).isOperator)
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      {
        error:
          "Informe nome, e-mail válido e senha de pelo menos 12 caracteres.",
      },
      { status: 400 },
    );
  const { email, password, name, dailyRequestLimit } = parsed.data;
  try {
    const passwordHash = await hashPassword(password);
    const user = await prisma.radarUser.create({
      data: {
        email,
        passwordHash,
        workspace: {
          create: { name, dailyRequestLimit, settings: { create: {} } },
        },
      },
      select: { id: true, email: true },
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002")
      return NextResponse.json(
        { error: "Este e-mail já possui acesso." },
        { status: 409 },
      );
    return NextResponse.json(
      { error: "Não foi possível criar o acesso." },
      { status: 500 },
    );
  }
}
export async function PATCH(request: Request) {
  if (!(await requireUser()).isOperator)
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  const parsed = z
    .object({
      id: z.string(),
      active: z.boolean(),
      password: z.string().min(12).max(200).optional(),
    })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  const client = await prisma.radarUser.findFirst({
    where: { id: parsed.data.id, isOperator: false },
  });
  if (!client)
    return NextResponse.json(
      { error: "Cliente não encontrado." },
      { status: 404 },
    );
  await prisma.$transaction([
    prisma.radarUser.update({
      where: { id: client.id },
      data: {
        active: parsed.data.active,
        ...(parsed.data.password
          ? { passwordHash: await hashPassword(parsed.data.password) }
          : {}),
      },
    }),
    prisma.radarWorkspace.update({
      where: { id: client.workspaceId },
      data: { active: parsed.data.active },
    }),
    prisma.radarUserSession.deleteMany({ where: { userId: client.id } }),
    prisma.radarExtensionAccess.updateMany({
      where: { account: { workspaceId: client.workspaceId } },
      data: { revokedAt: new Date() },
    }),
  ]);
  return NextResponse.json({ ok: true });
}
