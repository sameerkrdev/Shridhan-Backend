import Razorpay from "razorpay";
import env from "@/config/dotenv.js";

const razorpayClient = new Razorpay({
  key_id: env.RAZORPAY_KEY_ID,
  key_secret: env.RAZORPAY_KEY_SECRET,
});

export default razorpayClient;
