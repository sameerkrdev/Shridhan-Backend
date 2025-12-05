import type { OnboardSocietyValidationSchema } from "@/zodValidationSchema/societyValidationSchema.js";
import type { IAuthorizedRequest } from "./authType.js";

export interface IOnboardSocietyRequest extends IAuthorizedRequest {
  body: OnboardSocietyValidationSchema["body"];
}
