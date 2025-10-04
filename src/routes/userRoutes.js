// src/routes/userRoutes.js
import express from "express";
import { supabaseAdmin } from "../config/supabaseClient.js";
import { requireAuth } from "../middlewares/authMiddleware.js";
import { getProfile } from "../controllers/userController.js";

const router = express.Router();

/* Normalizes DOB input */
function normalizeDob(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (s === "") return null;

  // If already yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return s;
  }
  // If dd-mm-yyyy
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
    const [d, m, y] = s.split("-");
    // basic validity check
    const iso = `${y}-${m}-${d}`;
    return iso;
  }
  // try Date parse fallback
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    // get yyyy-mm-dd
    const y = parsed.getFullYear();
    const mm = `${parsed.getMonth() + 1}`.padStart(2, "0");
    const dd = `${parsed.getDate()}`.padStart(2, "0");
    return `${y}-${mm}-${dd}`;
  }
  return null;
}

// =================================
// Routes using the unified requireAuth middleware
// =================================

// GET logged-in user's profile (using controller function)
router.get("/me", requireAuth, getProfile);

/* GET /user/me/firstname
 * Returns the first name derived from full_name or email for the authenticated user
 */
router.get("/me/firstname", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id; // Get userId from the authenticated request

    // Query profiles using service role (bypasses RLS safely on server)
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("userRoutes: Error fetching profile in /user/me/firstname:", error);
      return res.status(500).json({ error: error.message || "Database error" });
    }

    const rawName = (data && (data.full_name || data.email)) || "";
    let firstName = "";

    if (rawName) {
      if (rawName.includes("@")) {
        // If it's an email, use the local part
        firstName = rawName.split("@")[0];
      } else {
        // If it's a full name, take the first word
        firstName = rawName.toString().trim().split(/\s+/)[0] || "";
      }
    }

    return res.json({ firstName });
  } catch (err) {
    console.error("userRoutes: Unexpected error GET /user/me/firstname:", err);
    return res.status(500).json({ error: err?.message || "Internal server error" });
  }
});

/* GET /user/me/profile
 * Returns the full profile details for the authenticated user.
 */
router.get("/me/profile", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("full_name,stream,year_of_study,semester,email,contact,dob")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("userRoutes: Error reading profile GET /user/me/profile:", error);
      return res.status(500).json({ error: error.message || "Database read error" });
    }

    // Normalize response shape to frontend-friendly keys, using default values if not present
    const profile = data || {
      full_name: "",
      stream: "",
      year_of_study: "",
      semester: "",
      email: req.user.email || "",
      contact: "",
      dob: null,
    };

    return res.json({ profile });
  } catch (err) {
    console.error("userRoutes: Unexpected error GET /user/me/profile:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/* PUT /user/me/profile
 * Updates the authenticated user's profile with allowed fields.
 * Stream, year_of_study, semester, and dob cannot be cleared once set
 */
router.put("/me/profile", requireAuth, express.json(), async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch current profile to compare & validate updates
    const { data: currentProfile, error: curErr } = await supabaseAdmin
      .from("profiles")
      .select("full_name,stream,year_of_study,semester,email,contact,dob")
      .eq("id", userId)
      .maybeSingle();

    if (curErr) {
      console.error("userRoutes: Failed to fetch current profile for PUT /user/me/profile:", curErr);
      return res.status(500).json({ error: "Failed to fetch current profile" });
    }

    const body = req.body || {};
    const updates = {};

    // 1) Stream validation
    if ("stream" in body) {
      const raw = (body.stream || "").toString().trim();
      if (raw === "" && currentProfile?.stream) {
        return res.status(400).json({ error: "Stream cannot be cleared once set" });
      }
      updates.stream = raw;
    }

    // 2) Year of Study (academicYear) validation
    if ("year_of_study" in body) {
      const raw = (body.year_of_study || "").toString().trim();
      if (raw === "" && currentProfile?.year_of_study) {
        return res.status(400).json({ error: "Academic Year cannot be cleared once set" });
      }
      updates.year_of_study = raw;
    }

    // 3) Semester validation
    if ("semester" in body) {
      const raw = (body.semester || "").toString().trim();
      if (raw === "" && currentProfile?.semester) {
        return res.status(400).json({ error: "Semester cannot be cleared once set" });
      }
      if (raw) {
        const okSem = /^\d+(st|nd|rd|th)?$/i.test(raw);
        if (!okSem) {
          return res.status(400).json({ error: "Semester must be in format like '1st', '2nd', etc." });
        }
        updates.semester = raw;
      } else {
        updates.semester = raw;
      }
    }

    // 4) Date of Birth (DOB) validation and normalization
    if ("dob" in body) {
      const rawDob = body.dob;
      const normalized = normalizeDob(rawDob);
      // Disallow clearing DOB if it was previously set
      if ((normalized === null || normalized === "") && currentProfile?.dob) {
        return res.status(400).json({ error: "Date of Birth cannot be cleared once set" });
      }
      updates.dob = normalized;
    }

    // If no editable fields were provided or passed validation, return 400
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid editable fields provided" });
    }

    // Perform the update
    const { data: updatedProfile, error: updateErr } = await supabaseAdmin
      .from("profiles")
      .update(updates, { returning: "representation" })
      .eq("id", userId)
      .maybeSingle();

    if (updateErr) {
      console.error("userRoutes: Failed to update profile PUT /user/me/profile:", updateErr);
      return res.status(500).json({ error: updateErr.message || "Failed to update profile" });
    }

    // Respond with the updated profile
    const finalProfile = {
      full_name: updatedProfile?.full_name ?? currentProfile?.full_name ?? "",
      stream: updatedProfile?.stream ?? currentProfile?.stream ?? "",
      year_of_study: updatedProfile?.year_of_study ?? currentProfile?.year_of_study ?? "",
      semester: updatedProfile?.semester ?? currentProfile?.semester ?? "",
      email: updatedProfile?.email ?? currentProfile?.email ?? req.user.email ?? "",
      contact: updatedProfile?.contact ?? currentProfile?.contact ?? "",
      dob: updatedProfile?.dob ?? currentProfile?.dob ?? null,
    };

    return res.json({ ok: true, profile: finalProfile });
  } catch (err) {
    console.error("userRoutes: Unexpected error PUT /user/me/profile:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
