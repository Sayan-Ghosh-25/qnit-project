// src/pages/Authentication/components/NewPassword.jsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import styles from "./NewPassword.module.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

/* Tick SVG for success modal */
const TICK_SVG = (
  <svg className={styles.tickSvg} viewBox="0 0 52 52" aria-hidden="true">
    <circle className={styles.tickCircle} cx="26" cy="26" r="25" fill="none" />
    <path className={styles.tickCheck} fill="none" d="M14 27 l7 7 l17 -17" />
  </svg>
);

export default function PasswordCreation() {
  const navigate = useNavigate();
  const timeoutsRef = useRef([]);

  // UI / form state
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
    noName: true,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [successModal, setSuccessModal] = useState(false);

  // session & profile
  const [loading, setLoading] = useState(true);
  const [sessionUser, setSessionUser] = useState(null);
  const [fullName, setFullName] = useState("");

  // ------------------ helpers & validation ------------------
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
    if (!sessionUser) return false;
    return true;
  }

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

  // ------------------ Process recovery link & Session ------------------
  useEffect(() => {
    let mounted = true;

    (async function processRecovery() {
      setLoading(true);
      setFormError("");

      try {
        let foundUser = null;

        // 1) Try to process a session from the URL (SDK helper)
        if (supabase?.auth?.getSessionFromUrl) {
          try {
            const { data, error } = await supabase.auth.getSessionFromUrl({
              storeSession: true,
            });
            if (!error && data?.session?.user) {
              foundUser = data.session.user;
            }
          } catch (err) {
            // ignore & continue
          }
        }

        // 2) If still not found, try reading any stored session
        if (!foundUser && supabase?.auth?.getSession) {
          try {
            const { data: sessionResponse } = await supabase.auth.getSession();
            const sessionObj = sessionResponse?.session ?? sessionResponse;
            if (sessionObj?.user) {
              foundUser = sessionObj.user;
            }
          } catch (err) {
            // ignore
          }
        }

        // 3) Fallback: if a `code` param exists (PKCE flow), attempt exchange
        if (!foundUser) {
          try {
            const url = new URL(window.location.href);
            const code = url.searchParams.get("code");
            if (code && supabase?.auth?.exchangeCodeForSession) {
              const { data: exData, error: exErr } = await supabase.auth.exchangeCodeForSession(code);
              if (!exErr && exData?.session?.user) {
                foundUser = exData.session.user;
              }
            }
          } catch (err) {
            // ignore
          }
        }

        // 4) If we have a user, set state and fetch profile full_name (if exists)
        if (foundUser) {
          if (!mounted) return;
          setSessionUser(foundUser);

          // try to fetch full_name from profiles table (recommended)
          try {
            const { data: profile, error: profileErr } = await supabase
              .from("profiles")
              .select("full_name")
              .eq("id", foundUser.id)
              .maybeSingle();

            if (!profileErr && profile?.full_name) {
              if (mounted) setFullName(profile.full_name);
            } else {
              // fallback to metadata
              const nameFromMeta =
                foundUser.user_metadata?.full_name ||
                foundUser.user_metadata?.name ||
                "";
              if (mounted) setFullName(nameFromMeta || "");
            }
          } catch (err) {
            // ignore — fullName may remain empty
          }
        } else {
          // no valid session -> show helpful message
          setFormError(
            "Invalid or expired password reset link! Please make a fresh password reset request"
          );
        }
      } catch (err) {
        console.error("Error processing recovery:", err);
        setFormError(
          "Unable to process password reset link! It may be expired or invalid"
        );
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  // ------------------ submit handler ------------------
  async function handleUpdatePassword(e) {
    e.preventDefault();
    setFormError("");

    if (!sessionUser) {
      setFormError("Session missing! Use the password reset email link to arrive here");
      return;
    }

    if (password === "") {
      setFormError("Password required");
      return;
    }

    if (!allPasswordChecksPass()) {
      setFormError("Please satisfy all password requirements");
      return;
    }

    if (password !== confirmPassword) {
      setFormError("Passwords do not match");
      return;
    }

    setIsSubmitting(true);

    try {
      // If a backend API is configured, prefer server-side password update
      if (API_BASE_URL) {
        // ensure we have a valid access token
        const token = (await getAccessToken());
        if (!token) {
          // Try to re-read session from URL again (bridging cases where SDK parsed it earlier)
          try {
            const { data } = await supabase.auth.getSessionFromUrl({ storeSession: true }).catch(() => ({}));
            const t = data?.session?.access_token || null;
            if (t) {
              // noop
            }
          } catch (e) {}
        }

        const finalToken = (await getAccessToken()) || null;
        if (!finalToken) throw new Error("Failed to obtain authentication token for password reset");

        const res = await fetch(`${API_BASE_URL.replace(/\/$/, "")}/auth/password/update`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${finalToken}`,
          },
          body: JSON.stringify({ password }),
        });

        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.ok) {
          throw new Error(j.error || j.message || "Password update failed on server");
        }

        // success
        setSuccessModal(true);
        timeoutsRef.current.push(
          setTimeout(async () => {
            try {
              await supabase.auth.signOut();
            } catch (e) {}
            setSuccessModal(false);
            navigate("/");
          }, 1400)
        );
      } else {
        // No backend: fallback to client-side update (session must be active from reset link)
        const { data, error } = await supabase.auth.updateUser({ password });
        if (error) throw error;

        setSuccessModal(true);
        timeoutsRef.current.push(
          setTimeout(async () => {
            try {
              await supabase.auth.signOut();
            } catch (e) {}
            setSuccessModal(false);
            navigate("/");
          }, 1400)
        );
      }
    } catch (err) {
      console.error("Update password failed:", err);
      setFormError(
        err?.message ?? "Unable to update password! Make sure the link is valid and try again"
      );
    } finally {
      setIsSubmitting(false);

      // clear sensitive fields
      setPassword("");
      setConfirmPassword("");
    }
  }

  // cleanup timeouts
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach((id) => clearTimeout(id));
      timeoutsRef.current = [];
    };
  }, []);

  // ------------------ UI rendering ------------------
  return (
    <div className={`${styles.uregPage} ${styles.overlayInner}`}>
      <div className={styles.uregContainer}>
        <header className={styles.uregHeader}>
          <h1 id="change-password-title">Create New Password</h1>
        </header>

        <form
          className={styles.uregForm}
          onSubmit={handleUpdatePassword}
          noValidate
          aria-live="polite"
        >
          <div className={styles.panel}>
            {/* show short loading / error if session not ready */}
            {loading && (
              <div className={styles.formNotice}>Please Wait…</div>
            )}

            {/* password */}
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
                  placeholder="Enter Your Password"
                  aria-describedby="pwdGuide"
                  disabled={loading}
                />
                <button
                  type="button"
                  className={styles.eye}
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  disabled={loading}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>

              <div id="pwdGuide" className={styles.pwdChecks}>
                <div className={`${styles.check} ${passwordChecks.length ? styles.ok : ""}`}>Minimum 12 Characters</div>
                <div className={`${styles.check} ${passwordChecks.upper ? styles.ok : ""}`}>Contains One Uppercase</div>
                <div className={`${styles.check} ${passwordChecks.lower ? styles.ok : ""}`}>Contains One Lowercase</div>
                <div className={`${styles.check} ${passwordChecks.digit ? styles.ok : ""}`}>Contains One Digit</div>
                <div className={`${styles.check} ${passwordChecks.special ? styles.ok : ""}`}>Contains One Special Character</div>
                <div className={`${styles.check} ${passwordChecks.noName ? styles.ok : ""}`}>Does Not Include Your Name</div>
              </div>
            </div>

            {/* Confirm Password */}
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
                  placeholder="Re-Enter Your Password"
                  disabled={loading}
                />
                <button
                  type="button"
                  className={styles.eye}
                  onClick={() => setShowConfirmPassword((s) => !s)}
                  aria-label={showConfirmPassword ? "Hide" : "Show"}
                  disabled={loading}
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
              <button
                type="submit"
                className={`${styles.btn} ${styles.primary}`}
                disabled={!canSubmit() || isSubmitting || loading}
              >
                {isSubmitting ? (
                  <>
                    <span className={styles.spinnerInline} aria-hidden="true">
                      <i className="fas fa-hourglass-start"></i>
                    </span>
                    Processing your request
                  </>
                ) : (
                  "Create Password"
                )}
              </button>
              <button type="button" className={`${styles.btn} ${styles.cancel}`} onClick={() => navigate("/")}>Cancel Process</button>
            </div>
          </div>
        </form>
      </div>

      {/* Success Popup */}
      {successModal && (
        <div className={styles.successPop}>
          {TICK_SVG}
          <p>
            Password Created
            <br />
            Successfully
          </p>
        </div>
      )}
    </div>
  );
}