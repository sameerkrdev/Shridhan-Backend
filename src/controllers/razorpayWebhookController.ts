import type { NextFunction, Request, Response } from "express";
import createHttpError from "http-errors";
import {
  processRazorpayWebhook,
  validateRazorpayWebhookOrThrow,
} from "@/services/razorpayWebhookService.js";

const readHeaderValue = (value: string | string[] | undefined) => {
  if (!value) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
};

export const handleRazorpayWebhook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!Buffer.isBuffer(req.body)) {
      throw createHttpError(400, "Webhook body must be raw payload");
    }

    const signature = readHeaderValue(req.headers["x-razorpay-signature"]);
    const eventId = readHeaderValue(req.headers["x-razorpay-event-id"]);

    validateRazorpayWebhookOrThrow(req.body, signature);
    await processRazorpayWebhook({
      rawBody: req.body,
      signature: signature!,
      ...(eventId ? { eventId } : {}),
    });

    res.status(200).json({ received: true });
  } catch (error) {
    next(error);
  }
};
