import express from "express";
import env from "./config/dotenv";

const app = express();

app.get("/", (req, res) => {
  res.json({ message: "Welcome to Shridhan" });
});

app.listen(env.PORT, () => {
  console.log("Server starting on port 5801");
});
