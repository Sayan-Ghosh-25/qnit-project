// src/utils/emailService.js
import { supabaseAdmin } from "../config/supabaseClient.js";

const DEFAULT_FROM_EMAIL = process.env.FROM_EMAIL;
const DEFAULT_FROM_NAME = process.env.FROM_NAME;

export async function sendEmail(to, subject, html = null, opts = {}) {
  if (!to) throw new Error("`to` required");
  if (!subject) throw new Error("`subject` required");

  const recipients = Array.isArray(to) ? to.map(t => (typeof t === "string" ? { email: t } : t)) : [{ email: to }];

  const payload = {
    from: { email: opts.fromEmail || DEFAULT_FROM_EMAIL, name: opts.fromName || DEFAULT_FROM_NAME },
    to: recipients,
    subject,
    html: html || null,
    text: opts.text || null,
    templateId: opts.templateId ? Number(opts.templateId) : null,
    params: opts.params || null,
    cc: opts.cc || null,
    bcc: opts.bcc || null,
    attachments: Array.isArray(opts.attachments) ? opts.attachments : null,
  };

  // Push to mail_queue
  const insertRow = {
    recipient: recipients,
    subject,
    html: html || null,
    text_content: opts.text || null,
    from_email: payload.from.email || null,
    from_name: payload.from.name || null,
    template_id: payload.templateId || null,
    params: payload.params || null,
    cc: payload.cc || null,
    bcc: payload.bcc || null,
    attachments: payload.attachments || null,
    status: "queued",
  };

  const tryTables = ["mail_queue", "outbound_emails", "email_queue"];
  for (const tbl of tryTables) {
    try {
      const { data, error } = await supabaseAdmin.from("mail_queue").insert([insertRow]).select().maybeSingle();
      if (error) throw error;
        return { provider: "db-queue", table: "mail_queue", row: data };
    } catch (e) {
      // try next
    }
  }

  throw new Error("No mail delivery mechanism available");
}