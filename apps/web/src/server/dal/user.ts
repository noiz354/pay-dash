import "server-only";

import { prisma } from "@/lib/db/prisma";
import { z } from "zod";

// Reusable DAL — NEXTJS_CONCEPTS.md #3 Server Components, #106 Prisma, #138 Zod, #24 Node Runtime
// DAL owns authz + DTO shaping (docs/ARCHITECTURE.md:13). Never import into "use client".

const UserIdSchema = z.string().cuid();

export async function getUserById(userId: string) {
  const id = UserIdSchema.parse(userId);
  return prisma.user.findUnique({ where: { id } });
}

export async function getUserByExternalId(externalId: string) {
  const ext = z.string().min(1).parse(externalId);
  return prisma.user.findUnique({ where: { externalId: ext } });
}

// Example: list users with pagination — reusable for team_permissions screen
export async function listUsers(opts: { take?: number; skip?: number } = {}) {
  const take = z.number().min(1).max(100).default(20).parse(opts.take);
  const skip = z.number().min(0).default(0).parse(opts.skip);
  return prisma.user.findMany({ take, skip, orderBy: { createdAt: "desc" } });
}
