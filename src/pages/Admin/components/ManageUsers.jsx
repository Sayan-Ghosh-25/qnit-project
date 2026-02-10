// src/.../components/ManageUsers.jsx
import { useCallback, useEffect, useState } from "react";
import styles from "./ManageUsers.module.css";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export default function ManageUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // --- Logic: Calculate Active Status (within 30 days) ---
  const getStatus = useCallback((lastSignIn) => {
    if (!lastSignIn) return { label: "Inactive", isActive: false };
    
    const lastDate = new Date(lastSignIn);
    const now = new Date();
    const diffInDays = (now - lastDate) / (1000 * 60 * 60 * 24);
    
    return diffInDays <= 30 
      ? { label: "Active", isActive: true } 
      : { label: "Inactive", isActive: false };
  }, []);

  // --- Logic: Format Date ---
  const formatDate = (dateString) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  // --- Fetch Data Using RPC ---
  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Use rpc() to call the database function
      const { data, error } = await supabase.rpc('get_user_tracker');

      // If the user isn't an admin, the function throws the 'Access Denied' error
      if (error) { throw error; }
      
      setUsers(data || []);
    } catch (err) {
      console.error("Error fetching tracker data:", err);
      // err.message will show 'Access Denied' if the security check fails
      setError(err.message || "Failed to fetch user data");
    } finally {
      setLoading(false);
    }
  }, []);

  // --- Real-time Subscription ---
  useEffect(() => {
    fetchUsers();

    // Subscribe to changes in profiles to trigger a refresh
    const profileSubscription = supabase
      .channel("public:profiles")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        fetchUsers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(profileSubscription);
    };
  }, [fetchUsers]);

  // --- UI Render Helper: User Card ---
  const renderUserCard = (user) => {
    const statusInfo = getStatus(user.last_sign_in_at);
    
    return (
      <div key={user.id} className={styles.utUserCard}>
        <div className={styles.utCardContent}>
          <div className={styles.utMainInfo}>
            <div className={styles.utUserInfo}>
              <span className={styles.utLabel}>Username</span>
              <span className={styles.utValue}>{user.full_name}</span>
            </div>
            
            <div className={styles.utSignInInfo}>
              <span className={styles.utLabel}>Last Sign In</span>
              <span className={styles.utValue}>{formatDate(user.last_sign_in_at)}</span>
            </div>
          </div>

          <div className={styles.utStatusWrapper}>
            <span className={`${styles.utStatusTag} ${statusInfo.isActive ? styles.active : styles.inactive}`}>
              {statusInfo.label}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <section className={styles.trackerSection} id="user-tracker">
      <div className={styles.trackerHeader}>
        <h2>User Tracker</h2>
        <p className={styles.utSubtitle}>Monitor Real-Time Student Engagement</p>
      </div>

      <div className={styles.trackerContainer}>
        {loading && users.length === 0 ? (
          <div className={styles.syEmptyState}>
            <p>Syncing Database...</p>
          </div>
        ) : users.length === 0 ? (
          <div className={styles.syEmptyState}>
            <p>⚠️ No data available in the system right now!</p>
          </div>
        ) : (
          users.map((user) => renderUserCard(user))
        )}
      </div>

      {error && <div className={styles.syToast}>Error: {error}</div>}
    </section>
  );
}