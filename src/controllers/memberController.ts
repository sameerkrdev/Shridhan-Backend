import { createFirstMember } from "@/services/memberService.js";
import type { ISignupMemberRequest } from "@/types/member.js";
import type { Response, NextFunction } from "express";

export const signupMember = async (
  req: ISignupMemberRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { name, phone, email, role } = req.body;

    const member = await createFirstMember({ name, phone, email, role });

    res.json(member);
  } catch (error) {
    next(error);
  }
};
