// src/controller/userController.js
import { supabaseAdmin } from "../config/supabaseClient.js";
export async function getProfile(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, email, name, role")
      .eq("id", userId)
      .maybeSingle();

    if (error) throw error;

    if (!data) return res.status(404).json({ error: "Profile not found" });

    return res.json({ profile: data });
  } catch (err) {
    console.error("getProfile:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
