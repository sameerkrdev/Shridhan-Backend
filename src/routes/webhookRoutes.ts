import express from "express";
import { handleRazorpayWebhook } from "@/controllers/razorpayWebhookController.js";

const router: express.Router = express.Router();

router.post("/razorpay", express.raw({ type: "application/json" }), handleRazorpayWebhook);

export default router;
