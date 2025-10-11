// src/utils/mailWorker.js
import { supabaseAdmin } from "../config/supabaseClient.js";
import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST || null;
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER || null;
const SMTP_PASS = process.env.SMTP_PASS || null;
const FROM_EMAIL = process.env.FROM_EMAIL;
const FROM_NAME = process.env.FROM_NAME;

async function sendViaSmtp({ from, to, subject, html, text, attachments }) {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) throw new Error("SMTP not configured");
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  const info = await transporter.sendMail({
    from: `${FROM_NAME} <${FROM_EMAIL}>`,
    to: Array.isArray(to) ? to.map(t => t.email).join(",") : to,
    subject,
    text,
    html,
    attachments,
  });
  return info;
}

export async function runWorkerOnce() {
  try {
    for (const r of rows) {
      const id = r.id;
      await supabaseAdmin.from("mail_queue").update({ status: "processing", updated_at: new Date().toISOString() }).eq("id", id);
    
      try {
        let sentOk = false;
        // Prefer SMTP if configured
        if (process.env.SMTP_HOST) {
          const sendResp = await sendViaSmtp({
            from: `${r.from_name || FROM_NAME} <${r.from_email || FROM_EMAIL}>`,
            to: r.recipient,
            subject: r.subject,
            html: r.html,
            text: r.text_content,
            attachments: r.attachments
          });
          if (sendResp) sentOk = true;
        }
    
        if (sentOk) {
          await supabaseAdmin.from("mail_queue").update({ status: "sent", updated_at: new Date().toISOString(), attempts: (r.attempts || 0) + 1 }).eq("id", id);
        } else {
          // no provider attempted/succeeded — leave as queued or mark failed so operators see it
          await supabaseAdmin.from("mail_queue").update({
            status: "failed",
            attempts: (r.attempts || 0) + 1,
            last_error: "No mail provider configured or delivery failed",
            updated_at: new Date().toISOString()
          }).eq("id", id);
        }
      } catch (sendErr) {
        console.error("mailWorker: send failed for row", id, sendErr);
        await supabaseAdmin.from("mail_queue").update({
          status: "failed",
          attempts: (r.attempts || 0) + 1,
          last_error: String(sendErr?.message || sendErr),
          updated_at: new Date().toISOString()
        }).eq("id", id);
      }
    }
  } catch (err) {
    console.error("mailWorker run failed:", err);
  }
}

// If run directly: poll once
if (require.main === module) {
  (async () => {
    await runWorkerOnce();
    process.exit(0);
  })();
}