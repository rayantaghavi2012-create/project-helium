import { prisma } from "../db/client.js";

/** UI/session state persisted on the User row so it survives a bot restart. */
export async function setSelectedCharacter(userId: string, userCharacterId: string) {
  await prisma.user.update({ where: { id: userId }, data: { selectedUserCharacterId: userCharacterId } });
}

export async function setAwaitingFriendUsername(userId: string, pendingCharacterId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { awaitingFriendUsername: true, pendingFriendCharacterId: pendingCharacterId },
  });
}

export async function clearAwaitingFriendUsername(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { awaitingFriendUsername: false, pendingFriendCharacterId: null },
  });
}
