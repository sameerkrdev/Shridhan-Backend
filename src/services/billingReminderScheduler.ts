import prisma from "@/config/prisma.js";
import redisClient from "@/config/redis.js";
import logger from "@/config/logger.js";
import cron from "node-cron";
import {
  sendSetupFeeDueReminder,
  sendSubscriptionStateNotification,
  sendTrialEndingReminder,
} from "@/services/billingNotificationService.js";

const REMINDER_SWEEP_CRON = "0 */6 * * *";
const REMINDER_SWEEP_TIMEZONE = "UTC";
let schedulerStarted = false;

const shouldSendReminder = async (key: string, ttlSeconds: number) => {
  const locked = await redisClient.set(key, "sent", "EX", ttlSeconds, "NX");
  return Boolean(locked);
};

const processTrialAndSetupFeeReminders = async () => {
  const now = new Date();
  const planSettings = await prisma.societyPlanSettings.findMany({
    include: {
      society: {
        select: { id: true, name: true },
      },
    },
  });

  for (const settings of planSettings) {
    if (!settings.society) {
      continue;
    }

    if (settings.trialEndDate) {
      const trialDiffMs = settings.trialEndDate.getTime() - now.getTime();
      const trialDaysLeft = Math.ceil(trialDiffMs / (24 * 60 * 60 * 1000));
      const reminderDays = new Set([10, 5, 3, 1]);
      if (reminderDays.has(trialDaysLeft)) {
        const reminderKey = `billing:trial-ending:${settings.societyId}:${trialDaysLeft}`;
        if (await shouldSendReminder(reminderKey, 24 * 60 * 60)) {
          await sendTrialEndingReminder(
            settings.societyId,
            settings.society.name,
            settings.trialEndDate,
          );
        }
      }
    }

    if (
      settings.setupFeeEnabled &&
      !settings.customOneTimeFeeWaived &&
      !settings.setupFeePaid &&
      settings.trialEndDate &&
      settings.trialEndDate.getTime() <= now.getTime()
    ) {
      const reminderKey = `billing:setup-fee-due:${settings.societyId}:${now.toISOString().slice(0, 10)}`;
      if (await shouldSendReminder(reminderKey, 24 * 60 * 60)) {
        await sendSetupFeeDueReminder(
          settings.societyId,
          settings.society.name,
          settings.trialEndDate,
        );
      }
    }
  }
};

const processGraceReminders = async () => {
  const now = new Date();
  const subscriptions = await prisma.subscription.findMany({
    where: {
      isInGrace: true,
      graceEndDate: { not: null },
    },
    include: {
      society: {
        select: { id: true, name: true },
      },
    },
  });

  for (const subscription of subscriptions) {
    if (!subscription.graceEndDate || !subscription.society) {
      continue;
    }

    const diffMs = subscription.graceEndDate.getTime() - now.getTime();
    const daysLeft = Math.ceil(diffMs / (24 * 60 * 60 * 1000));

    if ([7, 3, 1].includes(daysLeft)) {
      const reminderKey = `billing:grace-ending:${subscription.societyId}:${daysLeft}`;
      if (await shouldSendReminder(reminderKey, 24 * 60 * 60)) {
        await sendSubscriptionStateNotification(
          subscription.societyId,
          subscription.society.name,
          "Grace Period Ending Soon",
          "GRACE_ENDING_SOON",
        );
      }
    }
  }
};

const runBillingReminderSweep = async () => {
  try {
    await processTrialAndSetupFeeReminders();
    await processGraceReminders();
  } catch (error) {
    logger.error({
      message: "Billing reminder sweep failed",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const startBillingReminderScheduler = () => {
  if (schedulerStarted) {
    logger.info({
      message: "Billing reminder scheduler already running",
      cron: REMINDER_SWEEP_CRON,
      timezone: REMINDER_SWEEP_TIMEZONE,
    });
    return;
  }

  schedulerStarted = true;
  void runBillingReminderSweep();

  cron.schedule(
    REMINDER_SWEEP_CRON,
    () => {
      void runBillingReminderSweep();
    },
    {
      timezone: REMINDER_SWEEP_TIMEZONE,
    },
  );

  logger.info({
    message: "Billing reminder scheduler started",
    cron: REMINDER_SWEEP_CRON,
    timezone: REMINDER_SWEEP_TIMEZONE,
  });
};
