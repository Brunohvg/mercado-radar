import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const notificationSchema = z.object({
  _id: z.string().optional(),
  resource: z.string().min(1),
  user_id: z.union([z.string(), z.number()]),
  topic: z.string().min(1),
  application_id: z.union([z.string(), z.number()]).optional(),
  attempts: z.coerce.number().int().positive().optional(),
  sent: z.string().optional(),
  received: z.string().optional(),
}).passthrough();

function dateOrNull(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "mercado-radar",
    webhook: "mercadolivre",
  });
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = notificationSchema.safeParse(payload);

    // Mercado Livre recomenda responder rapidamente. Payloads inválidos
    // não devem derrubar o endpoint nem gerar loop de retry.
    if (!parsed.success) {
      console.warn("Invalid Mercado Livre notification", parsed.error.flatten());
      return NextResponse.json({ ok: true, accepted: false });
    }

    const event = parsed.data;
    const externalId =
      event._id ??
      `${String(event.application_id ?? "app")}:${event.topic}:${event.resource}:${event.sent ?? ""}`;

    const configuredAppId = process.env.MERCADO_LIVRE_CLIENT_ID;
    if (
      configuredAppId &&
      event.application_id != null &&
      String(event.application_id) !== configuredAppId
    ) {
      console.warn("Ignoring Mercado Livre notification for another application");
      return NextResponse.json({ ok: true, accepted: false });
    }

    await prisma.mercadoLivreNotification.upsert({
      where: { externalId },
      update: {
        attempts: event.attempts ?? 1,
        receivedAt: dateOrNull(event.received),
        payload,
      },
      create: {
        externalId,
        topic: event.topic,
        resource: event.resource,
        userId: String(event.user_id),
        applicationId:
          event.application_id == null ? null : String(event.application_id),
        attempts: event.attempts ?? 1,
        sentAt: dateOrNull(event.sent),
        receivedAt: dateOrNull(event.received),
        payload,
      },
    });

    return NextResponse.json({ ok: true, accepted: true });
  } catch (error) {
    console.error("Mercado Livre webhook persistence failed", error);

    // O ML tentará reenviar em falhas; aqui devolvemos 500 para não perder
    // notificações quando o banco estiver temporariamente indisponível.
    return NextResponse.json(
      { ok: false, error: "notification_persistence_failed" },
      { status: 500 },
    );
  }
}
