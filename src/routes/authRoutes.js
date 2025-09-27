// authRoutes.js
import express from "express";
import {
  generateOtp,
  verifyOtp,
  requestPrivateKey,
  verifyPrivateKey,
  checkUser,
  registerUser,
  updatePassword
} from "../controllers/authController.js";
import { rateLimitMiddleware } from "../middlewares/rateLimit.js";
import { requireAuth } from "../middlewares/authMiddleware.js";

const router = express.Router();

// OTP endpoints
router.post("/otp/generate", rateLimitMiddleware, generateOtp);
router.post("/otp/verify", verifyOtp);

// Private key (for admin use only)
router.post("/private-key/generate", rateLimitMiddleware, requestPrivateKey);
router.post("/private-key/verify", verifyPrivateKey);

// Check if user exists (by email/contact)
router.get("/check-user", checkUser);

// Register new user (with verified OTP flow)
router.post("/register", registerUser);

// Update password (requires valid access_token)
router.post("/password/update", requireAuth, updatePassword);

export default router;
