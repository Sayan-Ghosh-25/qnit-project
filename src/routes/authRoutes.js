// src/routes/authRoutes.js
import express from "express";
import { studentIdLookup, signIn, generateOtp, verifyOtp, requestPrivateKey, verifyPrivateKey, checkUser, registerUser, resetPassword, updatePassword, deleteAccount } from "../controllers/authController.js";
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

// Reset update
router.post("/reset-password", rateLimitMiddleware, resetPassword);

// Password update (requires Authorization: Bearer <access_token>)
router.post("/password/update", requireAuth, updatePassword);

// DELETE /auth/delete-account
router.delete("/delete-account", rateLimitMiddleware, requireAuth, deleteAccount);

export default router;
