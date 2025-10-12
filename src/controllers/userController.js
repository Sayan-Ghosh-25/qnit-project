// src/controller/userController.js
import { supabaseAdmin } from "../config/supabaseClient.js";

export async function getProfile(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, stream, year_of_study, semester, contact, dob, last_password_change")
      .eq("id", userId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Profile not found" });

    return res.json({
      profile: {
        full_name: data.full_name || "",
        stream: data.stream || "",
        year_of_study: data.year_of_study || "",
        semester: data.semester || "",
        email: data.email || "",
        contact: data.contact || "",
        dob: data.dob || null,
        last_password_change: data.last_password_change || null,
      },
    });
  } catch (err) {
    console.error("getProfile:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
