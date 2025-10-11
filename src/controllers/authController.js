// src/controllers/authController.js
import { supabaseAdmin } from "../config/supabaseClient.js";
import { sendEmail } from "../utils/emailService.js";
import { signInUser } from "../services/authService.js";
import { verifyCaptcha } from "../utils/captchaService.js";
import { genNumericOTP, hashString, verifyHash } from "../utils/crypto.js";
import { nowPlusMinutes } from "../utils/otpService.js";

const OTP_LENGTH = parseInt(process.env.OTP_LENGTH || "6", 10);
const OTP_EXPIRE_MINUTES = parseInt(process.env.OTP_EXPIRE_MINUTES || "10", 10);
const OTP_MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS || "5", 10);
const PRIVATE_KEY_LENGTH = parseInt(process.env.PRIVATE_KEY_LENGTH || "6", 10);

const DEFAULT_FROM_NAME = process.env.FROM_NAME;
const ADMIN_NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL;

/** helper to build professional OTP email */
function buildOtpEmailContent({ otp, expiresMinutes, appName = "QNIT" }) {
  const text = `Your ${appName} verification code is ${otp}. It will expire in ${expiresMinutes} minutes.
If you did not request this, please ignore this message.`;

  const html = `
    <html>
      <body style="font-family: Arial, Helvetica, sans-serif; color:#111; line-height:1.4;">
        <div style="max-width:600px; margin:0 auto; padding:20px;">
          <h2 style="margin-bottom:6px;">${appName} — Verification Code</h2>
          <p style="margin-top:4px; color:#555">Use the code below to complete your action. The code expires in <strong>${expiresMinutes} minutes</strong>.</p>
          <div style="margin:18px 0; padding:16px; background:#f7f7f9; border-radius:6px; text-align:center;">
            <span style="font-size:24px; letter-spacing:2px; font-weight:600;">${otp}</span>
          </div>
          <p style="color:#666; font-size:14px;">If you did not request this code, you can safely ignore this email.</p>
          <hr style="border:none; border-top:1px solid #eee; margin:18px 0;">
          <p style="font-size:12px; color:#999">Sent by ${appName} • Please do not reply to this automated message.</p>
        </div>
      </body>
    </html>
  `;

  return { text, html };
}

/** helper to build admin notification for private key requests */
function buildAdminPrivateKeyEmail({ applicant, rawCode, expiresAt, appName = "QNIT" }) {
  const text = `New private admin key request for ${applicant}
One-time code: ${rawCode}
Expires at: ${expiresAt}`;

  const html = `
    <html>
      <body style="font-family: Arial, Helvetica, sans-serif; color:#111">
        <div style="max-width:600px; margin:0 auto; padding:20px;">
          <h3 style="margin-bottom:6px;">${appName} — Admin Private Key Request</h3>
          <p>Applicant: <strong>${applicant}</strong></p>
          <p>One-time code: <strong style="font-size:18px; letter-spacing:1px;">${rawCode}</strong></p>
          <p>Expires at: ${expiresAt}</p>
          <hr style="border:none; border-top:1px solid #eee; margin:12px 0;">
          <p style="font-size:12px; color:#999">This code is single-use and expires automatically.</p>
        </div>
      </body>
    </html>
  `;

  return { text, html };
}

/**
 * GET /auth/student-id-lookup?name=Full%20Name
 * Returns { found: true, id4, original_name } or { found: false }
 */
export async function studentIdLookup(req, res) {
  try {
    const name = (req.query.name || "").toString().trim();
    if (!name) return res.status(400).json({ found: false, error: "name required" });

    const normalized = name.toLowerCase().replace(/\s+/g, "");
    const { data, error } = await supabaseAdmin
      .from("student_ids")
      .select("id4, original_name")
      .eq("normalized_name", normalized)
      .maybeSingle();

    if (error) {
      console.error("studentIdLookup: DB error:", error);
      return res.status(500).json({ found: false, error: "DB error" });
    }
    if (!data) return res.json({ found: false });

    return res.json({ found: true, id4: data.id4, original_name: data.original_name });
  } catch (err) {
    console.error("studentIdLookup:", err);
    return res.status(500).json({ found: false, error: "Server error" });
  }
}

