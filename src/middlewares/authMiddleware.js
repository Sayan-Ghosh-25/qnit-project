// src/middlewares/authMiddleware.js
import { supabaseAdmin } from "../config/supabaseClient.js";

export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

    if (!token) {
      console.warn("requireAuth: Missing authorization token");
      return res.status(401).json({ error: "Missing authorization token" });
    }

    // Use supabaseAdmin.auth.getUser for secure backend token verification
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error) {
      console.error("requireAuth: Supabase token check error:", error);
      return res.status(401).json({ error: error.message || "Invalid or expired token" });
    }

    if (!data?.user) {
      console.warn("requireAuth: User not found or disabled for token");
      return res.status(403).json({ error: "User not found or disabled" });
    }

    // Attach essential user information to the request object
    req.user = {
      id: data.user.id,
      email: data.user.email,
      role: data.user.role || data.user.user_metadata?.role || "student",
    };

    return next();
  } catch (err) {
    console.error("requireAuth: Unexpected authentication server error:", err);
    return res.status(500).json({ error: "Authentication server error" });
  }
}