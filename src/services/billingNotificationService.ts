import prisma from "@/config/prisma.js";
import { sendBillingEmail } from "@/services/emailService.js";

const getOwnerRecipients = async (societyId: string) => {
  const memberships = await prisma.membership.findMany({
    where: {
      societyId,
      deletedAt: null,
      role: { name: "OWNER" },
    },
    select: { userId: true },
  });

  const userIds = memberships.map((m) => m.userId);
  if (userIds.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { email: true },
  });

  return users.map((u) => u.email);
};

export const sendTrialStartedNotification = async (
  societyId: string,
  societyName: string,
  trialEndsAt: Date,
) => {
  const recipients = await getOwnerRecipients(societyId);
  await sendBillingEmail({
    to: recipients,
    subject: "[Shridhan Billing] Trial Started",
    title: "Your 60-day trial has started",
    intro: "Your society has full access during trial.",
    statusLabel: "TRIAL_ACTIVE",
    details: [
      { label: "Society", value: societyName },
      { label: "Trial Ends At", value: trialEndsAt.toISOString() },
    ],
  });
};

export const sendTrialEndingReminder = async (
  societyId: string,
  societyName: string,
  trialEndsAt: Date,
) => {
  const recipients = await getOwnerRecipients(societyId);
  await sendBillingEmail({
    to: recipients,
    subject: "[Shridhan Billing] Trial Ending Soon",
    title: "Trial ending soon",
    intro: "Please complete setup fee payment to avoid service interruption.",
    statusLabel: "TRIAL_ENDING_SOON",
    details: [
      { label: "Society", value: societyName },
      { label: "Trial Ends At", value: trialEndsAt.toISOString() },
    ],
  });
};

export const sendSetupFeeDueReminder = async (
  societyId: string,
  societyName: string,
  dueAt: Date,
) => {
  const recipients = await getOwnerRecipients(societyId);
  await sendBillingEmail({
    to: recipients,
    subject: "[Shridhan Billing] Setup Fee Due",
    title: "Setup fee payment required",
    intro: "Your trial has ended and access requires setup fee payment.",
    statusLabel: "SETUP_FEE_DUE",
    details: [
      { label: "Society", value: societyName },
      { label: "Due At", value: dueAt.toISOString() },
    ],
  });
};

export const sendSetupFeePaidNotification = async (
  societyId: string,
  societyName: string,
  paymentId: string,
) => {
  const recipients = await getOwnerRecipients(societyId);
  await sendBillingEmail({
    to: recipients,
    subject: "[Shridhan Billing] Setup Fee Paid",
    title: "Setup fee payment successful",
    intro: "You can now proceed with subscription setup.",
    statusLabel: "SETUP_FEE_PAID",
    details: [
      { label: "Society", value: societyName },
      { label: "Payment Id", value: paymentId },
    ],
  });
};

export const sendSetupFeeFailedNotification = async (societyId: string, societyName: string) => {
  const recipients = await getOwnerRecipients(societyId);
  await sendBillingEmail({
    to: recipients,
    subject: "[Shridhan Billing] Setup Fee Payment Failed",
    title: "Setup fee payment unsuccessful",
    intro: "Please retry payment to continue with subscription onboarding.",
    statusLabel: "SETUP_FEE_FAILED",
    details: [{ label: "Society", value: societyName }],
  });
};

export const sendSubscriptionStateNotification = async (
  societyId: string,
  societyName: string,
  title: string,
  statusLabel: string,
) => {
  const recipients = await getOwnerRecipients(societyId);
  await sendBillingEmail({
    to: recipients,
    subject: `[Shridhan Billing] ${title}`,
    title,
    intro: "Subscription status has changed.",
    statusLabel,
    details: [{ label: "Society", value: societyName }],
  });
};
