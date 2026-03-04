import type { Request } from "express";
import type {
  ApproveSocietyBillingOverrideValidationSchema,
  UpdateSocietyBillingPolicyValidationSchema,
} from "@/zodValidationSchema/internalBillingValidationSchema.js";

export interface IUpdateSocietyBillingPolicyRequest extends Request {
  params: UpdateSocietyBillingPolicyValidationSchema["params"];
  body: UpdateSocietyBillingPolicyValidationSchema["body"];
}

export interface IApproveSocietyBillingOverrideRequest extends Request {
  params: ApproveSocietyBillingOverrideValidationSchema["params"];
  body: ApproveSocietyBillingOverrideValidationSchema["body"];
}
