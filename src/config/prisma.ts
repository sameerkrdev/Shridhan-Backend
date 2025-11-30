import { PrismaClient } from "@/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import env from "@/config/dotenv";

const prisma = new PrismaClient({
  accelerateUrl: env.DATABASE_URL,
}).$extends(withAccelerate()) as unknown as PrismaClient;

export default prisma;
