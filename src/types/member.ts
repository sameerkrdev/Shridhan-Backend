import type {
  CreateFirstMemberValidationSchema,
  LoginValidationSchema,
} from "@/zodValidationSchema/memberValidationSchema.js";
import type { Request } from "express";

export interface ISignupMemberRequest extends Request {
  body: CreateFirstMemberValidationSchema["body"];
}

export interface ILoginMemberRequest extends Request {
  body: LoginValidationSchema["body"];
}