/* sign in operation handler */
export const signIn = async (req, res) => {
  try {
    const { email, password, captchaToken } = req.body;

    if (!email || !password || !captchaToken) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Verify captcha first
    const isHuman = await verifyCaptcha(captchaToken);
    if (!isHuman) {
      return res.status(403).json({ error: "Captcha verification failed" });
    }

    const user = await signInUser(email, password);

    return res.status(200).json({
      message: "Sign in Successful",
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (err) {
    return res.status(401).json({ error: err.message });
  }
};

/**
 * POST /auth/otp/generate
 * body: { email?, contact?, purpose? }
 *
 * NOTE: email sending left intact (unchanged) — we only ensured email status variables are declared
 * before use so no ReferenceError occurs.
 */
export async function generateOtp(req, res) {
  try {
    const { email: rawEmail = null, contact: rawContact = null, purpose = "signup" } = req.body || {};
    const email = rawEmail ? String(rawEmail).trim().toLowerCase() : null;
    const contact = rawContact ? String(rawContact).trim() : null;

    if (!email && !contact) {
      return res.status(400).json({ ok: false, error: "Either email or contact is required." });
    }

    // Generate OTP
    const otp = genNumericOTP(OTP_LENGTH);
    const { salt, hash } = await hashString(otp);
    const expires_at = nowPlusMinutes(OTP_EXPIRE_MINUTES).toISOString();

    // Insert OTP request into DB
    const insertPayload = {
      email: email || null,
      contact: contact || null,
      purpose,
      otp_hash: hash,
      otp_salt: salt,
      expires_at,
      attempts: 0,
      verified: false,
      email_sent: false,
      email_response: null,
      message_id: null
    };

    const { data: insertData, error: insertErr } = await supabaseAdmin
      .from("otp_requests")
      .insert([insertPayload])
      .select("id")
      .single();

    if (insertErr) {
      console.error("generateOtp: DB insert error:", insertErr);
      return res.status(500).json({ ok: false, error: "Failed to create OTP request." });
    }

    const otpRequestId = insertData?.id ?? null;

    // Initialize email sending status
    let emailSent = false;
    let emailError = null;

    // Send email if email is provided (kept logic unchanged)
    if (email) {
      try {
        const { html, text } = buildOtpEmailContent({ otp, expiresMinutes: OTP_EXPIRE_MINUTES });
        const sendResp = await sendEmail(email, "Your QNIT verification code", html, {
          text,
          fromName: DEFAULT_FROM_NAME
        });

        emailSent = true;

        // Update DB with email status
        await supabaseAdmin.from("otp_requests").update({
          email_sent: true,
          email_response: sendResp,
          message_id: sendResp?.messageId || null
        }).eq("id", otpRequestId);

        console.log("generateOtp: OTP email sent:", sendResp);
      } catch (e) {
        emailError = (e?.response || e?.message) || String(e) || "Unknown email error";
        console.error("generateOtp: email send failed:", emailError);

        // Update DB with failed email attempt (best effort)
        try {
          await supabaseAdmin.from("otp_requests").update({
            email_sent: false,
            email_response: emailError
          }).eq("id", otpRequestId);
        } catch (updErr) {
          console.error("generateOtp: failed to update otp_requests with email failure:", updErr);
        }

        // Return explicit error so frontend doesn't assume OTP was sent
        return res.status(502).json({ ok: false, email_sent: false, error: emailError });
      }
    }

    // success path
    return res.json({ ok: true, email_sent: email ? emailSent : false, otp_request_id: otpRequestId });
  } catch (err) {
    console.error("generateOtp:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}

/**
 * POST /auth/otp/verify
 * body: { email?, contact?, otp, purpose? }
 */
export async function verifyOtp(req, res) {
  try {
    const { email: rawEmail = null, contact: rawContact = null, otp: rawOtp, purpose = "signup" } = req.body || {};
    const email = rawEmail ? String(rawEmail).trim().toLowerCase() : null;
    const contact = rawContact ? String(rawContact).trim() : null;
    const otp = rawOtp ? String(rawOtp).trim() : null;

    if (!otp || (!email && !contact)) {
      return res.status(400).json({ verified: false, error: "Missing parameters" });
    }

    const now = new Date().toISOString();
    let query = supabaseAdmin.from("otp_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .filter("purpose", "eq", purpose);

    query = email ? query.eq("email", email) : query.eq("contact", contact);

    const { data: rows, error } = await query;
    if (error) {
      console.error("verifyOtp: DB query error:", error);
      throw error;
    }

    const row = (rows && rows[0]) || null;
    if (!row) {
      return res.status(400).json({ verified: false, message: "No OTP request found." });
    }

    if (new Date(row.expires_at) < new Date()) {
      return res.status(400).json({ verified: false, message: "OTP expired." });
    }

    const attempts = Number(row.attempts || 0);
    if (attempts >= OTP_MAX_ATTEMPTS) {
      return res.status(429).json({ verified: false, message: "Too many failed attempts. Please request a new code." });
    }

    const ok = await verifyHash(otp, row.otp_salt, row.otp_hash);
    if (!ok) {
      await supabaseAdmin.from("otp_requests").update({ attempts: attempts + 1 }).eq("id", row.id);
      return res.status(400).json({ verified: false, message: "Invalid OTP." });
    }

    await supabaseAdmin.from("otp_requests").update({ verified: true, attempts: 0 }).eq("id", row.id);
    return res.json({ verified: true });
  } catch (err) {
    console.error("verifyOtp:", err);
    return res.status(500).json({ verified: false, error: "Server error" });
  }
}

/**
 * POST /auth/private-key/generate
 */
export async function requestPrivateKey(req, res) {
  try {
    const { email: rawEmail = null, contact: rawContact = null, purpose = "signup" } = req.body || {};
    const email = rawEmail ? String(rawEmail).trim().toLowerCase() : null;
    const contact = rawContact ? String(rawContact).trim() : null;

    if (!email && !contact) {
      return res.status(400).json({ ok: false, error: "email or contact required" });
    }

    const rawCode = Math.random().toString(36).slice(2, 2 + PRIVATE_KEY_LENGTH).toUpperCase();
    const { salt, hash } = await hashString(rawCode);
    const expires_at = nowPlusMinutes(OTP_EXPIRE_MINUTES).toISOString();

    const insertPayload = {
      code_hash: hash,
      code_salt: salt,
      generated_for_email: email || null,
      generated_for_contact: contact || null,
      purpose,
      expires_at,
      used: false
    };

    const { error: insertErr } = await supabaseAdmin.from("admin_private_keys").insert([insertPayload]);
    if (insertErr) {
      console.error("requestPrivateKey: DB insert error:", insertErr);
      return res.status(500).json({ ok: false, error: "Failed to generate private key request." });
    }

    const applicant = email || contact;
    const adminHtmlObj = buildAdminPrivateKeyEmail({ applicant, rawCode, expiresAt: expires_at });

    let adminEmailSent = false;
    let adminEmailError = null;
    if (ADMIN_NOTIFY_EMAIL) {
      try {
        await sendEmail(ADMIN_NOTIFY_EMAIL, "QNIT: Private key request", adminHtmlObj.html, {
          text: adminHtmlObj.text,
          fromName: DEFAULT_FROM_NAME
        });
        adminEmailSent = true;
      } catch (e) {
        adminEmailError = (e && (e.response || e.message)) || "Unknown admin email error";
        console.error("requestPrivateKey: admin email failed:", adminEmailError);
      }
    } else {
      console.warn("requestPrivateKey: ADMIN_NOTIFY_EMAIL not configured; admin not notified.");
    }

    return res.json({ ok: true, admin_notified: adminEmailSent, admin_error: adminEmailError || undefined });
  } catch (err) {
    console.error("requestPrivateKey:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}

/**
 * POST /auth/private-key/verify
 */
export async function verifyPrivateKey(req, res) {
  try {
    const { email: rawEmail = null, contact: rawContact = null, privateKey: rawKey, purpose = "signup" } = req.body || {};
    const email = rawEmail ? String(rawEmail).trim().toLowerCase() : null;
    const contact = rawContact ? String(rawContact).trim() : null;
    const privateKey = rawKey ? String(rawKey).trim() : null;

    if (!privateKey) return res.status(400).json({ verified: false, error: "privateKey required" });

    const now = new Date().toISOString();
    let q = supabaseAdmin.from("admin_private_keys")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10)
      .filter("used", "eq", false)
      .filter("expires_at", "gt", now)
      .filter("purpose", "eq", purpose);

    q = email ? q.eq("generated_for_email", email) : q.eq("generated_for_contact", contact);

    const { data, error } = await q;
    if (error) {
      console.error("verifyPrivateKey: DB query error:", error);
      throw error;
    }
    if (!data || data.length === 0) return res.status(400).json({ verified: false, message: "No private key found" });

    let matched = null;
    for (const row of data) {
      const ok = await verifyHash(privateKey, row.code_salt, row.code_hash);
      if (ok) { matched = row; break; }
    }
    if (!matched) return res.status(400).json({ verified: false, message: "Invalid code" });

    await supabaseAdmin.from("admin_private_keys").update({ used: true, used_at: new Date().toISOString() }).eq("id", matched.id);
    return res.json({ verified: true });
  } catch (err) {
    console.error("verifyPrivateKey:", err);
    return res.status(500).json({ verified: false, error: "Server error" });
  }
}

/**
 * GET /auth/check-user?field=email&value=...
 */
export async function checkUser(req, res) {
  try {
    const field = req.query.field;
    const value = req.query.value;
    if (!field || !value) return res.status(400).json({ exists: false });

    if (field === "email") {
      const { data, error } = await supabaseAdmin.from("profiles").select("id").eq("email", String(value).toLowerCase()).maybeSingle();
      if (error) {
        console.error("checkUser email query error:", error);
        throw error;
      }
      return res.json({ exists: Boolean(data?.id) });
    } else if (field === "contact") {
      const { data, error } = await supabaseAdmin.from("profiles").select("id").eq("contact", String(value)).maybeSingle();
      if (error) {
        console.error("checkUser contact query error:", error);
        throw error;
      }
      return res.json({ exists: Boolean(data?.id) });
    } else {
      return res.status(400).json({ exists: false });
    }
  } catch (err) {
    console.error("checkUser:", err);
    return res.status(500).json({ exists: false, error: "Server error" });
  }
}

/**
 * POST /auth/register
 * body: { email, password, role, full_name, contact, stream, year_of_study, access_key }
 *
 * Uses service role to create auth user and upsert profiles row.
 */
export async function registerUser(req, res) {
  try {
    const {
      email: rawEmail, password, role = "student", full_name,
      contact = null, stream = null, year_of_study = null, access_key = null
    } = req.body || {};

    if (!rawEmail || !password || !full_name) {
      return res.status(400).json({ ok: false, error: "Missing required fields: email, password, full_name." });
    }
    const email = String(rawEmail).trim().toLowerCase();

    // 1) Check auth.users for existing email (friendly error)
    try {
      const { data: existingAuthUser } = await supabaseAdmin
        .from("auth.users")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (existingAuthUser?.id) {
        return res.status(400).json({ ok: false, error: "Email already registered. Please sign in or use password reset." });
      }
    } catch (e) {
      console.warn("registerUser: checking auth.users failed (continuing):", e);
    }

    // 2) Check contact uniqueness if provided
    if (contact) {
      try {
        const { data: existingContact } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("contact", String(contact).trim())
          .maybeSingle();
        if (existingContact?.id) {
          return res.status(400).json({ ok: false, error: "Contact number already in use. Use a different contact or sign in." });
        }
      } catch (e) {
        console.warn("registerUser: checking profiles contact failed (continuing):", e);
      }
    }

    // create user in Supabase Auth (service role)
    // include access_key in user_metadata so DB trigger can read it immediately if provided by frontend
    const createPayload = {
      email,
      password,
      user_metadata: {
        role,
        full_name: String(full_name).trim(),
        contact,
        stream,
        year_of_study,
        access_key: access_key || null
      }
    };

    const { data, error } = await supabaseAdmin.auth.admin.createUser(createPayload);
    if (error) {
      console.warn("registerUser: createUser error:", error);
      const msg = error?.message || String(error);
      if (/duplicate|already exists/i.test(msg)) {
        return res.status(400).json({ ok: false, error: "Email already registered. Please sign in or reset password." });
      }
      return res.status(400).json({ ok: false, error: msg || "Failed to create user" });
    }

    const userId = data.user?.id ?? data?.id ?? null;
    if (!userId) {
      console.warn("registerUser: user created but id missing:", data);
    }

    // Best-effort upsert to profiles to ensure stream/year/access_key are set if trigger didn't
    try {
      const now = new Date().toISOString();
      const profileRow = {
        id: userId,
        full_name: String(full_name).trim(),
        email,
        contact,
        role,
        stream,
        year_of_study,
        access_key: role === "student" ? (access_key || null) : null,
        last_password_change: now
      };

      const { error: pErr } = await supabaseAdmin.from("profiles").upsert([profileRow], { onConflict: "id", returning: "minimal" });
      if (pErr) {
        console.warn("registerUser: profiles upsert warning:", pErr);
      }
    } catch (err) {
      console.warn("registerUser: profiles upsert failed (continuing):", err);
    }

    return res.json({ ok: true, userId });
  } catch (err) {
    console.error("registerUser:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}

/**
 * POST /auth/password/update
 */
export async function updatePassword(req, res) {
  try {
    const userId = req.user?.id;
    const password = req.body?.password;

    if (!userId || !password) return res.status(400).json({ ok: false, error: "missing" });

    const { data: profile } = await supabaseAdmin.from("profiles").select("last_password_change").eq("id", userId).maybeSingle();
    const last = profile?.last_password_change ? new Date(profile.last_password_change) : null;
    if (last) {
      const diffDays = (Date.now() - new Date(last).getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays < 30) {
        return res.status(400).json({ ok: false, error: "You can change password only once every 30 days." });
      }
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
    if (error) {
      console.error("updatePassword: supabase update error:", error);
      throw error;
    }

    await supabaseAdmin.from("profiles").update({ last_password_change: new Date().toISOString() }).eq("id", userId);
    return res.json({ ok: true });
  } catch (err) {
    console.error("updatePassword:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}