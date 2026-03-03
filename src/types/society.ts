import type { OnboardSocietyValidationSchema } from "@/zodValidationSchema/societyValidationSchema.js";
import type { IAuthorizedRequest } from "./authType.js";
import type { ResolveMemberSocietyValidationSchema } from "@/zodValidationSchema/societyValidationSchema.js";
import type { SetupPermitRulesValidationSchema } from "@/zodValidationSchema/societyValidationSchema.js";
import type { SetupSubscriptionValidationSchema } from "@/zodValidationSchema/societyValidationSchema.js";
import type { CreateSetupFeePaymentLinkValidationSchema } from "@/zodValidationSchema/societyValidationSchema.js";
import type { GetSocietyBillingOverviewValidationSchema } from "@/zodValidationSchema/societyValidationSchema.js";

export interface IOnboardSocietyRequest extends IAuthorizedRequest {
  body: OnboardSocietyValidationSchema["body"];
}

export type ISocietyUserRequest = IAuthorizedRequest;

export interface IResolveMemberSocietyRequest extends IAuthorizedRequest {
  body: ResolveMemberSocietyValidationSchema["body"];
}

export interface ISetupPermitRulesRequest extends IAuthorizedRequest {
  body: SetupPermitRulesValidationSchema["body"];
}

export interface ISetupSubscriptionRequest extends IAuthorizedRequest {
  body: SetupSubscriptionValidationSchema["body"];
}

export interface ICreateSetupFeePaymentLinkRequest extends IAuthorizedRequest {
  body: CreateSetupFeePaymentLinkValidationSchema["body"];
}

export interface IGetSocietyBillingOverviewRequest extends IAuthorizedRequest {
  params: GetSocietyBillingOverviewValidationSchema["params"];
}
