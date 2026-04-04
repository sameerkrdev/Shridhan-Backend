import { Prisma } from "@/generated/prisma/client.js";

export const TEST_IDS = {
  userId: "user_test_1",
  societyId: "7fef8f2b-0ee8-44b4-a36b-9e3ea8b3a8d1",
  membershipId: "cmembership000000000000000001",
  subscriptionId: "3f3e8d0f-005a-41af-b2bb-1338a4b635fd",
  razorpaySubId: "sub_test_123",
  razorpayPaymentId: "pay_test_123",
  requestId: "0dd3261d-02b0-4f89-ab80-7fc481b3065e",
  rdId: "44c152cc-f649-4b20-b773-6f844a90fe6b",
} as const;

export const makeMembership = (overrides: Record<string, unknown> = {}) => ({
  id: TEST_IDS.membershipId,
  userId: TEST_IDS.userId,
  societyId: TEST_IDS.societyId,
  roleId: "role_1",
  status: "active",
  joinedAt: new Date("2025-01-01T00:00:00.000Z"),
  deletedAt: null,
  createdAt: new Date("2025-01-01T00:00:00.000Z"),
  updatedAt: new Date("2025-01-01T00:00:00.000Z"),
  ...overrides,
});

export const makeActorMembership = (overrides: Record<string, unknown> = {}) =>
  makeMembership(overrides);

export const decimal = (value: number | string) => new Prisma.Decimal(value);
