// userRoutes.js
import express from "express";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "../middlewares/authMiddleware.js";
import { getProfile } from "../controllers/userController.js";

dotenv.config();
const router = express.Router();

// Create a service-role supabase client (server side only)
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY!");
}

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// GET logged-in user's profile
router.get("/me", requireAuth, getProfile);

/* GET /user/me/firstname */
router.get("/me/firstname", async (req, res) => {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization || "";
    const token = (authHeader.startsWith("Bearer ") && authHeader.split(" ")[1]) || null;

    if (!token) {
      return res.status(401).json({ error: "Missing authorization token" });
    }

    // Verify token and obtain user
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return res.status(401).json({ error: userErr?.message || "Invalid token" });
    }
    const user = userData.user;
    const userId = user.id;

    // Query profiles using service role (bypasses RLS safely on server)
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("Error fetching profile in /user/me/firstname:", error);
      return res.status(500).json({ error: error.message || "DB error" });
    }

    const raw = (data && (data.full_name || data.email)) || "";
    let firstName = "";

    if (raw) {
      if (raw.includes("@")) {
        // email -> use local part
        firstName = raw.split("@")[0];
      } else {
        // full_name -> first token
        firstName = raw.toString().trim().split(/\s+/)[0] || "";
      }
    }

    return res.json({ firstName });
  } catch (err) {
    console.error("Unexpected error in /user/me/firstname:", err);
    return res.status(500).json({ error: err?.message || "Internal server error" });
  }
});

export default router;
