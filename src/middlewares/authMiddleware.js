// src/middlewares/requireAuth.js
import { supabase } from "../config/supabaseClient.js";

export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const m = authHeader.match(/^Bearer (.+)$/);
    if (!m) {
      return res.status(401).json({ error: "Missing token" });
    }

    const token = m[1];
    const { data, error } = await supabase.auth.getUser(token);

    if (error) {
      console.error("Supabase token check error:", error);
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    if (!data?.user) {
      return res.status(403).json({ error: "User not found or disabled" });
    }

    // Attach only safe info
    req.user = {
      id: data.user.id,
      email: data.user.email,
      role: data.user.role || "student",
    };

    return next();
  } catch (err) {
    console.error("requireAuth:", err);
    return res.status(500).json({ error: "Auth server error" });
  }
}