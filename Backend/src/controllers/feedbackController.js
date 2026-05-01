// src/controllers/feedbackController.js
import { supabaseAdmin } from "../config/supabaseClient.js";

/* GET /user/me/feedback
 * Returns { feedback: { feedback, rating, created_at, updated_at } } or { feedback: null }
 */
export async function getMyFeedback(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const { data, error } = await supabaseAdmin
      .from("feedbacks")
      .select("feedback, rating, created_at, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("getMyFeedback error:", error);
      return res.status(500).json({ error: error.message || "DB error" });
    }

    return res.json({ feedback: data || null });
  } catch (err) {
    console.error("getMyFeedback:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/* PUT /user/me/feedback */
export async function upsertMyFeedback(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const body = req.body || {};
    const rawFeedback = (body.feedback || "").toString().trim();
    const rating = Number(body.rating || 0);

    if (!rawFeedback) return res.status(400).json({ error: "Feedback Text Cannot Be Empty" });
    if (rawFeedback.length > 1500) return res.status(400).json({ error: "Feedback too long (max 1500 characters)" });
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: "Rating must be an integer between 1 and 5" });

    // Check if a feedback row already exists
    const { data: existing, error: selErr } = await supabaseAdmin
      .from("feedbacks")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (selErr) {
      console.error("upsertMyFeedback select error:", selErr);
      return res.status(500).json({ error: selErr.message || "DB error" });
    }

    if (existing && existing.id) {
      // update
      const { data: updated, error: updErr } = await supabaseAdmin
        .from("feedbacks")
        .update({ feedback: rawFeedback, rating }, { returning: "representation" })
        .eq("user_id", userId)
        .maybeSingle();

      if (updErr) {
        console.error("upsertMyFeedback update error:", updErr);
        return res.status(500).json({ error: updErr.message || "DB update error" });
      }

      return res.json({ ok: true, feedback: updated });
    } else {
      // insert
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("feedbacks")
        .insert([{ user_id: userId, feedback: rawFeedback, rating }], { returning: "representation" })
        .maybeSingle();

      if (insErr) {
        console.error("upsertMyFeedback insert error:", insErr);
        return res.status(500).json({ error: insErr.message || "DB insert error" });
      }

      return res.json({ ok: true, feedback: inserted });
    }
  } catch (err) {
    console.error("upsertMyFeedback:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}