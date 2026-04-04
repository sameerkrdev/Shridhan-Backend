import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: "./src/tests/setup.ts",
    include: ["src/tests/**/*.test.ts"],
    threads: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: [
        "src/services/subscriptionLifecycleService.ts",
        "src/services/razorpayWebhookService.ts",
        "src/middlewares/billingAuthorizationMiddleware.ts",
        "src/services/misService.ts",
        "src/zodValidationSchema/misValidationSchema.ts",
        "src/services/recurringDepositService.ts",
        "src/services/rdDueCalculator.ts",
        "src/services/rdFineWaiveService.ts",
        "src/zodValidationSchema/recurringDepositValidationSchema.ts",
      ],
      thresholds: {
        lines: 45,
        functions: 45,
        branches: 30,
        statements: 45,
      },
    },
  },
});
