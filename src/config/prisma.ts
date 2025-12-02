import { PrismaClient } from "@/generated/prisma/client.js";
import { withAccelerate } from "@prisma/extension-accelerate";
import env from "@/config/dotenv.js";

const prisma = new PrismaClient({
  accelerateUrl: env.DATABASE_URL,
}).$extends(withAccelerate());

export default prisma;
