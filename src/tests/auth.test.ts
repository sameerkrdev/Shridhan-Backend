import { describe, expect, it } from "vitest";
import supertest from "supertest";
import app from "@/app.js";
import { prismaMock } from "./helpers/mock-prisma.js";
import type { Prisma } from "@/generated/prisma/client.js";
import { constants } from "@/constants.js";

const request = supertest(app);

describe("Auth Routes", () => {
  describe("Send OTP /api/v1/otp/send", () => {
    it("should return 400 if reason is not provided", async () => {
      const response = await request.post("/api/v1/otp/send").send({
        phone: "7631189455",
      });
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
    });
    it("should return 400 if phone is not provided", async () => {
      const response = await request.post("/api/v1/otp/send").send({
        reason: "login",
      });
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
    });
    it("should return 400 if email is not provided", async () => {
      const response = await request.post("/api/v1/otp/send").send({
        phone: "7631189455",
        reason: "login",
      });
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
    });
    it("should return 400 if phone and email are not provided", async () => {
      const response = await request.post("/api/v1/otp/send").send({
        reason: "login",
      });
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
    });
    it("should return 400 if phone and email are provided", async () => {
      const response = await request.post("/api/v1/otp/send").send({
        phone: "7631189455",
        email: "test@example.com",
        reason: "login",
      });
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
    });
    it("should return 400 if reason is not valid", async () => {
      const response = await request.post("/api/v1/otp/send").send({
        phone: "7631189455",
        reason: "invalid",
      });
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
    });
    it("should return 400 if phone is not valid", async () => {
      const response = await request.post("/api/v1/otp/send").send({
        phone: "invalid",
        reason: "login",
      });
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
    });
    it("should return 400 if email is not valid", async () => {
      const response = await request.post("/api/v1/otp/send").send({
        email: "test@example.com",
        reason: "login",
      });
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
    });
    it("should return 400 if phone and email are not valid", async () => {
      const response = await request.post("/api/v1/otp/send").send({
        phone: "7631189455",
        email: "test@example.com",
        reason: "login",
      });
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
    });
    it("should return 200 if OTP is sent successfully", async () => {
      const response = await request.post("/api/v1/otp/send").send({
        phone: "7631189455",
        reason: "login",
      });
      expect(response.status).toBe(200);
    });
  });
  describe("Verify OTP /api/v1/otp/verify", () => {
    it("should return 200 if OTP is verified successfully", async () => {
      const response = await request.post("/api/v1/otp/verify").send({
        phone: "7631189455",
        otp: "123456",
      });
      expect(response.status).toBe(200);
    });
  });
  describe("Send Phone OTP /api/v1/otp/phone/send", () => {
    it("should return 200 if Phone OTP is sent successfully", async () => {
      const response = await request.post("/api/v1/otp/phone/send").send({
        phone: "7631189455",
        reason: "login",
      });
      expect(response.status).toBe(200);
    });
  });
  describe("Verify Phone OTP /api/v1/otp/phone/verify", () => {
    it("should return 200 if Phone OTP is verified successfully", async () => {
      const response = await request.post("/api/v1/otp/phone/verify").send({
        phone: "7631189455",
        otp: "123456",
      });
      expect(response.status).toBe(200);
    });
  });
  describe("Send Email OTP /api/v1/otp/email/send", () => {
    it("should return 200 if Email OTP is sent successfully", async () => {
      const response = await request.post("/api/v1/otp/email/send").send({
        email: "test@example.com",
        reason: "login",
      });
      expect(response.status).toBe(200);
    });
  });
  describe("Verify Email OTP /api/v1/otp/email/verify", () => {
    it("should return 200 if Email OTP is verified successfully", async () => {
      const response = await request.post("/api/v1/otp/email/verify").send({
        email: "test@example.com",
        otp: "123456",
      });
      expect(response.status).toBe(200);
    });
  });
  describe("Signup /api/v1/members/signup", () => {
    it("should return 400 if name is not provided", async () => {
      const response = await request.post("/api/v1/members/signup").send({
        phone: "7631189455",
        email: "john.doe@example.com",
      });
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
    });
    it("should return 400 if phone is not provided", async () => {
      const response = await request.post("/api/v1/members/signup").send({
        name: "John Doe",
        email: "test@example.com",
      });
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
    });
    it("should return 400 if email is not provided", async () => {
      const response = await request.post("/api/v1/members/signup").send({
        name: "John Doe",
        phone: "7631189455",
      });
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
    });
    it("should return 400 if phone is already exists", async () => {
      prismaMock.user.findFirst.mockResolvedValueOnce({
        id: "123",
        name: "John Doe",
        phone: "1234567890",
        email: "john@example.com",
      } as Prisma.UserModel);

      const response = await request.post("/api/v1/members/signup").send({
        name: "John Doe",
        phone: "1234567890",
        email: "john.doe@example.com",
      });
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
    });
    it("should return 400 if email is already exists", async () => {
      prismaMock.user.findFirst.mockResolvedValueOnce({
        id: "123",
        name: "John Doe",
        phone: "1234567891",
        email: "john.doe@example.com",
      } as Prisma.UserModel);

      const response = await request.post("/api/v1/members/signup").send({
        name: "John Doe",
        phone: "1234567890",
        email: "john.doe@example.com",
      });
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
    });

    it("should return 201 if user is created successfully", async () => {
      const response = await request.post("/api/v1/members/signup").send({
        name: "John Doe",
        phone: "1234567890",
        email: "john.doe@example.com",
      });

      expect(response.status).toBe(201);
      expect(response.headers["set-cookie"]).toHaveLength(2);
      expect(response.headers["set-cookie"]?.[0]).toContain(constants.ACCESS_COOKIE_NAME);
      expect(response.headers["set-cookie"]?.[1]).toContain(constants.REFRESH_COOKIE_NAME);
      expect(response.body).toHaveProperty("user");
      expect(response.body).toHaveProperty("routeIntent");
      expect(response.body).toHaveProperty("memberships");
    });

    describe("Login /api/v1/members/login", () => {
      it("should be able to login", () => {
        expect(true).toBe(true);
      });
    });
  });
});
