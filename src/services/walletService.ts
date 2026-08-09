import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../db/client.js";

export class InsufficientBalanceError extends Error {
  constructor() {
    super("Insufficient Helium balance");
    this.name = "InsufficientBalanceError";
  }
}

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Credits or debits a user's Helium balance idempotently.
 * (userId, reason, refId) is unique — replaying the same call is a no-op
 * that returns the already-recorded transaction instead of double-applying it.
 */
export async function applyCurrencyTransaction(
  params: {
    userId: string;
    amount: number; // positive = credit, negative = debit
    reason: string;
    refId: string;
  },
  db: Db = prisma
) {
  const { userId, amount, reason, refId } = params;
  if (amount === 0) throw new Error("amount must be non-zero");

  const existing = await db.currencyTransaction.findUnique({
    where: { userId_reason_refId: { userId, reason, refId } },
  });
  if (existing) return existing;

  return runInTransaction(db, async (tx) => {
    // Re-check inside the transaction to avoid a TOCTOU race on concurrent calls.
    const already = await tx.currencyTransaction.findUnique({
      where: { userId_reason_refId: { userId, reason, refId } },
    });
    if (already) return already;

    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const balanceAfter = user.heliumBalance + amount;
    if (balanceAfter < 0) throw new InsufficientBalanceError();

    await tx.user.update({
      where: { id: userId },
      data: {
        heliumBalance: balanceAfter,
        heliumEarnedWeek: amount > 0 ? { increment: amount } : undefined,
      },
    });

    return tx.currencyTransaction.create({
      data: { userId, amount, reason, refId, balanceAfter },
    });
  });
}

async function runInTransaction<T>(
  db: Db,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  // If we were already handed a transaction client, just use it directly
  // (Prisma doesn't support nested $transaction calls).
  if (!("$transaction" in db)) return fn(db as Prisma.TransactionClient);
  return (db as PrismaClient).$transaction((tx) => fn(tx));
}

export async function getBalance(userId: string, db: Db = prisma): Promise<number> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  return user.heliumBalance;
}
