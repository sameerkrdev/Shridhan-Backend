// import { beforeAll } from "vitest";
// import prisma from "@/config/prisma.js";
// import { dropAllTables } from "@/generated/prisma/sql/dropAllTables.js";

// const resetDatabase = async () => {
//   await prisma.$queryRawTyped(dropAllTables());
// };

import { afterAll, afterEach, beforeEach, vi } from "vitest";
import { prismaMock } from "./helpers/mock-prisma.js";
import { mockReset } from "vitest-mock-extended";

vi.mock("@/config/prisma.js", () => ({
  default: prismaMock,
  prisma: prismaMock,
}));

beforeEach(() => {
  mockReset(prismaMock);
});

afterEach(() => {
  mockReset(prismaMock);
  vi.clearAllMocks();
});

afterAll(() => {
  mockReset(prismaMock);
  vi.clearAllMocks();
});
