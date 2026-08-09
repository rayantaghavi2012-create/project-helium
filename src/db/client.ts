import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient({
  // Prisma's default interactive-transaction timeout (5s) can be tight for the
  // multi-step fight transactions under real-world network variance; give them
  // more headroom than the default.
  transactionOptions: { timeout: 15_000, maxWait: 10_000 },
});
