import { signupMember } from "@/controllers/memberController.js";
import express from "express";

const router = express.Router();

router.post("/", signupMember);

export default router;
