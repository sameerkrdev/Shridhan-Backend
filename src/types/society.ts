import type { OnboardSocietyValidationSchema } from "@/zodValidationSchema/societyValidationSchema.js";
import type { IAuthorizedRequest } from "./authType.js";
import type { ResolveMemberSocietyValidationSchema } from "@/zodValidationSchema/societyValidationSchema.js";

export interface IOnboardSocietyRequest extends IAuthorizedRequest {
  body: OnboardSocietyValidationSchema["body"];
}

export type ISocietyMemberRequest = IAuthorizedRequest;

export interface IResolveMemberSocietyRequest extends IAuthorizedRequest {
  body: ResolveMemberSocietyValidationSchema["body"];
}
