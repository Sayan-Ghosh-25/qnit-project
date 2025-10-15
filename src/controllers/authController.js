// src/controllers/authController.js
import fetch from "node-fetch";
import crypto from "crypto";
import { supabaseAdmin } from "../config/supabaseClient.js";
import { signInUser } from "../services/authService.js";
import { verifyCaptcha } from "../services/captchaService.js";
import { sendAdminPrivateKeyEmail } from "../services/emailService.js";

/* Config */
const PRIVATE_KEY_LENGTH = parseInt(process.env.PRIVATE_KEY_LENGTH || "6", 10);
const OTP_EXPIRE_MINUTES = parseInt(process.env.OTP_EXPIRE_MINUTES || "10", 10);
const ADMIN_NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || null;

/*** Crypto Helpers ***/
async function hashString(input) {
  const salt = crypto.randomBytes(16).toString("base64");
  const hash = crypto.createHmac("sha256", salt).update(String(input)).digest("hex");
  return { salt, hash };
}

async function verifyHash(input, salt, expectedHash) {
  const hash = crypto.createHmac("sha256", String(salt)).update(String(input)).digest("hex");
  try {
    const a = Buffer.from(hash, "hex");
    const b = Buffer.from(String(expectedHash), "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (e) {
    return false;
  }
}

/** OTP Timer Helper **/
export function nowPlusMinutes(mins = 10) {
  return new Date(Date.now() + mins * 60 * 1000);
}

/** GET /auth/student-id-lookup?name=... */
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

/* Sign In operation handler */
export const signIn = async (req, res) => {
  try {
    const { email, password, captchaToken, role } = req.body;

    if (!email || !password || !captchaToken) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Verify captcha first
    const isHuman = await verifyCaptcha(captchaToken);
    if (!isHuman) {
      return res.status(403).json({ error: "Captcha verification failed" });
    }

    // Expected role may be undefined/null
    let user;
    try {
      user = await signInUser(email, password, role || null);
    } catch (err) {
      return res.status(401).json({ error: err.message || "Invalid Credentials" });
    }

    return res.status(200).json({
      message: "Sign In Successful",
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (err) {
    console.error("signIn controller error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

/* POST /auth/private-key/generate */
export async function requestPrivateKey(req, res) {
  try {
    const { email: rawEmail = null, contact: rawContact = null, purpose = "signup" } = req.body || {};
    const email = rawEmail ? String(rawEmail).trim().toLowerCase() : null;
    const contact = rawContact ? String(rawContact).trim() : null;

    if (!email && !contact) {
      return res.status(400).json({ ok: false, error: "email or contact required" });
    }

    // Generate Raw Code (alphanumeric uppercase)
    const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const buf = crypto.randomBytes(PRIVATE_KEY_LENGTH);
    let rawCode = "";
    for (let i = 0; i < PRIVATE_KEY_LENGTH; i++) rawCode += charset[buf[i] % charset.length];

    // Hash & Store
    const { salt, hash } = await hashString(rawCode);
    const expires_at = nowPlusMinutes(OTP_EXPIRE_MINUTES).toISOString();

    const insertPayload = {
      code_hash: hash,
      code_salt: salt,
      generated_for_email: email || null,
      generated_for_contact: contact || null,
      purpose,
      expires_at,
      used: false,
      created_at: new Date().toISOString(),
    };

    // Insert row and retrieve id
    const { data: insertData, error: insertErr } = await supabaseAdmin
      .from("admin_private_keys")
      .insert([insertPayload])
      .select("id")
      .maybeSingle();

    if (insertErr || !insertData) {
      console.error("requestPrivateKey: DB insert error:", insertErr);
      return res.status(500).json({ ok: false, error: "Failed to generate private key request" });
    }

    const rowId = insertData.id;

    // Send admin email via emailService — do not expose rawCode in API response
    const applicant = email || contact;
    let adminEmailSent = false;
    let adminEmailError = null;

    if (ADMIN_NOTIFY_EMAIL) {
      try {
        const sendResp = await sendAdminPrivateKeyEmail({
          adminEmail: ADMIN_NOTIFY_EMAIL,
          applicant,
          rawCode,
          expiresAtIso: expires_at,
        });

        adminEmailSent = true;

        console.log("requestPrivateKey: admin email sendResp:", sendResp);
      } catch (e) {
        adminEmailError = (e && (e.response || e.message)) || String(e);
        console.error("requestPrivateKey: admin email failed:", adminEmailError);
      }
    } else {
      console.warn("requestPrivateKey: ADMIN_NOTIFY_EMAIL not configured");
    }

    return res.json({ ok: true, admin_notified: adminEmailSent, admin_error: adminEmailError || undefined });
  } catch (err) {
    console.error("requestPrivateKey:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}

/* POST /auth/private-key/verify
   Verify against hashed rows in admin_private_keys table */
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
      .limit(20)
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
      if (ok) {
        matched = row;
        break;
      }
    }
    if (!matched) return res.status(400).json({ verified: false, message: "Invalid Code" });

    await supabaseAdmin
      .from("admin_private_keys")
      .update({ used: true, used_at: new Date().toISOString() })
      .eq("id", matched.id);

    return res.json({ verified: true });
  } catch (err) {
    console.error("verifyPrivateKey:", err);
    return res.status(500).json({ verified: false, error: "Server error" });
  }
}

/* GET /auth/check-user?field=email&value=... */
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

/** POST /auth/register **/
export async function registerUser(req, res) {
  try {
    const {
      email: rawEmail, password, role = "student", full_name,
      contact = null, stream = null, year_of_study = null, access_key = null
    } = req.body || {};

    // Minimal required fields for client-side signUp flow
    if (!rawEmail || !password || !full_name) {
      return res.status(400).json({ ok: false, error: "Missing required fields: email, password, full_name" });
    }
    const email = String(rawEmail).trim().toLowerCase();

    // 1) Email uniqueness check
    try {
      const { data: existingAuthUser, error: authErr } = await supabaseAdmin
        .from("auth.users")
        .select("id, email_confirmed_at")
        .eq("email", email)
        .maybeSingle();

      if (authErr) {
        console.warn("registerUser: checking auth.users failed:", authErr);
      } else if (existingAuthUser?.id) {
        // if a record exists at auth.users -> stop here (prevent duplicate signup)
        return res.status(400).json({ ok: false, error: "Email already registered! Please sign in or use password reset" });
      }
    } catch (e) {
      console.warn("registerUser: auth.users check threw:", e);
    }

    // 2) Contact uniqueness check
    if (contact) {
      try {
        const { data: existingContact } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("contact", String(contact).trim())
          .maybeSingle();
        if (existingContact?.id) {
          return res.status(400).json({ ok: false, error: "Contact number already in use! Use a different contact or sign in" });
        }
      } catch (e) {
        console.warn("registerUser: checking profiles contact failed:", e);
      }
    }

    // 3) If student, validate access_key strictly against student_ids table
    if (role === "student") {
      const access = access_key ? String(access_key).trim() : null;
      if (!access || access.length === 0) {
        return res.status(400).json({ ok: false, error: "Access key required for student registration" });
      }

      // Try direct id4 match first
      let match = null;
      try {
        const { data: byId4, error: id4Err } = await supabaseAdmin
          .from("student_ids")
          .select("id4, original_name, normalized_name")
          .eq("id4", access)
          .maybeSingle();

        if (id4Err) {
          console.warn("registerUser: student_ids id4 lookup failed:", id4Err);
        } else if (byId4 && byId4.id4) {
          match = byId4;
        }
      } catch (e) {
        console.warn("registerUser: student_ids id4 lookup threw:", e);
      }

      // If not found by id4, try normalized name match (user may paste name instead)
      if (!match) {
        const normalizedInput = String(access).toLowerCase().replace(/\s+/g, "");
        try {
          const { data: byNorm, error: normErr } = await supabaseAdmin
            .from("student_ids")
            .select("id4, original_name, normalized_name")
            .eq("normalized_name", normalizedInput)
            .maybeSingle();

          if (normErr) {
            console.warn("registerUser: student_ids normalized lookup failed:", normErr);
          } else if (byNorm && byNorm.id4) {
            match = byNorm;
          }
        } catch (e) {
          console.warn("registerUser: student_ids normalized lookup threw:", e);
        }
      }

      if (!match) {
        return res.status(400).json({ ok: false, error: "Invalid Key! No matching student record found" });
      }

      // Also ensure that this access_key is not already used in profiles
      try {
        const { data: existingAccess, error: exErr } = await supabaseAdmin
          .from("profiles")
          .select("id, email")
          .eq("access_key", match.id4)
          .maybeSingle();

        if (exErr) {
          console.warn("registerUser: profiles access_key lookup failed:", exErr);
        } else if (existingAccess && existingAccess.id) {
          return res.status(400).json({ ok: false, error: "This access key is associated with another student" });
        }
      } catch (e) {
        console.warn("registerUser: profiles access_key lookup threw:", e);
      }
    }

    // All validations passed — Do not create auth user here; let client call supabase.auth.signUp()
    return res.json({ ok: true, validated: true, message: "Validation Successful! Proceed to Next Step" });
  } catch (err) {
    console.error("registerUser:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}

/* POST /auth/password/update */
export async function updatePassword(req, res) {
  try {
    const userId = req.user?.id;
    const password = req.body?.password;

    if (!userId || !password) return res.status(400).json({ ok: false, error: "missing" });

    // Fetch profile timestamps
    const { data: profileData, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("last_password_change, created_at")
      .eq("id", userId)
      .maybeSingle();

    if (profileErr) {
      console.warn("updatePassword: failed to read profile timestamps:", profileErr);
    }

    const last = profileData?.last_password_change ? new Date(profileData.last_password_change) : null;
    const created = profileData?.created_at ? new Date(profileData.created_at) : null;

    if (last) {
      let isInitialMarker = false;
      if (created) {
        const deltaMs = Math.abs(last.getTime() - created.getTime());
        if (deltaMs <= 2 * 60 * 1000) {
          isInitialMarker = true;
        }
      }

      if (!isInitialMarker) {
        const diffDays = (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays < 30) {
          return res.status(400).json({ ok: false, error: "You can change password only once every 30 days" });
        }
      }
    }

    // Update auth user password via admin (service-role)
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
    if (error) {
      console.error("updatePassword: supabase update error:", error);
      throw error;
    }

    // Update profiles.last_password_change to now
    try {
      await supabaseAdmin.from("profiles").update({ last_password_change: new Date().toISOString() }).eq("id", userId);
    } catch (e) {
      console.warn("updatePassword: failed to persist last_password_change:", e);
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("updatePassword:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}

/** POST /auth/reset-password
 ** Body: { email, captchaToken? } **/
export async function resetPassword(req, res) {
  try {
    const { email: rawEmail = null, captchaToken = null } = req.body || {};
    const email = rawEmail ? String(rawEmail).trim().toLowerCase() : null;

    if (!email) {
      return res.status(400).json({ ok: false, error: "email required" });
    }

    // Verify if captchaToken provided
    if (captchaToken) {
      const human = await verifyCaptcha(captchaToken);
      if (!human) {
        return res.status(403).json({ ok: false, error: "Captcha verification failed" });
      }
    }

    // Use a redirect URL for the reset link (prefer env)
    const redirectTo = process.env.PASSWORD_RESET_REDIRECT;

    // Trigger Supabase to send reset email pointing to your frontend redirect URL
    let sent = false;
    let internalError = null;

    try {
      if (typeof supabaseAdmin.auth?.resetPasswordForEmail === "function") {
        const { data, error } = await supabaseAdmin.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
        sent = true;
      } else if (typeof supabaseAdmin.auth?.api?.resetPasswordForEmail === "function") {
        const { data, error } = await supabaseAdmin.auth.api.resetPasswordForEmail(email, redirectTo);
        if (error) throw error;
        sent = true;
      } else {
        const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
        const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

        if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
          console.warn("resetPassword: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured");
        } else {
          const url = `${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/recover`;
          const resp = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({ email, redirect_to: redirectTo }),
          });

          if (resp.ok) {
            sent = true;
          } else {
            const text = await resp.text().catch(() => null);
            internalError = `Recover endpoint error ${resp.status}: ${text}`;
            console.error("resetPassword: recover endpoint failed:", internalError);
          }
        }
      }
    } catch (err) {
      internalError = err;
      console.error("resetPassword: error while triggering reset:", err);
    }

    if (!sent) {
      console.warn("resetPassword: reset email not sent (see server logs). email:", email);
      if (internalError) console.warn("resetPassword internal error:", internalError);
    }

    // Always return a non-enumerating response
    return res.json({
      ok: true,
      message: "If an account with that email exists, a password reset link has been sent."
    });
  } catch (err) {
    console.error("resetPassword:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}

/** DELETE /auth/delete-account */
export async function deleteAccount(req, res) {
  try {
    const userId = req.user?.id;
    const email = req.user?.email;
    const providedPassword = req.body?.password;

    if (!userId || !email) return res.status(401).json({ ok: false, error: "Unauthorized" });
    if (!providedPassword) return res.status(400).json({ ok: false, error: "Password required" });

    // Re-verify credentials
    try {
      const verified = await signInUser(email, providedPassword);
      if (!verified || String(verified.id) !== String(userId)) {
        return res.status(403).json({ ok: false, error: "Password verification failed" });
      }
    } catch (e) {
      console.warn("deleteAccount: credential verify failed:", e);
      return res.status(403).json({ ok: false, error: "Password verification failed" });
    }

    // Best-effort audit log insert
    try {
      await supabaseAdmin.from("account_deletions").insert([
        {
          user_id: userId,
          email,
          reason: req.body?.reason || "self-initiated",
          ip: req.ip || null,
          created_at: new Date().toISOString()
        }
      ]);
    } catch (auditErr) {
      console.warn("deleteAccount: audit insert failed (continuing):", auditErr);
    }

    // Delete profiles row (service role)
    try {
      await supabaseAdmin.from("profiles").delete().eq("id", userId);
    } catch (pErr) {
      console.warn("deleteAccount: failed to delete profile row (continuing):", pErr);
    }

    // Delete auth user (service role)
    try {
      if (supabaseAdmin?.auth?.admin?.deleteUser) {
        const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (delErr) {
          console.error("deleteAccount: supabase admin.deleteUser error:", delErr);
          return res.status(500).json({ ok: false, error: "Failed to delete auth user" });
        }
      } else {
        console.error("deleteAccount: admin delete API not available on supabaseAdmin object");
        return res.status(500).json({ ok: false, error: "Server admin delete not available" });
      }
    } catch (err) {
      console.error("deleteAccount: error deleting auth user:", err);
      return res.status(500).json({ ok: false, error: "Failed to delete account" });
    }

    return res.json({ ok: true, message: "Your Account Has Been Deleted From Our Database! We Are Sorry To See You Go" });
  } catch (err) {
    console.error("deleteAccount:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}

export default {
  studentIdLookup,
  signIn,
  requestPrivateKey,
  verifyPrivateKey,
  checkUser,
  registerUser,
  updatePassword,
  resetPassword,
  deleteAccount,
};