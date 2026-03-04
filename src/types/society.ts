import type { OnboardSocietyValidationSchema } from "@/zodValidationSchema/societyValidationSchema.js";
import type { IAuthorizedRequest } from "./authType.js";
import type { ResolveMemberSocietyValidationSchema } from "@/zodValidationSchema/societyValidationSchema.js";
import type { SetupSubscriptionValidationSchema } from "@/zodValidationSchema/societyValidationSchema.js";
import type { GetSocietyBillingOverviewValidationSchema } from "@/zodValidationSchema/societyValidationSchema.js";
import type { CancelSubscriptionValidationSchema } from "@/zodValidationSchema/societyValidationSchema.js";

export interface IOnboardSocietyRequest extends IAuthorizedRequest {
  body: OnboardSocietyValidationSchema["body"];
}

export type ISocietyUserRequest = IAuthorizedRequest;

export interface IResolveMemberSocietyRequest extends IAuthorizedRequest {
  body: ResolveMemberSocietyValidationSchema["body"];
}

export interface ISetupSubscriptionRequest extends IAuthorizedRequest {
  body: SetupSubscriptionValidationSchema["body"];
}

export interface IGetSocietyBillingOverviewRequest extends IAuthorizedRequest {
  params: GetSocietyBillingOverviewValidationSchema["params"];
}

export interface ICancelSubscriptionRequest extends IAuthorizedRequest {
  body: CancelSubscriptionValidationSchema["body"];
}
