import { describe, it, expect } from "vitest";
import { prisma } from "../src/db/client.js";
import { createInvite, acceptInvite, cancelInvite, InviteError } from "../src/services/inviteService.js";
import { FightError } from "../src/services/fightService.js";
import { makeUserWithCharacter } from "./testUtils.js";

describe("inviteService", () => {
  it("creates an invite and lets a different player accept it, starting a fight", async () => {
    const a = await makeUserWithCharacter();
    const b = await makeUserWithCharacter();

    const invite = await createInvite(a.user.id, a.userCharacter.id);
    expect(invite.status).toBe("PENDING");

    const fight = await acceptInvite(invite.code, b.user.id, b.userCharacter.id);
    expect(["PLAYER_1_TURN", "PLAYER_2_TURN"]).toContain(fight.state);

    const stored = await prisma.fightInvite.findUniqueOrThrow({ where: { id: invite.id } });
    expect(stored.status).toBe("ACCEPTED");
    expect(stored.fightId).toBe(fight.id);
  });

  it("rejects the creator accepting their own invite", async () => {
    const a = await makeUserWithCharacter();
    const invite = await createInvite(a.user.id, a.userCharacter.id);
    await expect(acceptInvite(invite.code, a.user.id, a.userCharacter.id)).rejects.toBeInstanceOf(InviteError);
  });

  it("rejects an unknown invite code", async () => {
    const b = await makeUserWithCharacter();
    await expect(acceptInvite("does-not-exist", b.user.id, b.userCharacter.id)).rejects.toBeInstanceOf(InviteError);
  });

  it("cannot be used twice", async () => {
    const a = await makeUserWithCharacter();
    const b = await makeUserWithCharacter();
    const c = await makeUserWithCharacter();

    const invite = await createInvite(a.user.id, a.userCharacter.id);
    await acceptInvite(invite.code, b.user.id, b.userCharacter.id);

    await expect(acceptInvite(invite.code, c.user.id, c.userCharacter.id)).rejects.toBeInstanceOf(InviteError);
  });

  it("rejects an expired invite", async () => {
    const a = await makeUserWithCharacter();
    const b = await makeUserWithCharacter();
    const invite = await createInvite(a.user.id, a.userCharacter.id);
    await prisma.fightInvite.update({ where: { id: invite.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    await expect(acceptInvite(invite.code, b.user.id, b.userCharacter.id)).rejects.toBeInstanceOf(InviteError);
  });

  it("wraps fight-creation failures (e.g. accepter already in a fight) as InviteError", async () => {
    const a = await makeUserWithCharacter();
    const b = await makeUserWithCharacter();
    const busy = await makeUserWithCharacter();

    // Put `busy` into an active fight first via a second invite.
    const otherInvite = await createInvite(b.user.id, b.userCharacter.id);
    const { createFriendFight } = await import("../src/services/fightService.js");
    await createFriendFight(busy.user.id, b.user.id, busy.userCharacter.id, b.userCharacter.id);
    void otherInvite; // unused now that b already has an active fight from the direct call above

    const invite = await createInvite(a.user.id, a.userCharacter.id);
    await expect(acceptInvite(invite.code, busy.user.id, busy.userCharacter.id)).rejects.toBeInstanceOf(InviteError);
  });

  it("lets the creator cancel their own pending invite, after which it can't be accepted", async () => {
    const a = await makeUserWithCharacter();
    const b = await makeUserWithCharacter();
    const invite = await createInvite(a.user.id, a.userCharacter.id);

    const cancelled = await cancelInvite(a.user.id, invite.code);
    expect(cancelled.status).toBe("CANCELLED");

    await expect(acceptInvite(invite.code, b.user.id, b.userCharacter.id)).rejects.toBeInstanceOf(InviteError);
  });

  it("rejects cancelling someone else's invite", async () => {
    const a = await makeUserWithCharacter();
    const b = await makeUserWithCharacter();
    const invite = await createInvite(a.user.id, a.userCharacter.id);
    await expect(cancelInvite(b.user.id, invite.code)).rejects.toBeInstanceOf(InviteError);
  });

  it("rejects cancelling an invite that was already accepted", async () => {
    const a = await makeUserWithCharacter();
    const b = await makeUserWithCharacter();
    const invite = await createInvite(a.user.id, a.userCharacter.id);
    await acceptInvite(invite.code, b.user.id, b.userCharacter.id);
    await expect(cancelInvite(a.user.id, invite.code)).rejects.toBeInstanceOf(InviteError);
  });
});

describe("fightService ownership guard", () => {
  it("rejects starting a fight with a character you don't own", async () => {
    const owner = await makeUserWithCharacter();
    const attacker = await makeUserWithCharacter();
    const { createFriendFight } = await import("../src/services/fightService.js");
    await expect(
      createFriendFight(attacker.user.id, owner.user.id, owner.userCharacter.id, owner.userCharacter.id)
    ).rejects.toBeInstanceOf(FightError);
  });
});
