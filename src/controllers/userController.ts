import { getUserMemberships, getUserProfile, updateUserProfile } from "@/services/userService.js";
import type { IAuthorizedRequest } from "@/types/authType.js";
import type { Response, NextFunction } from "express";

export const getProfile = async (req: IAuthorizedRequest, res: Response, next: NextFunction) => {
  try {
    const user = await getUserProfile(req.user.id);
    res.json(user);
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req: IAuthorizedRequest, res: Response, next: NextFunction) => {
  try {
    const user = await updateUserProfile(
      req.user.id,
      req.body as { name?: string; phone?: string; avatar?: string },
    );
    res.json(user);
  } catch (error) {
    next(error);
  }
};

export const listMyMemberships = async (
  req: IAuthorizedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const memberships = await getUserMemberships(req.user.id);
    res.json({ memberships });
  } catch (error) {
    next(error);
  }
};
