// src/components/FeedbackSection.jsx
import { useEffect, useRef, useState } from "react";
import styles from "./FeedbackSection.module.css";
import { supabase } from "@/lib/supabaseClient";

export default function FeedbackSection() {
  const [text, setText] = useState("");
  const [rating, setRating] = useState(0);
  const [editing, setEditing] = useState(true);
  const [wordCount, setWordCount] = useState(0);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const textareaRef = useRef(null);
  const starsRef = useRef([]);

  // store original values to detect "no changes"
  const originalRef = useRef({ text: "", rating: 0 });

  // helper: get client JWT access token
  async function getAccessToken() {
    try {
      if (supabase?.auth?.getSession) {
        const { data } = await supabase.auth.getSession();
        return data?.session?.access_token || null;
      }
      if (typeof supabase.auth?.session === "function") {
        const s = supabase.auth.session();
        return s?.access_token || s?.accessToken || null;
      }
      return null;
    } catch (err) {
      console.warn("Failed to get access token:", err);
      return null;
    }
  }

  // fetch saved feedback from backend
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const token = await getAccessToken();
        if (!token) {
          // user not signed in, keep editing mode
          if (!cancelled) {
            setLoading(false);
            setEditing(true);
            setSaved(false);
            originalRef.current = { text: "", rating: 0 };
          }
          return;
        }
        const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
        const res = await fetch(`${API_BASE}/user/me/feedback`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
        if (!res.ok) {
          if (!cancelled) {
            setLoading(false);
            setEditing(true);
            setSaved(false);
            originalRef.current = { text: "", rating: 0 };
          }
          return;
        }
        const payload = await res.json();
        const fb = payload?.feedback || null;
        if (!cancelled) {
          if (fb) {
            const fbText = fb.feedback || "";
            const fbRating = Number(fb.rating || 0);
            setText(fbText);
            setRating(fbRating);
            // store canonical trimmed original for later comparisons
            originalRef.current = { text: (fbText || "").trim(), rating: fbRating };

            const has = (fbText || "").trim() !== "" || fbRating > 0;
            setEditing(!has);
            setSaved(has);
          } else {
            setText("");
            setRating(0);
            originalRef.current = { text: "", rating: 0 };
            setEditing(true);
            setSaved(false);
          }
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to load feedback:", err);
        if (!cancelled) {
          setLoading(false);
          setEditing(true);
          setSaved(false);
          originalRef.current = { text: "", rating: 0 };
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // word count
  useEffect(() => {
    const wc = (text || "").trim().split(/\s+/).filter(Boolean).length;
    setWordCount(wc);
  }, [text]);

  const paintStars = (value) => {
    if (!starsRef.current) return;
    starsRef.current.forEach((el) => {
      if (!el) return;
      const v = Number(el.getAttribute("data-value") || 0);
      if (v <= value) el.classList.add(styles.selected);
      else el.classList.remove(styles.selected);
    });
  };

  useEffect(() => {
    paintStars(rating);
  }, [rating]);

  const handleStarClick = (value) => {
    if (!editing) return;
    setRating(value);
  };

  const handleStarKey = (e, value) => {
    if (!editing) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setRating(value);
    }
  };

  const handleEdit = () => {
    setEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 40);
  };

  const handleCancel = async (e) => {
    e?.preventDefault?.();
    try {
      const token = await getAccessToken();
      if (!token) {
        // reset to blank
        setText("");
        setRating(0);
        setEditing(true);
        setSaved(false);
        originalRef.current = { text: "", rating: 0 };
        return;
      }
      const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
      const res = await fetch(`${API_BASE}/user/me/feedback`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (!res.ok) {
        setText("");
        setRating(0);
        setEditing(true);
        setSaved(false);
        originalRef.current = { text: "", rating: 0 };
        return;
      }
      const payload = await res.json();
      const fb = payload?.feedback || null;
      if (fb) {
        const fbText = fb.feedback || "";
        const fbRating = Number(fb.rating || 0);
        setText(fbText);
        setRating(fbRating);
        originalRef.current = { text: (fbText || "").trim(), rating: fbRating };
        const has = (fbText || "").trim() !== "" || fbRating > 0;
        setEditing(!has);
        setSaved(has);
      } else {
        setText("");
        setRating(0);
        originalRef.current = { text: "", rating: 0 };
        setEditing(true);
        setSaved(false);
      }
    } catch (err) {
      console.error("Cancel reload failed:", err);
      setText("");
      setRating(0);
      setEditing(true);
      setSaved(false);
      originalRef.current = { text: "", rating: 0 };
    }
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (submitting) return;
    const trimmed = (text || "").trim();

    // detect no-change when editing an already-saved feedback
    if (saved) {
      const origText = (originalRef.current.text || "").trim();
      const origRating = Number(originalRef.current.rating || 0);
      if (trimmed === origText && Number(rating) === origRating) {
        alert("No Changes Detected!");
        // keep focus on text area to encourage edits
        textareaRef.current?.focus();
        return;
      }
    }

    if (!trimmed) {
      alert("Feedback Text Cannot Be Empty!");
      return;
    }
    if (!rating || rating === 0) {
      alert("Please Provide A Rating!");
      return;
    }
    if (trimmed.length > 1000) {
      alert("Feedback too long (max 1000 characters)");
      return;
    }

    setSubmitting(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        alert("You are not signed in.");
        return;
      }
      const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
      const payload = { feedback: trimmed, rating: Number(rating) };

      const res = await fetch(`${API_BASE}/user/me/feedback`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const errMsg = body?.error || `Submit failed (${res.status})`;
        alert(errMsg);
        return;
      }

      const body = await res.json().catch(() => ({}));
      const fb = body?.feedback || null;
      if (fb) {
        const fbText = fb.feedback || trimmed;
        const fbRating = Number(fb.rating ?? rating);
        setText(fbText);
        setRating(fbRating);
        setSaved(true);
        setEditing(false);
        // update canonical original so future edits compare correctly
        originalRef.current = { text: (fbText || "").trim(), rating: fbRating };
      } else {
        // fallback: assume payload saved
        setSaved(true);
        setEditing(false);
        originalRef.current = { text: trimmed, rating: Number(rating) };
      }
      alert("Feedback Submitted Successfully!");
    } catch (err) {
      console.error("Failed to submit feedback:", err);
      alert("Failed to submit feedback! Please try again");
    } finally {
      setSubmitting(false);
    }
  };

  const attachStarRef = (el, idx) => {
    starsRef.current[idx] = el;
  };

  return (
    <section className={styles.feedbackSection} id="feedback-section" aria-label="Feedback">
      <h2>Feedback</h2>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          type="button"
          id="feditBtn"
          className={styles.editButton}
          aria-label="Edit Feedback"
          onClick={handleEdit}
          disabled={loading}
        >
          <i className="fas fa-pen" />
        </button>
      </div>

      {loading ? (
        <div className={styles.skeletonWrapper}>
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className={styles.skeletonRow}>
              <div className={styles.skeletonLabel}></div>
              <div className={styles.skeletonInput}></div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div
            className={`${styles.starRating} ${saved && !editing ? styles.dimmed : ""}`}
            role="radiogroup"
            aria-label="Star Rating"
          >
            {[1, 2, 3, 4, 5].map((n, i) => (
              <span
                key={n}
                className={`${styles.star} ${rating >= n ? styles.selected : ""} ${!editing ? styles.dimmed : ""}`}
                data-value={n}
                tabIndex={editing ? 0 : -1}
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
                ref={(el) => attachStarRef(el, i)}
                onClick={() => editing && handleStarClick(n)}
                onKeyDown={(e) => editing && handleStarKey(e, n)}
              >
                &#9733;
              </span>
            ))}
          </div>

          <form className={styles.feedbackForm} autoComplete="off" onSubmit={(e) => e.preventDefault()}>
            <label htmlFor="feedback">Click On The Stars To Give Ratings</label>
            <textarea
              id="feedback"
              name="feedback"
              placeholder="Start typing your feedback"
              maxLength={1500}
              value={text}
              onChange={(e) => setText(e.target.value)}
              ref={textareaRef}
              disabled={saved && !editing}
              className={saved && !editing ? styles.dimmed : ""}
            />

            {text.trim() && <p id="wordCount">Word Count: {wordCount}</p>}

            <small className={styles.editNote} style={{ display: saved ? "block" : "none" }}>
              Current feedback is submitted, click the Edit button to modify your feedback!
            </small>

            <div className={styles.feedbackFormButtons}>
              <button
                type="button"
                id="submitFeedbackBtn"
                className={styles.submitButton}
                onClick={handleSubmit}
                disabled={saved && !editing}
              >
                {submitting ? "Submitting..." : "Submit"}
              </button>

              <button
                type="button"
                id="cancelFeedbackBtn"
                className={styles.cancelButton}
                onClick={handleCancel}
                disabled={!(editing || saved)}
              >
                Cancel
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}