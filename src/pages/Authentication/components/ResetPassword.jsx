// src/pages/Authentication/components/ResetPassword.jsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import styles from "./ResetPassword.module.css";

/* Tick SVG for success modal */
const TICK_SVG = (
  <svg className={styles.tickSvg} viewBox="0 0 52 52" aria-hidden="true">
    <circle className={styles.tickCircle} cx="26" cy="26" r="25" fill="none" />
    <path className={styles.tickCheck} fill="none" d="M14 27 l7 7 l17 -17" />
  </svg>
);

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// Helper: parse an access token or token from URL fragment or query
// Supports: #access_token=... or ?access_token=... or ?token=...
function parseAccessTokenFromUrl() {
  try {
    // 1) Check hash fragment first (common for Supabase links)
    if (window.location.hash) {
      const hash = window.location.hash.replace(/^#/, "");
      const params = new URLSearchParams(hash);
      const access_token = params.get("access_token") || params.get("token");
      if (access_token) return access_token;
    }

    // 2) Check query params
    const url = new URL(window.location.href);
    const access_token = url.searchParams.get("access_token") || url.searchParams.get("token");
    if (access_token) return access_token;
  } catch (e) {
    // ignore parsing errors
  }
  return null;
}

// Clear token params from URL (to avoid leaking sensitive token)
function clearTokenFromUrl() {
  try {
    const u = new URL(window.location.href);
    // remove known params from query
    u.searchParams.delete("access_token");
    u.searchParams.delete("token");
    // clear hash entirely (it may contain session tokens)
    window.history.replaceState({}, document.title, u.pathname + u.search);
  } catch (e) {
    // best-effort: replaceState fallback
    try {
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch {}
  }
}

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

  // If the SDK didn't produce a session, we may have an access token in URL
  const [accessTokenFromUrl, setAccessTokenFromUrl] = useState(null);

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
    // Accept if we have a sessionUser OR an accessTokenFromUrl fallback
    if (!allPasswordChecksPass()) return false;
    if (password !== confirmPassword) return false;
    if (!sessionUser && !accessTokenFromUrl) return false;
    return true;
  }

  // Helper: get current access token from supabase session
  async function getAccessToken() {
    try {
      const sessionResp = await supabase.auth.getSession();
      // supabase v2 returns { data: { session } }
      const token = sessionResp?.data?.session?.access_token || sessionResp?.session?.access_token || null;
      return token;
    } catch (e) {
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
        // 1) Try SDK helper that parses session from the URL and stores it
        if (supabase?.auth?.getSessionFromUrl) {
          try {
            const { data, error } = await supabase.auth.getSessionFromUrl({ storeSession: true }).catch(() => ({}));
            if (!error && (data?.session?.user || data?.user)) {
              foundUser = data.session?.user || data.user;
            }
          } catch (err) {
            // ignore: proceed to other strategies
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

        // 3) Fallback: exchange code (PKCE) if present and SDK has exchangeCodeForSession
        if (!foundUser) {
          try {
            const url = new URL(window.location.href);
            const code = url.searchParams.get("code");
            if (code && supabase?.auth?.exchangeCodeForSession) {
              const { data: exData, error: exErr } = await supabase.auth.exchangeCodeForSession(code).catch(() => ({}));
              if (!exErr && exData?.session?.user) {
                foundUser = exData.session.user;
              }
            }
          } catch (err) {
            // ignore
          }
        }

        // 4) If not found, look for access_token/token in URL (hash or query)
        if (!foundUser) {
          const tok = parseAccessTokenFromUrl();
          if (tok) {
            // We have a recovery token; keep it and let submit handler use it
            setAccessTokenFromUrl(tok);
            // Clear the token from URL right away to avoid leaking it
            clearTokenFromUrl();
          }
        } else {
          // we have an authenticated user via SDK -> fetch profile's full_name if present
          if (!mounted) return;
          setSessionUser(foundUser);

          try {
            const { data: profile, error: profileErr } = await supabase
              .from("profiles")
              .select("full_name")
              .eq("id", foundUser.id)
              .maybeSingle();

            if (!profileErr && profile?.full_name) {
              if (mounted) setFullName(profile.full_name);
            } else {
              const nameFromMeta = foundUser.user_metadata?.full_name || foundUser.user_metadata?.name || "";
              if (mounted) setFullName(nameFromMeta || "");
            }
          } catch (err) {
            // ignore — optional
          }
        }

        // If neither session nor token exists, show helpful message (but still allow user to request a fresh reset)
        if (!foundUser && !parseAccessTokenFromUrl() && !accessTokenFromUrl) {
          // Do not treat this strictly as failure — many flows redirect without attaching tokens
          // Show a friendly message instead.
          setFormError("No active session found on this page! If you just clicked a recovery email, wait a moment or request a fresh reset");
        }
      } catch (err) {
        console.error("Error processing recovery:", err);
        setFormError("Unable to process password reset link! It may be expired or invalid");
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

    if (!sessionUser && !accessTokenFromUrl) {
      setFormError("Session missing or invalid! Request a fresh password reset email");
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
      // 1) If we have an SDK-managed session, use supabase.auth.updateUser
      if (sessionUser) {
        const { data, error } = await supabase.auth.updateUser({ password });
        if (error) throw error;

        // success
        setSuccessModal(true);
        timeoutsRef.current.push(
          setTimeout(async () => {
            // sign out and navigate
            try {
              await supabase.auth.signOut();
            } catch (e) {}
            setSuccessModal(false);
            navigate("/");
          }, 1400)
        );
        return;
      }

      // 2) Fallback: we have an access token captured from the URL -> call /auth/v1/user
      if (accessTokenFromUrl) {
        if (!SUPABASE_URL) throw new Error("SUPABASE_URL not configured");

        const url = `${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`;
        const resp = await fetch(url, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessTokenFromUrl}`,
          },
          body: JSON.stringify({ password }),
        });

        const j = await resp.json().catch(() => null);
        if (!resp.ok) {
          const errMsg = (j && (j.message || j.error_description || j.error)) || `Password update failed (${resp.status})`;
          throw new Error(errMsg);
        }

        // success
        setSuccessModal(true);
        // clear the token variable so we don't reuse it
        setAccessTokenFromUrl(null);
        clearTokenFromUrl();

        timeoutsRef.current.push(
          setTimeout(async () => {
            // best-effort: signOut the client-side SDK (there's no session yet)
            try {
              await supabase.auth.signOut();
            } catch (e) {}
            setSuccessModal(false);
            navigate("/");
          }, 1400)
        );
        return;
      }

      throw new Error("No session or token available to update password");
    } catch (err) {
      console.error("Update password failed:", err);
      setFormError(err?.message ?? "Unable to update password! Make sure the link is valid and try again");
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
          <h1 id="change-password-title">Reset Password</h1>
        </header>

        <form className={styles.uregForm} onSubmit={handleUpdatePassword} noValidate aria-live="polite">
          <div className={styles.panel}>
            {loading && <div className={styles.formNotice}>Please wait…</div>}

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

              <div id="pwdGuide" className={styles.pwdChecks} style={{ display: password.length > 0 ? "grid" : "none" }}>
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

            {/* Helpful message when there's no session/token */}
            {(!sessionUser && !accessTokenFromUrl) && (
              <div className={styles.formNotice} role="status" aria-live="polite">
                If you've just clicked a recovery email and this page shows no active session, try requesting a fresh password reset or open the reset email link again in the same browser.
              </div>
            )}

            {/* Error Message */}
            {formError && <div className={styles.formError}>{formError}</div>}

            {/* Actions */}
            <div className={styles.actions}>
              <button type="submit" className={`${styles.btn} ${styles.primary}`} disabled={!canSubmit() || isSubmitting || loading}>
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
              <button type="button" className={`${styles.btn} ${styles.cancel}`} onClick={() => navigate("/")}>
                Cancel Process
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Success Popup */}
      {successModal && (
        <div className={styles.successPop}>
          {TICK_SVG}
          <p>Password Created<br />Successfully</p>
        </div>
      )}
    </div>
  );
}