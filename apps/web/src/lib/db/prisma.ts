import "server-only";

import { PrismaClient } from "@prisma/client";

// Reusable singleton — NEXTJS_CONCEPTS.md #106 Prisma: `const products=await prisma.product.findMany()`
// Prevents hot-reload from creating new clients (Next.js dev + HMR)
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // log: ["query"] // enable for debugging
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
