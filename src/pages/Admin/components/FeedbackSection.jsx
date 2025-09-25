import { useEffect, useRef, useState } from "react";
import "./FeedbackSection.css";

function safeParseJSON(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch (e) {
    return fallback;
  }
}

const STORAGE_KEY = "feedbackData";
const DEFAULT_DATA = { feedback: "", rating: 0 };

export default function FeedbackSection() {
  const [text, setText] = useState("");
  const [rating, setRating] = useState(0);
  const [editing, setEditing] = useState(true);
  const [wordCount, setWordCount] = useState(0);
  const [saved, setSaved] = useState(false); // ✅ NEW state to track save

  const textareaRef = useRef(null);
  const starsRef = useRef([]);

  // Load from localStorage once
  useEffect(() => {
    const saved = safeParseJSON(localStorage.getItem(STORAGE_KEY), DEFAULT_DATA);
    setText(saved.feedback || "");
    setRating(Number(saved.rating || 0));
    const has = (saved.feedback || "").trim() !== "" || Number(saved.rating || 0) > 0;
    setEditing(!has);
    setSaved(has); // ✅ update saved state
  }, []);

  // Word count
  useEffect(() => {
    const wc = (text || "").trim().split(/\s+/).filter(Boolean).length;
    setWordCount(wc);
  }, [text]);

  const paintStars = (value) => {
    if (!starsRef.current) return;
    starsRef.current.forEach((el) => {
      if (!el) return;
      const v = Number(el.getAttribute("data-value") || 0);
      if (v <= value) el.classList.add("selected");
      else el.classList.remove("selected");
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

  const handleCancel = (e) => {
    e?.preventDefault?.();
    const saved = safeParseJSON(localStorage.getItem(STORAGE_KEY), DEFAULT_DATA);
    setText(saved.feedback || "");
    setRating(Number(saved.rating || 0));
    const has = (saved.feedback || "").trim() !== "" || Number(saved.rating || 0) > 0;
    setEditing(!has);
    setSaved(has);
  };

  const handleSubmit = (e) => {
    e?.preventDefault?.();
    const trimmed = (text || "").trim();
    if (!trimmed) {
      alert("Feedback Text Cannot Be Empty!");
      return;
    }
    if (!rating || rating === 0) {
      alert("Please Provide A Rating!");
      return;
    }

    const old = safeParseJSON(localStorage.getItem(STORAGE_KEY), DEFAULT_DATA);
    const oldFeedback = (old.feedback || "").trim();
    const oldRating = Number(old.rating || 0);

    const feedbackEqual =
      oldFeedback.localeCompare(trimmed, undefined, { sensitivity: "accent" }) === 0;

    if (feedbackEqual && oldRating === rating) {
      alert("No Changes Detected!");
      return;
    }

    const toSave = { feedback: trimmed, rating };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    alert("Feedback Submitted Successfully!");

    // ✅ Update states immediately
    setEditing(false);
    setSaved(true);
  };

  const attachStarRef = (el, idx) => {
    starsRef.current[idx] = el;
  };

  return (
    <section className="feedback-section" id="feedback-section" aria-label="Feedback">
      <h2>Feedback</h2>
      <button
        type="button"
        id="feditBtn"
        className="edit-button"
        aria-label="Edit Feedback"
        onClick={handleEdit}
      >
        <i className="fas fa-pen" />
      </button>

      {/* Star Ratings */}
      <div
        className={`star-rating ${saved && !editing ? "dimmed" : ""}`}
        role="radiogroup"
        aria-label="Star Rating"
      >
        {[1, 2, 3, 4, 5].map((n, i) => (
          <span
          key={n}
          className={`star ${rating >= n ? "selected" : ""} ${!editing ? "dimmed" : ""}`}
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

      <form className="feedback-form" autoComplete="off" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="feedback">Click on the stars to give ratings</label>
        <textarea
          id="feedback"
          name="feedback"
          placeholder="Type your feedback here..."
          maxLength={1000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          ref={textareaRef}
          disabled={saved && !editing}
          className={saved && !editing ? "dimmed" : ""}
        />

        <p id="wordCount">{wordCount} / 200 words</p>

        {/* ✅ Small note shows immediately after submit */}
        <small className="edit-note" style={{ display: saved ? "block" : "none" }}>
          Current feedback is submitted, click the Edit button to modify your feedback!
        </small>

        <div className="feedback-form-buttons">
          <button
            type="button"
            id="submitFeedbackBtn"
            className="submit-button"
            onClick={handleSubmit}
            disabled={saved && !editing}
          >
            Submit
          </button>

          <button
            type="button"
            id="cancelFeedbackBtn"
            className="cancel-button"
            onClick={handleCancel}
            disabled={!(editing || saved)}
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}
