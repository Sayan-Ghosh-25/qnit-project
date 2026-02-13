// src/routes/materialsRoutes.js
import express from "express";
import { requireAuth } from "../middlewares/authMiddleware.js";
import requireAdmin from "../middlewares/requireAdmin.js";
import * as materialsController from "../controllers/materialsController.js";

const router = express.Router();
router.get("/live", materialsController.getLiveMaterials);

// Admin-protected endpoints (requireAuth + requireAdmin)
router.post("/publish", requireAuth, requireAdmin, materialsController.publishMaterials);

router.patch("/visibility/:id", requireAuth, requireAdmin, materialsController.updateVisibility);
router.patch("/switch-section/:id", requireAuth, requireAdmin, materialsController.switchSection);
router.patch("/update-heading/:id", requireAuth, requireAdmin, materialsController.updateHeading);

router.delete("/group/:id", requireAuth, requireAdmin, materialsController.deleteGroup);

router.put("/file-update/:id", requireAuth, requireAdmin, materialsController.fileUpdate);
router.delete("/file-delete/:id", requireAuth, requireAdmin, materialsController.fileDelete);

export default router;