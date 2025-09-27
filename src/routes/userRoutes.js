// userRoutes.js
import express from "express";
import { requireAuth } from "../middlewares/authMiddleware.js";
import { getProfile } from "../controllers/userController.js";

const router = express.Router();

// Get logged-in user's profile
router.get("/me", requireAuth, getProfile);

export default router;
