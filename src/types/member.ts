import type { Request } from "express";

export interface ISignupMemberRequest extends Request {
  body: {
    name: string;
    phoneNumber: string;
    email: string;
  };
}
