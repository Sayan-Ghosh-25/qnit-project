import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import styles from "./AccountDelete.module.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export default function AccountDelete({ isOpen, onClose, onAccountDelete }) {
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [verifyHint, setVerifyHint] = useState("");
  const [formError, setFormError] = useState("");
  const confirmBtnRef = useRef(null);
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  useEffect(() => {
    if (!isOpen) return;

    try {
      document.body.classList.add("modal-open");
    } catch (e) {}

    setTimeout(() => confirmBtnRef.current?.focus?.(), 30);

    function onKey(e) {
      if (e.key === "Escape") {
        if (typeof onClose === "function") onClose();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      try {
        document.body.classList.remove("modal-open");
      } catch (e) {}
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen, onClose]);

  // Safe local/session storage clearing (keeps safe keys)
  const safeClearUserData = () => {
    try {
      const keysToKeep = [];
      const dangerousKeyPattern = /(profile|feedback|auth|token|session|user|credential|login)/i;
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (keysToKeep.includes(k)) continue;
        if (dangerousKeyPattern.test(k)) toRemove.push(k);
      }
      toRemove.forEach((k) => localStorage.removeItem(k));

      try {
        sessionStorage.clear();
      } catch (e) {}
    } catch (e) {
      console.error("Error clearing storage during account delete:", e);
    }
  };

  async function getAccessToken() {
    try {
      const { data } = await supabase.auth.getSession();
      return data?.session?.access_token || null;
    } catch (e) {
      console.warn("getAccessToken failed:", e);
      return null;
    }
  }

  // Main confirm handler (otherwise best-effort local cleanup)
  const handleConfirm = async () => {
    if (loading) return;
    setFormError("");
    setVerifyHint("");

    if (!user || !user.email) {
      setFormError("Unable to identify your account");
      return;
    }

    if (!password || password.trim().length === 0) {
      setPasswordTouched(true);
      setFormError("Please enter your password to confirm deletion");
      return;
    }

    setLoading(true);
    setVerifyHint("Verifying Password...");

    try {
      // 1) Re-authenticate client-side to confirm password is correct
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });

      if (signInError) {
        setFormError("Password is incorrect! Please try again");
        setVerifyHint("");
        setLoading(false);
        return;
      }

      // 2) If backend API available, call it to securely delete auth.user and profiles row using server-side privileges
      if (API_BASE_URL) {
        const token = await getAccessToken();
        if (!token) {
          setFormError("Failed to obtain authentication token! Try signing in again");
          setVerifyHint("");
          setLoading(false);
          return;
        }

        // call DELETE endpoint (server should verify password again and perform safe deletion)
        const res = await fetch(`${API_BASE_URL.replace(/\/$/, "")}/auth/delete-account`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ password }),
        });

        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          const errMsg = j?.error || j?.message || `Server responded with ${res.status}`;
          setFormError(errMsg);
          setVerifyHint("");
          setLoading(false);
          return;
        }

        // success path
        safeClearUserData();
        try {
          // notify parent
          if (typeof onAccountDelete === "function") await onAccountDelete();
        } catch (cbErr) {
          console.warn("onAccountDelete callback failed:", cbErr);
        }

        try {
          setVerifyHint("");
          alert(j?.message || "Your Account Has Been Deleted From Our Database!");
        } catch (e) {}

        try {
          if (typeof logout === "function") await logout();
        } catch (e) {
          try { await supabase.auth.signOut(); } catch (er) {}
        }

        setLoading(false);
        setPassword("");
        if (typeof onClose === "function") onClose();
        navigate("/", { replace: true });
        return;
      }

      // 3) No backend configured: best-effort local deletion of profile row (cannot delete auth.user from client)
      try {
        const { error: delErr } = await supabase.from("profiles").delete().eq("id", user.id);
        if (delErr) {
          console.warn("Failed to delete profile row from client:", delErr);
        }
      } catch (e) {
        console.warn("profiles delete failed:", e);
      }

      safeClearUserData();

      try {
        if (typeof onAccountDelete === "function") await onAccountDelete();
      } catch (cbErr) {
        console.warn("onAccountDelete callback failed:", cbErr);
      }

      try {
        await supabase.auth.signOut();
      } catch (e) {}

      try {
        if (typeof logout === "function") await logout();
      } catch (e) {}

      alert("Account deletion requested!)");
      setLoading(false);
      setVerifyHint("");
      setPassword("");
      if (typeof onClose === "function") onClose();
      navigate("/", { replace: true });
    } catch (err) {
      console.error("Account delete failed:", err);
      setFormError(err?.message || "Account deletion failed! Try again later");
      setVerifyHint("");
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={styles.deleteModal}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
    >
      <div className={styles.deleteContent} onClick={(e) => e.stopPropagation()}>
        <h2 id="delete-modal-title">Account Deletion</h2>

        {/* Password Confirmation */}
        <div className={styles.field}>
          <label>Confirm Password To Proceed</label>
          <div className={styles.pwdWrap}>
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value.replace(/\s/g, ""));
                if (e.target.value.length > 0) setPasswordTouched(true);
              }}
              placeholder="Enter Your Password"
              aria-describedby="delete-hint"
            />
            <button
              type="button"
              className={styles.eye}
              onClick={() => setShowPassword((s) => !s)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

          <div id="delete-hint" className={styles.noteRow} style={{ marginTop: "6px" }}>
            {verifyHint ? (
              <small className={styles.hint}>{verifyHint}</small>
            ) : formError ? (
              <small className={`${styles.hint} ${styles.error}`}>{formError}</small>
            ) : ""}
          </div>
        </div>

        <div className={styles.deleteActions}>
          <button
            ref={confirmBtnRef}
            id="confirm-delete"
            className={styles.deleteBtn}
            onClick={handleConfirm}
            disabled={loading || !password.length > 0}
          >
            {loading ? "Deleting..." : "Delete"}
          </button>

          <button className={styles.cancelBtn} id="cancel-delete" onClick={() => typeof onClose === "function" && onClose()}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}