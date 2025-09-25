import { supabaseAdmin } from "../config/supabaseClient.js";

/**
 * requireAuth middleware:
 * expects Authorization: Bearer <access_token>
 */
export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const m = authHeader.match(/^Bearer (.+)$/);
    if (!m) return res.status(401).json({ error: "Missing token" });
    const token = m[1];

    // Use admin client to get user info from token
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: "Invalid token" });
    }

    req.user = data.user;
    return next();
  } catch (err) {
    console.error("requireAuth:", err);
    return res.status(500).json({ error: "Auth error" });
  }
}
