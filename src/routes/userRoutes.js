// src/routes/userRoutes.js
import express from "express";
import { supabaseAdmin } from "../config/supabaseClient.js";
import { requireAuth } from "../middlewares/authMiddleware.js";
import { getProfile } from "../controllers/userController.js";

const router = express.Router();

// Helper middleware: verify token, attach `req.user`(supabase user object)
async function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
    if (!token) return res.status(401).json({ error: "Missing authorization token" });

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: error?.message || "Invalid token" });
    }
    req.user = data.user;
    next();
  } catch (err) {
    console.error("verifyToken error:", err);
    return res.status(500).json({ error: "Token verification failed" });
  }
}

/* Normalizes DOB input:
 * Accepts either 'YYYY-MM-DD' or 'DD-MM-YYYY' (user may see dd-mm-yyyy)
 * Returns ISO date string 'YYYY-MM-DD' or null if empty
 */
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

/* GET /user/me/profile
 * returns { profile: { full_name, stream, year_of_study, semester, email, contact, dob } }
 */
router.get("/me/profile", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("full_name,stream,year_of_study,semester,email,contact,dob")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("Error reading profile:", error);
      return res.status(500).json({ error: error.message || "DB read error" });
    }

    // normalize response shape to frontend-friendly keys
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
    console.error("Unexpected error GET /user/me/profile:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/* PUT /user/me/profile */
router.put("/me/profile", verifyToken, express.json(), async (req, res) => {
  try {
    const userId = req.user.id;
    // fetch current profile to compare & validate
    const { data: current, error: curErr } = await supabaseAdmin
      .from("profiles")
      .select("full_name,stream,year_of_study,semester,email,contact,dob")
      .eq("id", userId)
      .maybeSingle();

    if (curErr) {
      console.error("Failed to fetch current profile:", curErr);
      return res.status(500).json({ error: "Failed to fetch current profile" });
    }

    const body = req.body || {};

    // Allowed editable keys
    const editableKeys = ["stream", "year_of_study", "semester", "dob"];

    // Build update object from body, apply normalization & validation
    const updates = {};
    // 1) stream
    if ("stream" in body) {
      const raw = (body.stream || "").toString().trim();
      if (raw === "" && current?.stream) {
        return res.status(400).json({ error: "Stream cannot be cleared once set" });
      }
      updates.stream = raw;
    }

    // 2) year_of_study (maps to frontend academicYear)
    if ("year_of_study" in body) {
      const raw = (body.year_of_study || "").toString().trim();
      if (raw === "" && current?.year_of_study) {
        return res.status(400).json({ error: "Academic Year cannot be cleared once set" });
      }
      updates.year_of_study = raw;
    }

    // 3) semester
    if ("semester" in body) {
      const raw = (body.semester || "").toString().trim();
      if (raw === "" && current?.semester) {
        return res.status(400).json({ error: "Semester cannot be cleared once set" });
      }
      if (raw) {
        const okSem = /^\d+(st|nd|rd|th)?$/i.test(raw);
        if (!okSem) {
          return res.status(400).json({ error: "Semester must be in format like 'nth'" });
        }
        updates.semester = raw;
      } else {
        updates.semester = raw;
      }
    }

    // 4) dob
    if ("dob" in body) {
      const rawDob = body.dob;
      const normalized = normalizeDob(rawDob);
      // If user is trying to clear DOB but already had a value -> disallow
      if ((normalized === null || normalized === "") && current?.dob) {
        return res.status(400).json({ error: "Date of Birth cannot be cleared once set via profile" });
      }
      updates.dob = normalized; // may be null
    }

    // If no editable fields provided, return 400
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No editable fields provided" });
    }

    // perform update
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("profiles")
      .update(updates, { returning: "representation" })
      .eq("id", userId)
      .maybeSingle();

    if (updateErr) {
      console.error("Failed to update profile:", updateErr);
      return res.status(500).json({ error: updateErr.message || "Failed to update profile" });
    }

    // Respond with normalized profile
    const profile = {
      full_name: updated?.full_name ?? current?.full_name ?? "",
      stream: updated?.stream ?? current?.stream ?? "",
      year_of_study: updated?.year_of_study ?? current?.year_of_study ?? "",
      semester: updated?.semester ?? current?.semester ?? "",
      email: updated?.email ?? current?.email ?? req.user.email ?? "",
      contact: updated?.contact ?? current?.contact ?? "",
      dob: updated?.dob ?? current?.dob ?? null,
    };

    return res.json({ ok: true, profile });
  } catch (err) {
    console.error("Unexpected error PUT /user/me/profile:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
