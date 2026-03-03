import type { Request } from "express";
import type { UpdateSocietyBillingPolicyValidationSchema } from "@/zodValidationSchema/internalBillingValidationSchema.js";

export interface IUpdateSocietyBillingPolicyRequest extends Request {
  params: UpdateSocietyBillingPolicyValidationSchema["params"];
  body: UpdateSocietyBillingPolicyValidationSchema["body"];
}
