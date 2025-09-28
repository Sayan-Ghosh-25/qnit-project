// src/utils/captchaService.js
import fetch from "node-fetch";

const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY;

export const verifyCaptcha = async (token) => {
  try {
    const response = await fetch(
      `https://www.google.com/recaptcha/api/siteverify`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `secret=${RECAPTCHA_SECRET}&response=${token}`,
      }
    );

    const data = await response.json();
    return data.success === true && data.score >= 0.5;
  } catch (err) {
    console.error("Captcha verification failed:", err);
    return false;
  }
};
