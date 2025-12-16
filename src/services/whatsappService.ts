import createHttpError from "http-errors";
import logger from "@/config/logger.js";
import env from "@/config/dotenv.js";

const WHATSAPP_GRAPH_BASE_URL = "https://graph.facebook.com/v24.0";

export const sendWhatsappOtp = async (phone: string, otp: string, reason: string) => {
  const url = `${WHATSAPP_GRAPH_BASE_URL}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "text" as const,
    text: {
      preview_url: false,
      body: `Your verification code is ${otp} for ${reason}. It will expire in a few minutes. Do not share this code with anyone.`,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    logger.error("WhatsApp API error", {
      status: response.status,
      statusText: response.statusText,
      body: text,
    });
    throw createHttpError(502, "Failed to send WhatsApp message");
  }

  const data = await response.json().catch(() => null);

  logger.info("WhatsApp OTP sent", { phone, reason, data });

  return data;
};

// await sendWhatsappOtp("+917631189755", "123456", "discount");
