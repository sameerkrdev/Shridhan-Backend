import type { CreateFirstMemberValidationSchema } from "@/zodValidationSchema/memberValidationSchema.js";
import type { Request } from "express";

export interface ISignupMemberRequest extends Request {
  body: CreateFirstMemberValidationSchema["body"];
}
