import express from "express";
import morgan from "morgan";
import env from "@/config/dotenv";
import logger from "./config/logger";

const app = express();

// Morgan logs HTTP requests
app.use(morgan("combined"));

app.get("/", (req, res) => {
  logger.info("Welcome to shridhan");
  res.json({ message: "Welcome to Shridhan" });
});

app.listen(env.PORT, () => {
  logger.info(`Server is running on PORT ${env.PORT}`);
});
