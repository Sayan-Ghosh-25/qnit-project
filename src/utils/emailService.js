// utils/emailService.js
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

const DEFAULT_TIMEOUT_MS = Number(process.env.EMAIL_REQUEST_TIMEOUT_MS || 15000);
const MAX_RETRIES = Number(process.env.EMAIL_REQUEST_RETRIES || 1);
const DEFAULT_FROM_EMAIL = null;
const DEFAULT_FROM_NAME = null;

// NOTE: do not throw at import. Throw inside sendEmail if missing at runtime.
if (!process.env.EMAIL_API_KEY) {
  console.warn("Warning: EMAIL_API_KEY not set. sendEmail will fail until configured.");
}
if (!DEFAULT_FROM_EMAIL) {
  console.warn("Warning: FROM_EMAIL not set. sendEmail will fail until configured.");
}

export async function sendEmail(to, subject, html = null, opts = {}) {
  const EMAIL_API_KEY = process.env.EMAIL_API_KEY;
  if (!EMAIL_API_KEY) throw new Error("Email API key not configured (EMAIL_API_KEY)");

  const fromEmail = opts.fromEmail || DEFAULT_FROM_EMAIL;
  const fromName = opts.fromName || DEFAULT_FROM_NAME;

  if (!fromEmail) throw new Error("FROM_EMAIL not configured");
  if (!to) throw new Error("`to` is required");

  const toArr = Array.isArray(to)
    ? to.map(t => (typeof t === "string" ? { email: t } : t))
    : [{ email: to }];

  const buildRecipientArray = (field) => {
    if (!field) return undefined;
    return Array.isArray(field) ? field.map(f => (typeof f === "string" ? { email: f } : f)) : [{ email: field }];
  };

  const payload = {
    sender: { name: fromName, email: fromEmail },
    to: toArr,
    subject: subject || "",
    ...(opts.templateId
      ? { templateId: Number(opts.templateId), params: opts.params || {} }
      : {
          ...(html ? { htmlContent: html } : {}),
          ...(opts.text ? { textContent: opts.text } : {}),
        }),
    ...(opts.cc ? { cc: buildRecipientArray(opts.cc) } : {}),
    ...(opts.bcc ? { bcc: buildRecipientArray(opts.bcc) } : {}),
    ...(opts.replyTo ? { replyTo: { email: opts.replyTo.email, name: opts.replyTo.name } } : {}),
  };

  if (opts.attachments && Array.isArray(opts.attachments) && opts.attachments.length) {
    payload.attachment = opts.attachments.map(att => ({
      name: att.name,
      content: att.content,
      ...(att.contentType ? { contentType: att.contentType } : {}),
    }));
  }

  const headers = {
    "Content-Type": "application/json",
    "api-key": EMAIL_API_KEY,
  };

  const doFetch = async (signal) =>
    fetch(BREVO_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal,
    });

  let lastError = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const res = await doFetch(controller.signal);
      clearTimeout(timeout);

      const raw = await res.text();
      let body;
      try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }

      console.log("sendEmail: Brevo response status:", res.status, "body:", body);

      if (!res.ok) {
        const err = new Error(`Brevo send error ${res.status}: ${typeof body === "object" ? JSON.stringify(body) : body}`);
        err.status = res.status;
        err.response = body;
        throw err;
      }

      // Normalize return object to include messageId when present
      const out = (body && typeof body === "object") ? body : { raw: body };
      return out;
    } catch (err) {
      clearTimeout(timeout);
      lastError = err;

      const code = err.code || (err.name === "AbortError" ? "ETIMEDOUT" : undefined);
      const transientCodes = ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ECONNREFUSED", "ENOTFOUND"];
      const isTransient = code && transientCodes.includes(code);

      if (attempt === MAX_RETRIES || !isTransient) {
        const out = new Error(err.message || "Email send failed");
        out.code = code;
        out.response = err.response || null;
        throw out;
      }

      const backoffMs = 500 * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, backoffMs));
    }
  }

  throw lastError || new Error("Unknown error sending email");
}