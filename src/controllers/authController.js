import { supabaseAdmin } from "../config/supabaseClient.js";
import { sendEmail } from "../utils/emailService.js";
import { genNumericOTP, hashString, verifyHash } from "../utils/crypto.js";
import { nowPlusMinutes } from "../utils/otpService.js";

/**
 * POST /auth/otp/generate
 * body: { email?, contact?, purpose? }
 */
export async function generateOtp(req, res) {
  try {
    const { email = null, contact = null, purpose = "signup" } = req.body;
    if (!email && !contact) return res.status(400).json({ error: "email or contact required" });

    // Rate limiting for production should be stronger (Redis). This is basic.
    // Create OTP
    const otp = genNumericOTP(6);
    const { salt, hash } = await hashString(otp);
    const expires_at = nowPlusMinutes(10).toISOString();

    await supabaseAdmin.from("otp_requests").insert({
      email: email ? email.toLowerCase() : null,
      contact: contact || null,
      purpose,
      otp_hash: hash,
      otp_salt: salt,
      expires_at
    });

    // Send email with OTP if email provided
    if (email) {
      const html = `<p>Your QNIT verification code is <b>${otp}</b>. It expires in 10 minutes.</p>`;
      await sendEmail(email, "Your QNIT verification code", html);
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("generateOtp:", err);
    return res.status(500).json({ error: (err && err.message) || "Server error" });
  }
}

/**
 * POST /auth/otp/verify
 * body: { email?, contact?, otp, purpose? }
 */
export async function verifyOtp(req, res) {
  try {
    const { email = null, contact = null, otp, purpose = "signup" } = req.body;
    if (!otp || (!email && !contact)) return res.status(400).json({ error: "missing params" });

    // find latest matching otp_requests that is not expired
    const now = new Date().toISOString();
    let query = supabaseAdmin.from("otp_requests").select("*").order("created_at", { ascending: false }).limit(1).filter("purpose", "eq", purpose);
    if (email) query = query.eq("email", email.toLowerCase());
    else query = query.eq("contact", contact);

    const { data: rows, error } = await query;
    if (error) throw error;
    const row = (rows && rows[0]) || null;
    if (!row || new Date(row.expires_at) < new Date()) {
      return res.status(400).json({ verified: false, message: "No valid OTP found or expired" });
    }

    const ok = await verifyHash(otp, row.otp_salt, row.otp_hash);
    if (!ok) {
      // increment attempts
      await supabaseAdmin.from("otp_requests").update({ attempts: row.attempts + 1 }).eq("id", row.id);
      return res.status(400).json({ verified: false, message: "Invalid OTP" });
    }

    // mark verified
    await supabaseAdmin.from("otp_requests").update({ verified: true }).eq("id", row.id);
    return res.json({ verified: true });
  } catch (err) {
    console.error("verifyOtp:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}

/**
 * POST /auth/private-key/generate
 * Body: { email?, contact?, purpose? }
 * Behavior: generate a one-time private code, store hashed, email dev (ADMIN_NOTIFY_EMAIL) with code.
 */
export async function requestPrivateKey(req, res) {
  try {
    const { email = null, contact = null, purpose = "signup" } = req.body;
    if (!email && !contact) return res.status(400).json({ error: "email or contact required" });

    // Generate short alphanumeric code (6 chars)
    const raw = Math.random().toString(36).slice(2, 8).toUpperCase();
    const { salt, hash } = await hashString(raw);
    const expires_at = nowPlusMinutes(10).toISOString();

    await supabaseAdmin.from("admin_private_keys").insert({
      code_hash: hash,
      code_salt: salt,
      generated_for_email: email ? email.toLowerCase() : null,
      generated_for_contact: contact ?? null,
      purpose,
      expires_at
    });

    // Notify developer/admin with the code (developer will send to applicant)
    const admin = process.env.ADMIN_NOTIFY_EMAIL;
    const html = `<p>New admin private key request</p>
      <p>Applicant: ${email ?? contact}</p>
      <p>One-time code: <b>${raw}</b></p>
      <p>Expires at: ${expires_at}</p>`;

    if (admin) await sendEmail(admin, "QNIT: Private key request", html);

    return res.json({ ok: true });
  } catch (err) {
    console.error("requestPrivateKey:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}

/**
 * POST /auth/private-key/verify
 * Body: { email?, contact?, privateKey?, purpose? }
 */
export async function verifyPrivateKey(req, res) {
  try {
    const { email = null, contact = null, privateKey, purpose = "signup" } = req.body;
    if (!privateKey) return res.status(400).json({ error: "privateKey required" });

    // find recent matching keys for recipient that are unused & not expired
    const now = new Date().toISOString();
    let q = supabaseAdmin.from("admin_private_keys").select("*").order("created_at", { ascending: false }).limit(10).filter("used", "eq", false).filter("expires_at", "gt", now).filter("purpose", "eq", purpose);
    if (email) q = q.eq("generated_for_email", email.toLowerCase());
    else q = q.eq("generated_for_contact", contact);

    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) return res.status(400).json({ verified: false, message: "No private key found" });

    let matched = null;
    for (const row of data) {
      const ok = await verifyHash(privateKey.trim(), row.code_salt, row.code_hash);
      if (ok) { matched = row; break; }
    }
    if (!matched) return res.status(400).json({ verified: false, message: "Invalid code" });

    // mark used
    await supabaseAdmin.from("admin_private_keys").update({ used: true, used_at: new Date().toISOString() }).eq("id", matched.id);
    return res.json({ verified: true });
  } catch (err) {
    console.error("verifyPrivateKey:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}

/**
 * GET /auth/check-user?field=email&value=abc@...
 */
export async function checkUser(req, res) {
  try {
    const field = req.query.field;
    const value = req.query.value;
    if (!field || !value) return res.status(400).json({ exists: false });

    if (field === "email") {
      const { data, error } = await supabaseAdmin.from("profiles").select("id").eq("email", value.toLowerCase()).maybeSingle();
      if (error) throw error;
      return res.json({ exists: Boolean(data?.id) });
    } else if (field === "contact") {
      const { data, error } = await supabaseAdmin.from("profiles").select("id").eq("contact", value).maybeSingle();
      if (error) throw error;
      return res.json({ exists: Boolean(data?.id) });
    } else {
      return res.status(400).json({ exists: false });
    }
  } catch (err) {
    console.error("checkUser:", err);
    return res.status(500).json({ exists: false, error: err.message });
  }
}

/**
 * POST /auth/register
 * body: { email, password, role, full_name, contact, stream, year_of_study, access_key }
 *
 * - This endpoint uses service_role to create a user and profiles row.
 * - Caller must have verified OTP and (if admin) privateKeyVerified using previous endpoints.
 */
export async function registerUser(req, res) {
  try {
    const {
      email, password, role = "student", full_name,
      contact = null, stream = null, year_of_study = null, access_key = null
    } = req.body;

    if (!email || !password || !full_name) return res.status(400).json({ error: "missing fields" });

    // create auth user via admin API
    const createPayload = {
      email: email.toLowerCase(),
      password,
      user_metadata: { role, full_name, contact, stream, year_of_study }
    };

    // supabaseAdmin.auth.admin.createUser
    const { data, error } = await supabaseAdmin.auth.admin.createUser(createPayload);
    if (error) {
      // handle common errors gracefully
      return res.status(400).json({ error: error.message || "Failed to create user" });
    }

    const userId = data.user?.id ?? data?.id ?? null;
    if (!userId) {
      console.warn("User created but id missing: ", data);
    }

    // insert profile
    const now = new Date().toISOString();
    const profileRow = {
      id: userId,
      full_name: full_name.trim(),
      email: email.toLowerCase(),
      contact,
      role,
      stream,
      year_of_study,
      access_key: role === "student" ? (access_key || null) : null,
      last_password_change: now
    };

    const { error: pErr } = await supabaseAdmin.from("profiles").upsert([profileRow], { onConflict: "id", returning: "minimal" });
    if (pErr) console.warn("profiles upsert failed:", pErr);

    return res.json({ ok: true, userId });
  } catch (err) {
    console.error("registerUser:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}

/**
 * POST /auth/password/update
 * Body: { password }
 * - This route uses requireAuth middleware which provides req.user (sub / id).
 * - Enforces 30-day rule.
 */
export async function updatePassword(req, res) {
  try {
    const userId = req.user?.id;
    const { password } = req.body;
    if (!userId || !password) return res.status(400).json({ error: "missing" });

    // fetch profile last_password_change
    const { data: profile } = await supabaseAdmin.from("profiles").select("last_password_change").eq("id", userId).maybeSingle();
    const last = profile?.last_password_change ? new Date(profile.last_password_change) : null;
    if (last) {
      const diffDays = (Date.now() - new Date(last).getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays < 30) {
        return res.status(400).json({ error: "You can change password only once every 30 days." });
      }
    }

    // update user's password using admin API
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
    if (error) throw error;

    // update last_password_change in profiles
    await supabaseAdmin.from("profiles").update({ last_password_change: new Date().toISOString() }).eq("id", userId);

    return res.json({ ok: true });
  } catch (err) {
    console.error("updatePassword:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
