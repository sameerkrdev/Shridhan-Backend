import { createFirstMember } from "@/services/memberService.js";
import type { ISignupMemberRequest } from "@/types/member.js";
import type { Response, NextFunction } from "express";

export const signupMember = async (
  req: ISignupMemberRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { name, phoneNumber, email } = req.body;

    const member = await createFirstMember({ name, phoneNumber, email });

    res.json(member);
  } catch (error) {
    next(error);
  }
};
