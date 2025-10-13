// src/services/emailService.js
import nodemailer from "nodemailer";

const EMAIL_USER = process.env.EMAIL_USER || null;
const EMAIL_PASS = process.env.EMAIL_PASS || null;
const DEFAULT_FROM_EMAIL = process.env.FROM_EMAIL;
const DEFAULT_FROM_NAME = process.env.FROM_NAME;
const DEFAULT_TIMEOUT_MS = Number(process.env.EMAIL_REQUEST_TIMEOUT_MS || 15000);

// small helper to escape user-provided strings when interpolating into HTML
function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* Template builder for admin private-key email */
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

/* Gmail Sender Using nodemailer */
async function sendEmailViaGmail({ to, subject, html, text, fromEmail = DEFAULT_FROM_EMAIL, fromName = DEFAULT_FROM_NAME }) {
  if (!EMAIL_USER) throw new Error("EMAIL_USER is not configured");
  if (!EMAIL_PASS) throw new Error("EMAIL_PASS is not configured");
  if (!fromEmail) throw new Error("FROM_EMAIL is not configured");
  if (!to) throw new Error("Recipient `to` is required");

  // Build Transporter
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS,
    },
    connectionTimeout: DEFAULT_TIMEOUT_MS,
    greetingTimeout: DEFAULT_TIMEOUT_MS,
    socketTimeout: DEFAULT_TIMEOUT_MS,
  });

  const from = `"${fromName}" <${fromEmail}>`;
  const mailOptions = {
    from,
    to,
    subject: subject || "",
    html: html || undefined,
    text: text || undefined,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return {
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
      response: info.response,
      raw: info,
    };
  } catch (err) {
    const out = new Error(err.message || "Failed To Send Email");
    out.original = err;
    throw out;
  }
}

/* Public function used by authController */
export async function sendAdminPrivateKeyEmail({ adminEmail, applicant, rawCode, expiresAtIso }) {
  if (!adminEmail) throw new Error("adminEmail required");

  const { html, text } = buildAdminPrivateKeyEmail({ applicant, rawCode, expiresAtIso, adminEmail });
  const resp = await sendEmailViaGmail({
    to: adminEmail,
    subject: "QNIT: New Private Key Request For Admin Role",
    html,
    text,
  });
  return resp;
}
export default { sendAdminPrivateKeyEmail };