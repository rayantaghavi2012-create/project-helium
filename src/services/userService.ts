import { prisma } from "../db/client.js";

export async function getOrCreateUser(telegramId: string, username?: string, displayName?: string) {
  const existing = await prisma.user.findUnique({ where: { telegramId } });
  if (existing) return existing;

  try {
    return await prisma.user.create({
      data: { telegramId, username, displayName },
    });
  } catch {
    // Concurrent creation race — the unique constraint on telegramId lost, fetch the winner.
    return prisma.user.findUniqueOrThrow({ where: { telegramId } });
  }
}
