import { prisma } from "@/lib/prisma";

export async function getWorkspaceSettings(workspaceId: string) {
  return prisma.appSettings.upsert({
    where: { id: workspaceId },
    update: {},
    create: { id: workspaceId },
  });
}
