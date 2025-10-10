// src/common/ChangePassword.jsx
import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import styles from "./ChangePassword.module.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

/* Tick SVG for success modal */
const TICK_SVG = (
  <svg className={styles.tickSvg} viewBox="0 0 52 52" aria-hidden="true">
    <circle className={styles.tickCircle} cx="26" cy="26" r="25" fill="none" />
    <path className={styles.tickCheck} fill="none" d="M14 27 l7 7 l17 -17" />
  </svg>
);

export default function PasswordUpdate({ onCancel, onSuccess }) {
  const navigate = useNavigate();
  const timeoutRef = useRef(null);
  const { user, logout } = useAuth();

  // states
  const [oldPassword, setOldPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmPasswordTouched, setConfirmPasswordTouched] = useState(false);

  const [passwordChecks, setPasswordChecks] = useState({
    length: false,
    upper: false,
    lower: false,
    digit: false,
    special: false,
    noName: false,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [successModal, setSuccessModal] = useState(false);

  // profile data from DB
  const [fullName, setFullName] = useState("");
  const [lastPasswordChange, setLastPasswordChange] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  // fetch profile (full_name & last_password_change) if user exists
  useEffect(() => {
    let mounted = true;

    async function fetchProfile() {
      if (!user?.id) {
        setLoadingProfile(false);
        return;
      }

      try {
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("full_name, last_password_change")
          .eq("id", user.id)
          .maybeSingle();

        if (!error && profile) {
          if (mounted) {
            setFullName(profile.full_name || "");
            setLastPasswordChange(profile.last_password_change ? new Date(profile.last_password_change) : null);
          }
        } else {
          // No profile found - fallback to user metadata
          if (mounted) {
            const metaName = user.user_metadata?.full_name || user.user_metadata?.name || "";
            setFullName(metaName);
            setLastPasswordChange(null);
          }
        }
      } catch (err) {
        console.error("Failed to fetch profile:", err);
      } finally {
        if (mounted) setLoadingProfile(false);
      }
    }

    fetchProfile();
    return () => {
      mounted = false;
    };
  }, [user]);

  // update validations
  useEffect(() => {
    const checks = {
      length: password.length >= 12,
      upper: /[A-Z]/.test(password),
      lower: /[a-z]/.test(password),
      digit: /[0-9]/.test(password),
      special: /[^A-Za-z0-9]/.test(password),
      noName: false,
    };

    if (password.length > 0) {
      const tokens = fullName
        .split(/\s+/)
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length >= 2);
      let ok = true;
      for (const tk of tokens) {
        if (tk && password.toLowerCase().includes(tk)) {
          ok = false;
          break;
        }
      }
      checks.noName = ok;
    }

    setPasswordChecks(checks);
  }, [password, fullName]);

  function allPasswordChecksPass() {
    return Object.values(passwordChecks).every(Boolean);
  }

  function canSubmit() {
    if (!allPasswordChecksPass()) return false;
    if (password !== confirmPassword) return false;
    if (password === oldPassword) return false;
    if (!user) return false;
    return true;
  }

  // compute if user can change password now
  function isWithinThirtyDays() {
    if (!lastPasswordChange) return false;
    const diff = Date.now() - new Date(lastPasswordChange).getTime();
    return diff < THIRTY_DAYS_MS;
  }

  function nextAllowedDateString() {
    if (!lastPasswordChange) return null;
    const next = new Date(new Date(lastPasswordChange).getTime() + THIRTY_DAYS_MS);
    return next.toLocaleString();
  }

  // cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  // Helper: get current access token from supabase session
  async function getAccessToken() {
    try {
      const sessionResp = await supabase.auth.getSession();
      const token = sessionResp?.data?.session?.access_token || null;
      return token;
    } catch (e) {
      console.warn("getAccessToken failed:", e);
      return null;
    }
  }

  // main handler
  async function handleUpdatePassword(e) {
    e.preventDefault();
    setFormError("");

    if (!user) {
      setFormError("Unable to identify your account. Please sign in and try again.");
      return;
    }

    // enforce 30-day rule
    if (isWithinThirtyDays()) {
      setFormError(`Password was changed recently! Next change allowed on ${nextAllowedDateString()}`);
      return;
    }

    if (!canSubmit()) {
      setFormError("Please satisfy all validations before updating your password");
      return;
    }

    setIsSubmitting(true);

    try {
      const email = user.email;
      if (!email) throw new Error("User email not available for re-authentication");

      // 1) Re-authenticate client-side to ensure old password is correct
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: oldPassword,
      });

      if (signInError) {
        throw new Error("Old password is incorrect!");
      }

      // If a backend API is configured, prefer server-side password update
      if (API_BASE_URL) {
        // ensure we have a valid access token (from the session we just obtained)
        const token = (signInData?.session?.access_token) || (await getAccessToken());
        if (!token) throw new Error("Failed to obtain authentication token.");

        // call backend to perform password update using service-role on server
        const res = await fetch(`${API_BASE_URL.replace(/\/$/, "")}/auth/password/update`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ password }),
        });

        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.ok) {
          throw new Error(j.error || j.message || "Password update failed on server");
        }

        // success — sign the user out so they must re-login with new password
        setSuccessModal(true);

        timeoutRef.current = setTimeout(async () => {
          setSuccessModal(false);
          try {
            // attempt to use app logout flow
            if (typeof logout === "function") await logout();
            // ensure session cleared client-side
            try { await supabase.auth.signOut(); } catch (e) {}
          } catch (e) {
            try { await supabase.auth.signOut(); } catch (e) {}
          }

          if (typeof onSuccess === "function") {
            try { onSuccess(); } catch (e) {}
          } else {
            navigate("/");
          }
        }, 1400);
      } else {
        // No backend: fallback to client-side update (will update auth via supabase client)
        const { data: updateData, error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;

        // persist last_password_change to profiles table (best-effort)
        try {
          const nowIso = new Date().toISOString();
          const { error: updErr } = await supabase
            .from("profiles")
            .update({ last_password_change: nowIso })
            .eq("id", user.id);
          if (updErr) {
            // upsert fallback
            await supabase.from("profiles").upsert({ id: user.id, last_password_change: nowIso }, { onConflict: "id" });
          }
        } catch (e) {
          console.warn("Failed to persist last_password_change locally:", e);
        }

        setSuccessModal(true);
        timeoutRef.current = setTimeout(async () => {
          setSuccessModal(false);
          try {
            if (typeof logout === "function") await logout();
            try { await supabase.auth.signOut(); } catch (e) {}
          } catch (e) {
            try { await supabase.auth.signOut(); } catch (e) {}
          }
          if (typeof onSuccess === "function") {
            try { onSuccess(); } catch (e) {}
          } else {
            navigate("/");
          }
        }, 1400);
      }
    } catch (err) {
      console.error("Password update failed:", err);
      setFormError(err?.message || "Unable to update password! Try again later");
    } finally {
      setIsSubmitting(false);

      // clear sensitive fields
      setOldPassword("");
      setConfirmPassword("");
      setPassword("");
    }
  }

  return (
    <div className={`${styles.uregPage} ${styles.overlayInner}`}>
      <div className={styles.uregContainer}>
        <header className={styles.uregHeader}>
          <h1 id="change-password-title">Create New Password</h1>
        </header>

        <form className={styles.uregForm} onSubmit={handleUpdatePassword} noValidate>
          <div className={styles.panel}>
            {/* Show helpful notice about 30-day rule */}
            {lastPasswordChange && (
              <div className={styles.formNotice}>
                Last password change: {new Date(lastPasswordChange).toLocaleString()}. {" "}
                {isWithinThirtyDays() ? (
                  <strong>Next change allowed: {nextAllowedDateString()}</strong>
                ) : (
                  <strong>You may update your password now.</strong>
                )}
              </div>
            )}

            {/* Old Password */}
            <div className={styles.field}>
              <label>Old Password</label>
              <div className={styles.pwdWrap}>
                <input
                  type={showOldPassword ? "text" : "password"}
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value.replace(/\s/g, ""))}
                  placeholder="Enter Old Password"
                  required
                />
                <button
                  type="button"
                  className={styles.eye}
                  onClick={() => setShowOldPassword((s) => !s)}
                >
                  {showOldPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div className={styles.field}>
              <label>Create Password</label>
              <div className={styles.pwdWrap}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/\s/g, "");
                    setPassword(cleaned);
                    if (cleaned.length > 0) setPasswordTouched(true);
                  }}
                  placeholder="Enter New Password"
                  aria-describedby="pwdGuide"
                />
                <button
                  type="button"
                  className={styles.eye}
                  onClick={() => setShowPassword((s) => !s)}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>

              {passwordTouched && password && password === oldPassword && (
                <small className={`${styles.hint} ${styles.error}`} style={{ marginTop: "0.4rem" }}>
                  New password cannot be the same as old password
                </small>
              )}

              <div id="pwdGuide" className={styles.pwdChecks}>
                <div className={`${styles.check} ${passwordChecks.length ? styles.ok : ""}`}>Minimum 12 Characters</div>
                <div className={`${styles.check} ${passwordChecks.upper ? styles.ok : ""}`}>Contains One Uppercase</div>
                <div className={`${styles.check} ${passwordChecks.lower ? styles.ok : ""}`}>Contains One Lowercase</div>
                <div className={`${styles.check} ${passwordChecks.digit ? styles.ok : ""}`}>Contains One Digit</div>
                <div className={`${styles.check} ${passwordChecks.special ? styles.ok : ""}`}>Contains One Special Character</div>
                <div className={`${styles.check} ${passwordChecks.noName ? styles.ok : ""}`}>Does Not Include Your Name</div>
              </div>
            </div>

            {/* Confirm password */}
            <div className={styles.field}>
              <label>Confirm Password</label>
              <div className={styles.pwdWrap}>
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value.replace(/\s/g, ""));
                    if (e.target.value.length > 0) setConfirmPasswordTouched(true);
                  }}
                  placeholder="Re-Enter New Password"
                />
                <button
                  type="button"
                  className={styles.eye}
                  onClick={() => setShowConfirmPassword((s) => !s)}
                >
                  {showConfirmPassword ? "Hide" : "Show"}
                </button>
              </div>
              {confirmPasswordTouched && confirmPassword && confirmPassword !== password && (
                <small className={`${styles.hint} ${styles.error}`} style={{ marginTop: "0.4rem" }}>
                  Passwords do not match
                </small>
              )}
              {confirmPasswordTouched && confirmPassword && confirmPassword === password && (
                <small className={`${styles.hint} ${styles.success}`} style={{ marginTop: "0.4rem" }}>
                  Passwords matched
                </small>
              )}
            </div>

            {/* Error Message */}
            {formError && <div className={styles.formError}>{formError}</div>}

            {/* Actions */}
            <div className={styles.actions}>
              <button type="submit" className={`${styles.btn} ${styles.primary}`} disabled={!canSubmit() || isSubmitting}>
                {isSubmitting ? (
                  <>
                    <span className={styles.spinnerInline} aria-hidden="true"><i className="fas fa-hourglass-start"></i></span>
                    Processing your request
                  </>
                ) : "Update"}
              </button>

              <button
                type="button"
                className={`${styles.btn} ${styles.cancel}`}
                onClick={() => {
                  if (typeof onCancel === "function") onCancel();
                }}>
                Cancel
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Success Popup */}
      {successModal && (
        <div className={styles.successPop}>
          {TICK_SVG}
          <p>
            Password Updated
            <br />
            Successfully
          </p>
        </div>
      )}
    </div>
  );
}