import { vi } from "vitest";

type StubFn = (...args: unknown[]) => unknown;

interface RazorpayMock {
  subscriptions: {
    fetch: StubFn;
    create: StubFn;
    cancel: StubFn;
  };
  customers: {
    create: StubFn;
  };
  payments: {
    refund: StubFn;
  };
}

interface RedisMock {
  set: StubFn;
  del: StubFn;
}

interface NotificationMocks {
  sendSubscriptionStateNotification: StubFn;
  sendSetupFeePaidNotification: StubFn;
  pushRdWaiveNotificationsToFirestore: StubFn;
  sendRdFineWaiveEmail: StubFn;
}

export const buildRazorpayMock = (): RazorpayMock => ({
  subscriptions: {
    fetch: vi.fn(),
    create: vi.fn(),
    cancel: vi.fn(),
  },
  customers: {
    create: vi.fn(),
  },
  payments: {
    refund: vi.fn(),
  },
});

export const buildRedisMock = (): RedisMock => ({
  set: vi.fn(),
  del: vi.fn(),
});

export const buildNotificationMocks = (): NotificationMocks => ({
  sendSubscriptionStateNotification: vi.fn(),
  sendSetupFeePaidNotification: vi.fn(),
  pushRdWaiveNotificationsToFirestore: vi.fn(),
  sendRdFineWaiveEmail: vi.fn(),
});
