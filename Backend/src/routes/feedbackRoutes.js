// src/routes/feedbackRoutes.js
import express from "express";
import { requireAuth } from "../middlewares/authMiddleware.js";
import { getMyFeedback, upsertMyFeedback } from "../controllers/feedbackController.js";

const router = express.Router();

// GET current user's feedback
router.get("/me/feedback", requireAuth, getMyFeedback);

// Create or update feedback (idempotent: one per user)
router.put("/me/feedback", requireAuth, express.json(), upsertMyFeedback);

export default router;
