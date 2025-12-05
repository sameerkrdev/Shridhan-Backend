import { createFirstMember, loginMember as loginMemberService } from "@/services/authService.js";
import type { ILoginMemberRequest, ISignupMemberRequest } from "@/types/member.js";
import type { Response, NextFunction } from "express";

export const signup = async (req: ISignupMemberRequest, res: Response, next: NextFunction) => {
  try {
    const { name, phone, email, role } = req.body;

    const member = await createFirstMember({ name, phone, email, role });

    res.json(member);
  } catch (error) {
    next(error);
  }
};

export const login = async (req: ILoginMemberRequest, res: Response, next: NextFunction) => {
  try {
    const { phone, societyId } = req.body;

    const member = await loginMemberService(phone, societyId);

    res.json(member);
  } catch (error) {
    next(error);
  }
};
