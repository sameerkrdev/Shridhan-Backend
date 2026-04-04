// tests/__mocks__/prisma.ts
import { mockDeep } from "vitest-mock-extended";
import type { PrismaClient } from "@/generated/prisma/client.js";

export const prismaMock = mockDeep<PrismaClient>();
