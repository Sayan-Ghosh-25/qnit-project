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

    // Introspect token (server-side). getUser(token) is safe for backend verification.
    const { data: userData, error: getUserError } = await supabaseAdmin.auth.getUser(token);

    if (getUserError) {
      console.error("requireAuth: Supabase token check error:", getUserError);
      return res.status(401).json({ error: getUserError.message || "Invalid or expired token" });
    }

    const authUser = userData?.user;
    if (!authUser) {
      console.warn("requireAuth: User not found or disabled for token");
      return res.status(403).json({ error: "User not found or disabled" });
    }

    // Try to get authoritative role from profiles table
    let role = (authUser.role || authUser.user_metadata?.role || null);

    let profileRow = null;
    try {
      const { data: profileData, error: profileErr } = await supabaseAdmin
        .from("profiles")
        .select("role, full_name, email, contact")
        .eq("id", authUser.id)
        .maybeSingle();

      if (!profileErr && profileData) {
        profileRow = profileData;
        // prefer role in profiles table if present
        if (profileData.role) role = profileData.role;
      }
    } catch (e) {
      // Non-fatal: continue with role we have (auth metadata or null)
      console.warn("requireAuth: profile lookup failed (continuing):", e);
    }

    // Normalize role string and fallback to 'student' if absent
    const normalizedRole = (role || "student").toString().trim().toLowerCase();

    // Attach user info for downstream middlewares/controllers
    req.user = {
      id: authUser.id,
      email: authUser.email || (profileRow && profileRow.email) || null,
      role: normalizedRole,
      profile: profileRow, // may be null
    };

    return next();
  } catch (err) {
    console.error("requireAuth: Unexpected authentication server error:", err);
    return res.status(500).json({ error: "Authentication server error" });
  }
}