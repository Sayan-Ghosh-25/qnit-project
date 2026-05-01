// src/.../components/UserFeedbacks.jsx
import { useCallback, useEffect, useState } from "react";
import styles from "./UserFeedbacks.module.css";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export default function UserFeedbacks() {
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // --- Logic: Render Star Rating ---
  const renderStars = (rating) => {
    return "⭐".repeat(rating);
  };

  // --- Fetch Data Using RPC ---
  const fetchFeedbacks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase.rpc('get_user_feedbacks');
      if (error) throw error;
      setFeedbacks(data || []);
    } catch (err) {
      console.error("Error fetching feedbacks:", err);
      setError(err.message || "Failed to fetch feedbacks");
    } finally {
      setLoading(false);
    }
  }, []);

  // --- Real-time Subscription ---
  useEffect(() => {
    fetchFeedbacks();

    const feedbackSubscription = supabase
      .channel("public:feedbacks")
      .on("postgres_changes", { event: "*", schema: "public", table: "feedbacks" }, () => {
        fetchFeedbacks();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(feedbackSubscription);
    };
  }, [fetchFeedbacks]);

  // --- UI Render Helper: Feedback Card ---
  const renderFeedbackCard = (fb) => {
    return (
      <div key={fb.id} className={styles.fbUserCard}>
        <div className={styles.fbCardContent}>
          <div className={styles.fbMainInfo}>
            <div className={styles.fbUserInfo}>
              <span className={styles.fbLabel}>Username</span>
              <span className={styles.fbValue}>{fb.full_name}</span>
            </div>
            
            <div className={styles.fbReviewInfo}>
              <span className={styles.fbLabel}>Review</span>
              <span className={styles.fbValue}>{fb.feedback_text}</span>
            </div>

            <div className={styles.fbRatingInfo}>
              <span className={styles.fbLabel}>Rating</span>
              <span className={styles.fbStars}>{renderStars(fb.rating_value)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <section className={styles.feedbackSection} id="user-feedbacks">
      <div className={styles.feedbackHeader}>
        <h2>User Feedbacks</h2>
        <p className={styles.fbSubtitle}>Direct Reviews From The Students</p>
      </div>

      <div className={styles.feedbackContainer}>
        {loading && feedbacks.length === 0 ? (
          <div className={styles.syEmptyState}>
            <p>Gathering Feedbacks...</p>
          </div>
        ) : feedbacks.length === 0 ? (
          <div className={styles.syEmptyState}>
            <p>⚠️ No data available in the system right now!</p>
          </div>
        ) : (
          feedbacks.map((fb) => renderFeedbackCard(fb))
        )}
      </div>

      {error && <div className={styles.syToast}>Error: {error}</div>}
    </section>
  );
}