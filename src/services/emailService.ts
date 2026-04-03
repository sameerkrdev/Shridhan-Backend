import nodemailer from "nodemailer";
import env from "@/config/dotenv.js";
import logger from "@/config/logger.js";

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: Number(env.SMTP_PORT),
  secure: Number(env.SMTP_PORT) === 465,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});

export const sendEmailOtp = async (email: string, otp: string, reason: string) => {
  const subject = `Your OTP for ${reason}`;
  const text = `Your verification code is ${otp} for ${reason}. It will expire in a few minutes. Do not share this code with anyone.`;

  const info = await transporter.sendMail({
    from: env.EMAIL_FROM,
    to: email,
    subject,
    text,
  });

  logger.info("Email OTP sent", { to: email, reason, messageId: info.messageId });
};

interface BillingEmailPayload {
  to: string[];
  subject: string;
  title: string;
  intro: string;
  statusLabel: string;
  details: { label: string; value: string }[];
  actionUrl?: string;
  actionText?: string;
}

const buildBillingEmailHtml = (payload: BillingEmailPayload) => {
  const detailsRows = payload.details
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:600;">${item.label}</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;">${item.value}</td>
      </tr>
    `,
    )
    .join("");

  const actionButton =
    payload.actionUrl && payload.actionText
      ? `<a href="${payload.actionUrl}" style="display:inline-block;padding:10px 16px;background:#111827;color:#ffffff;text-decoration:none;border-radius:6px;">${payload.actionText}</a>`
      : "";

  return `
    <div style="font-family:Arial,sans-serif;background:#f9fafb;padding:24px;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
        <div style="padding:16px 20px;background:#111827;color:#ffffff;font-size:18px;font-weight:700;">
          Shridhan Billing
        </div>
        <div style="padding:20px;">
          <h2 style="margin:0 0 8px 0;color:#111827;">${payload.title}</h2>
          <p style="margin:0 0 12px 0;color:#374151;">${payload.intro}</p>
          <p style="margin:0 0 16px 0;color:#111827;"><strong>Status:</strong> ${payload.statusLabel}</p>
          <table style="border-collapse:collapse;width:100%;margin-bottom:16px;">
            ${detailsRows}
          </table>
          ${actionButton}
          <p style="margin-top:20px;color:#6b7280;font-size:12px;">
            This is a billing system email from Shridhan. Please do not reply directly.
          </p>
        </div>
      </div>
    </div>
  `;
};

const buildBillingEmailText = (payload: BillingEmailPayload) => {
  const detailsText = payload.details.map((item) => `${item.label}: ${item.value}`).join("\n");
  const actionText =
    payload.actionUrl && payload.actionText ? `\n${payload.actionText}: ${payload.actionUrl}` : "";
  return `${payload.title}\n\n${payload.intro}\n\nStatus: ${payload.statusLabel}\n\n${detailsText}${actionText}`;
};

export const sendBillingEmail = async (payload: BillingEmailPayload) => {
  if (!payload.to.length) {
    return;
  }

  const info = await transporter.sendMail({
    from: env.EMAIL_FROM,
    to: payload.to.join(","),
    subject: payload.subject,
    text: buildBillingEmailText(payload),
    html: buildBillingEmailHtml(payload),
  });

  logger.info("Billing email sent", {
    to: payload.to,
    subject: payload.subject,
    messageId: info.messageId,
  });
};

interface RdFineWaiveEmailPayload {
  to: string[];
  subject: string;
  title: string;
  statusLabel: string;
  requesterMembershipId: string;
  rdId: string;
  rdCustomerName: string;
  monthEntries: { monthIndex: number; fine: string }[];
  reduceFromMaturity: boolean;
  expiresAt: Date;
  reason?: string;
  actionUrl?: string;
  actionText?: string;
}

export const sendRdFineWaiveEmail = async (payload: RdFineWaiveEmailPayload) => {
  if (!payload.to.length) return;

  const monthLines = payload.monthEntries
    .map((m) => `Month ${m.monthIndex}: Rs. ${Number(m.fine).toFixed(2)}`)
    .join("\n");
  const reasonLine = payload.reason ? `Reason: ${payload.reason}\n` : "";
  const actionLine =
    payload.actionUrl && payload.actionText ? `\n${payload.actionText}: ${payload.actionUrl}\n` : "";
  const text = `${payload.title}

Status: ${payload.statusLabel}
Requester membership: ${payload.requesterMembershipId}
RD account: ${payload.rdId}
Customer: ${payload.rdCustomerName}
Reduce from maturity: ${payload.reduceFromMaturity ? "Yes" : "No"}
Expires at: ${payload.expiresAt.toISOString()}
${reasonLine}
Months:
${monthLines}
${actionLine}
`;

  const htmlMonthLines = payload.monthEntries
    .map((m) => `<li>Month ${m.monthIndex}: Rs. ${Number(m.fine).toFixed(2)}</li>`)
    .join("");
  const info = await transporter.sendMail({
    from: env.EMAIL_FROM,
    to: payload.to.join(","),
    subject: payload.subject,
    text,
    html: `
      <div style="font-family:Arial,sans-serif;padding:16px;">
        <h2>${payload.title}</h2>
        <p><strong>Status:</strong> ${payload.statusLabel}</p>
        <p><strong>Requester membership:</strong> ${payload.requesterMembershipId}</p>
        <p><strong>RD account:</strong> ${payload.rdId}</p>
        <p><strong>Customer:</strong> ${payload.rdCustomerName}</p>
        <p><strong>Reduce from maturity:</strong> ${payload.reduceFromMaturity ? "Yes" : "No"}</p>
        <p><strong>Expires at:</strong> ${payload.expiresAt.toISOString()}</p>
        ${payload.reason ? `<p><strong>Reason:</strong> ${payload.reason}</p>` : ""}
        ${
          payload.actionUrl && payload.actionText
            ? `<p><a href="${payload.actionUrl}" style="display:inline-block;padding:10px 16px;background:#111827;color:#ffffff;text-decoration:none;border-radius:6px;">${payload.actionText}</a></p>`
            : ""
        }
        <p><strong>Months</strong></p>
        <ul>${htmlMonthLines}</ul>
      </div>
    `,
  });

  logger.info("RD fine waive email sent", {
    to: payload.to,
    subject: payload.subject,
    messageId: info.messageId,
  });
};
