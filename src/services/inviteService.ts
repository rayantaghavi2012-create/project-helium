import { randomBytes } from "node:crypto";
import { prisma } from "../db/client.js";
import { createFriendFight, FightError } from "./fightService.js";

export class InviteError extends Error {}

const INVITE_TTL_MS = 15 * 60 * 1000;

export async function createInvite(creatorId: string, creatorCharacterId: string) {
  const active = await prisma.fightInvite.findFirst({
    where: { creatorId, status: "PENDING", expiresAt: { gt: new Date() } },
  });
  if (active) return active;

  const code = randomBytes(6).toString("hex");
  return prisma.fightInvite.create({
    data: {
      code,
      creatorId,
      creatorCharacterId,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
  });
}

/** Accepting an invite is idempotent/exclusive via a conditional update — only one accept can win the race. */
export async function acceptInvite(code: string, accepterId: string, accepterCharacterId: string) {
  const invite = await prisma.fightInvite.findUnique({ where: { code } });
  if (!invite) throw new InviteError("This invite doesn't exist.");
  if (invite.status !== "PENDING") throw new InviteError("This invite has already been used or cancelled.");
  if (invite.expiresAt < new Date()) {
    await prisma.fightInvite.update({ where: { id: invite.id }, data: { status: "EXPIRED" } }).catch(() => {});
    throw new InviteError("This invite has expired.");
  }
  if (invite.creatorId === accepterId) throw new InviteError("You cannot accept your own invite.");

  const claim = await prisma.fightInvite.updateMany({
    where: { id: invite.id, status: "PENDING" },
    data: { status: "ACCEPTED" },
  });
  if (claim.count === 0) throw new InviteError("This invite was just claimed by someone else.");

  try {
    const fight = await createFriendFight(invite.creatorId, accepterId, invite.creatorCharacterId, accepterCharacterId);
    await prisma.fightInvite.update({ where: { id: invite.id }, data: { fightId: fight.id } });
    return fight;
  } catch (err) {
    // Roll the invite back to PENDING isn't safe (creator/accepter may already have another fight);
    // mark it cancelled instead so it can't be retried in a broken state.
    await prisma.fightInvite.update({ where: { id: invite.id }, data: { status: "CANCELLED" } }).catch(() => {});
    if (err instanceof FightError) throw new InviteError(err.message);
    throw err;
  }
}

export async function cancelInvite(creatorId: string, code: string) {
  const invite = await prisma.fightInvite.findUnique({ where: { code } });
  if (!invite) throw new InviteError("This invite doesn't exist.");
  if (invite.creatorId !== creatorId) throw new InviteError("You can only cancel your own invite.");
  if (invite.status !== "PENDING") throw new InviteError("This invite is no longer pending.");

  const claim = await prisma.fightInvite.updateMany({
    where: { id: invite.id, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
  if (claim.count === 0) throw new InviteError("This invite was just accepted or already resolved.");

  return prisma.fightInvite.findUniqueOrThrow({ where: { id: invite.id } });
}

export async function cancelExpiredInvites() {
  await prisma.fightInvite.updateMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
}
