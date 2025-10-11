// src/routes/authRoutes.js
import express from "express";
import {
  generateOtp,
  verifyOtp,
  requestPrivateKey,
  verifyPrivateKey,
  checkUser,
  registerUser,
  updatePassword,
  studentIdLookup,
  signIn
} from "../controllers/authController.js";
import { rateLimitMiddleware } from "../middlewares/rateLimit.js";
import { requireAuth } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Student ID lookup (used by frontend auto-fill)
router.get("/student-id-lookup", studentIdLookup);

// Apply rate limiting to prevent brute-force
router.post("/signin", rateLimitMiddleware, signIn);

// OTP
router.post("/otp/generate", rateLimitMiddleware, generateOtp);
router.post("/otp/verify", verifyOtp);

// Private key (admin)
router.post("/private-key/generate", rateLimitMiddleware, requestPrivateKey);
router.post("/private-key/verify", verifyPrivateKey);

// check user existence
router.get("/check-user", checkUser);

// Register (create auth user + profile)
router.post("/register", registerUser);

// Password update (requires Authorization: Bearer <access_token>)
router.post("/password/update", requireAuth, updatePassword);

export default router;
