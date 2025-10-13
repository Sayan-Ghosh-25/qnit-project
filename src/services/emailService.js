// src/services/emailService.js
import fetch from "node-fetch";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || null;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || null;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN || null;
const DEFAULT_FROM_EMAIL = process.env.FROM_EMAIL || null;
const DEFAULT_FROM_NAME = process.env.FROM_NAME || "QNIT";
const DEFAULT_TIMEOUT_MS = Number(process.env.EMAIL_REQUEST_TIMEOUT_MS || 15000);

/* ---- Utilities ---- */
function ensureEnv() {
  const missing = [];
  if (!GOOGLE_CLIENT_ID) missing.push("GOOGLE_CLIENT_ID");
  if (!GOOGLE_CLIENT_SECRET) missing.push("GOOGLE_CLIENT_SECRET");
  if (!GOOGLE_REFRESH_TOKEN) missing.push("GOOGLE_REFRESH_TOKEN");
  if (!DEFAULT_FROM_EMAIL) missing.push("FROM_EMAIL");
  if (missing.length) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }
}

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* Build admin private key template */
function buildAdminPrivateKeyEmail({ applicant, rawCode, expiresAtIso, adminEmail }) {
  const expiresAtHuman = expiresAtIso ? new Date(expiresAtIso).toLocaleString() : "";
  const year = new Date().getFullYear();
  const html = `<!doctype html>
  <html lang="en">
    <body style="margin:0;padding:0;background:#06203a;font-family:system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial;color:#fff;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="min-width:100%;background:#06203a;padding:20px 12px;">
        <tr>
          <td align="center">
            <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;">
              <tr>
                <td style="background:#06203a;padding:12px 18px;border-radius:8px 8px 0 0;">
                  <div style="display:flex;justify-content:center;gap:12px;">
                    <div style="font-size:16px;color:#ffd166;font-weight:700;letter-spacing:0.6px;">Admin Private Key Request</div>
                  </div>
                </td>
              </tr>

              <tr>
                <td style="background:#0b2f52;border-radius:8px;padding:22px 20px;">
                  <p style="margin:0 0 14px;color:#dbe9ff;font-size:14px;line-height:1.45;">
                    A new private key request has been submitted by <strong>${escapeHtml(applicant)}</strong>.
                  </p>

                  <div style="padding:14px;border-radius:8px;background:#05223c;border:1px solid rgba(255,209,102,0.06);margin-bottom:12px;text-align:center;">
                    <div style="font-size:15px;color:#ffffff;margin-bottom:6px;">One-Time Private Key</div>
                    <div style="font-size:20px;letter-spacing:2px;font-weight:700;color:#ffd166;">${escapeHtml(rawCode)}</div>
                    <div style="font-size:12px;color:#9fb7db;margin-top:8px;">Expires at: ${escapeHtml(expiresAtHuman)}</div>
                  </div>

                  <p style="margin:0;color:#bcd6f7;font-size:13px;">
                    This code is sensitive. Do not forward it, use it properly. <br/> Contact the applicant to approve or reject the request.
                  </p>

                  <hr style="border:none;border-top:2px solid rgba(255,255,255,0.5);margin:18px 0;">
                  <small style="color:#9fb7db;font-size:12px;">
                    Sent to admin: ${escapeHtml(adminEmail || "")} <br/> If you believe this is an error, contact devtruster@gmail.com
                  </small>
                </td>
              </tr>

              <tr>
                <td style="padding:10px 6px 0;text-align:center;color:#8fb0d6;font-size:12px;">
                  © ${year} QNIT. All Rights Reserved.
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`;

  const text = `Admin Private Key Request
  Applicant: ${applicant}
  One-time key: ${rawCode}
  Expires at: ${expiresAtHuman}
  Sent to admin: ${adminEmail}
  © ${year} QNIT`;

  return { html, text };
}

/* base64url encode RFC822 raw message */
function base64UrlEncode(strOrBuffer) {
  const b = Buffer.isBuffer(strOrBuffer) ? strOrBuffer : Buffer.from(String(strOrBuffer), "utf8");
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/* Build a RFC2822 / MIME multipart/alternative message */
function buildRawMessage({ fromEmail, fromName, to, subject, html, text }) {
  // Use CRLF for headers/body separation
  const boundary = `----=_NextPart_${Math.random().toString(36).slice(2, 12)}`;
  const headers = [
    `From: ${fromName ? `${fromName} <${fromEmail}>` : fromEmail}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    "",
  ].join("\r\n");

  const plainSection = [
    `--${boundary}`,
    `Content-Type: text/plain; charset="utf-8"`,
    `Content-Transfer-Encoding: 7bit`,
    "",
    text || "",
    "",
  ].join("\r\n");

  const htmlSection = [
    `--${boundary}`,
    `Content-Type: text/html; charset="utf-8"`,
    `Content-Transfer-Encoding: 7bit`,
    "",
    html || "",
    "",
  ].join("\r\n");

  const closing = [`--${boundary}--`, ""].join("\r\n");
  const raw = headers + plainSection + htmlSection + closing;
  return base64UrlEncode(raw);
}

/* Exchange refresh token for access token */
async function getAccessToken() {
  ensureEnv();

  const body = new URLSearchParams();
  body.set("client_id", GOOGLE_CLIENT_ID);
  body.set("client_secret", GOOGLE_CLIENT_SECRET);
  body.set("refresh_token", GOOGLE_REFRESH_TOKEN);
  body.set("grant_type", "refresh_token");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const resp = await fetch(TOKEN_URL, {
      method: "POST",
      body: body.toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const j = await resp.json().catch(() => null);
    if (!resp.ok) {
      const err = new Error(`Failed to obtain access token: ${resp.status}`);
      err.response = j;
      throw err;
    }
    if (!j || !j.access_token) throw new Error("No access_token in token response");
    return { accessToken: j.access_token, expiresIn: j.expires_in || null, raw: j };
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

/* Send raw message via Gmail API */
async function sendRawEmail({ to, subject, html, text, fromEmail = DEFAULT_FROM_EMAIL, fromName = DEFAULT_FROM_NAME }) {
  ensureEnv();
  if (!to) throw new Error("Recipient `to` is required");

  // Acquire access token
  const { accessToken } = await getAccessToken();
  const raw = buildRawMessage({ fromEmail, fromName, to, subject, html, text });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const resp = await fetch(GMAIL_SEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ raw }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const j = await resp.json().catch(() => null);
    if (!resp.ok) {
      const err = new Error(`Gmail send error ${resp.status}`);
      err.response = j;
      throw err;
    }

    return j;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

/* Public function used by authController */
export async function sendAdminPrivateKeyEmail({ adminEmail, applicant, rawCode, expiresAtIso }) {
  if (!adminEmail) throw new Error("adminEmail required");

  const { html, text } = buildAdminPrivateKeyEmail({ applicant, rawCode, expiresAtIso, adminEmail });
  const resp = await sendRawEmail({
    to: adminEmail,
    subject: "QNIT: New Private Key Request For Admin Role",
    html,
    text,
    fromEmail: DEFAULT_FROM_EMAIL,
    fromName: DEFAULT_FROM_NAME,
  });
  return resp;
}

export default {
  sendAdminPrivateKeyEmail,
};