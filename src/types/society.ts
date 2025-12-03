import type { OnboardSocietyValidationSchema } from "@/zodValidationSchema/societyValidationSchema.js";
import type { Request } from "express";

export interface IOnboardSocietyRequest extends Request {
  body: OnboardSocietyValidationSchema["body"];
}
