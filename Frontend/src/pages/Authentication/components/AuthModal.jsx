// src/pages/Authentication/components/AuthModal.jsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import styles from "./AuthModal.module.css";
import ReCAPTCHA from "react-google-recaptcha";

/* Tick & Cross SVG used for success & failure mini-modal */
const TICK_SVG = (
  <svg className={styles.tickSvg} viewBox="0 0 52 52" aria-hidden="true">
    <circle className={styles.tickCircle} cx="26" cy="26" r="25" fill="none" />
    <path className={styles.tickCheck} fill="none" d="M14 27 l7 7 l17 -17" />
  </svg>
);

const CROSS_SVG = (
  <svg className={styles.crossSvg} viewBox="0 0 52 52" aria-hidden="true">
    <circle className={styles.crossCircle} cx="26" cy="26" r="25" fill="none" />
    <path className={styles.crossLine} fill="none" d="M16 16 L36 36" />
    <path className={styles.crossLine} fill="none" d="M36 16 L16 36" />
  </svg>
);

/* Small Eye Icon components */
function EyeIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...props}>
      <path
        d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="12" r="2.4" fill="currentColor" />
    </svg>
  );
}

function EyeSlashIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...props}>
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <path
        d="M2 12s4-7 11-7c2.2 0 4.2.6 5.9 1.6"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
      />
      <path
        d="M21 12c-1.2 2-3 3.7-5.3 4.8"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
      />
    </svg>
  );
}

const VIEW = {
  WELCOME: "WELCOME",
  SIGNIN: "SIGNIN",
  FORGOT: "FORGOT",
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || "";
const PASSWORD_RESET_REDIRECT = import.meta.env.VITE_PASSWORD_RESET_REDIRECT || "";

export default function AuthModal({
  isOpen = true,
  onClose = () => {},
  onNavigate = () => {},
  onConfirm = () => {},
}) {
  const navigate = useNavigate();
  const auth = useAuth();
  const loginFromContext = auth?.login;

  const [history, setHistory] = useState([VIEW.WELCOME]);
  const view = history[history.length - 1];

  // states
  const [signUserType, setSignUserType] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const [status, setStatus] = useState(null);
  const [showPass, setShowPass] = useState(false);

  // user-exists check states
  const [userExistsEmailStatus, setUserExistsEmailStatus] = useState(null);
  const checkTimerRef = useRef(null);
  const checkAbortFlagRef = useRef({ aborted: false, currentKey: null });

  const timeoutsRef = useRef([]);
  const statusTimerRef = useRef(null);
  const recaptchaRef = useRef(null);
  const [captchaToken, setCaptchaToken] = useState(null);

  // helpers
  const go = (next) => setHistory((h) => [...h, next]);
  const back = () => {
    clearStatusImmediate();
    if (history.length > 1) setHistory((h) => h.slice(0, -1));
    else onClose();
  };

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) {
      clearStatusImmediate();
      onClose();
    }
  }
  function handleCloseClick() {
    clearStatusImmediate();
    onClose();
  }

  // ReCAPTCHA handler
  const handleCaptcha = (value) => {
    // value is a token string or null
    setCaptchaToken(value);
  };

  // small utility: trim only leading/trailing spaces (keeps inner spaces)
  function trimEnds(v = "") {
    return v.replace(/^\s+|\s+$/g, "");
  }

  function validateEmail(em) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em);
  }

  // ---------- Status helpers ----------
  function clearStatusImmediate() {
    if (statusTimerRef.current) {
      clearTimeout(statusTimerRef.current);
      statusTimerRef.current = null;
    }
    setStatus(null);
  }

  function showStatus(type, visibilityMs = 1000) {
    if (statusTimerRef.current) {
      clearTimeout(statusTimerRef.current);
      statusTimerRef.current = null;
    }
    setStatus(type);
    statusTimerRef.current = setTimeout(() => {
      setStatus(null);
      statusTimerRef.current = null;
    }, visibilityMs);
  }

  /* Secure, fast "does this email exist?" check */
  useEffect(() => {
    const trimmed = trimEnds(identifier);
    // clear previous timers/abort signals
    if (checkTimerRef.current) {
      clearTimeout(checkTimerRef.current);
      checkTimerRef.current = null;
    }
    checkAbortFlagRef.current.aborted = true;
    checkAbortFlagRef.current.currentKey = null;

    if (!trimmed) {
      setUserExistsEmailStatus(null);
      return;
    }

    setUserExistsEmailStatus("checking");

    if (!validateEmail(trimmed)) {
      setUserExistsEmailStatus(null);
      return;
    }

    const key = trimmed.toLowerCase();
    const abortFlag = { aborted: false, currentKey: key };
    checkAbortFlagRef.current = abortFlag;

    checkTimerRef.current = setTimeout(async () => {
      try {
        let exists = false;

        // Try RPC first, should return a boolean
        try {
          const { data: rpcData, error: rpcErr } = await supabase.rpc("check_email_exists", { p_email: key });
          // guard: if this call was aborted meanwhile, ignore result
          if (abortFlag.aborted || checkAbortFlagRef.current.currentKey !== key) {
            return;
          }
          if (!rpcErr && typeof rpcData === "boolean") {
            exists = rpcData === true;
            setUserExistsEmailStatus(exists);
            return;
          }
          // Some deployments may return [{ exists: true }] or { exists: true }
          if (!rpcErr && rpcData != null) {
            // handle possible shapes
            if (Array.isArray(rpcData) && rpcData.length > 0 && typeof rpcData[0] === "object") {
              exists = Boolean(Object.values(rpcData[0])[0]);
              setUserExistsEmailStatus(exists);
              return;
            }
            if (typeof rpcData === "object" && "exists" in rpcData) {
              exists = Boolean(rpcData.exists);
              setUserExistsEmailStatus(exists);
              return;
            }
          }
        } catch (e) {
          // ignore RPC errors -> fallback to select
        }

        // Fallback: minimal select on profiles table
        try {
          const { data, error } = await supabase
            .from("profiles")
            .select("id", { count: null, head: false })
            .eq("email", key)
            .maybeSingle();

          if (abortFlag.aborted || checkAbortFlagRef.current.currentKey !== key) {
            return;
          }

          if (error) {
            console.warn("profiles check error:", error);
            setUserExistsEmailStatus(null);
            return;
          }
          exists = Boolean(data?.id);
        } catch (selErr) {
          console.error("profiles select fallback failed:", selErr);
          exists = false;
        }

        setUserExistsEmailStatus(exists);
      } catch (err) {
        if (err?.name !== "AbortError") {
          console.error("Check failed:", err);
          setUserExistsEmailStatus(null);
        }
      } finally {
        // noop
      }
    }, 420);

    return () => {
      if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
      checkTimerRef.current = null;
      abortFlag.aborted = true;
      checkAbortFlagRef.current = abortFlag;
    };
  }, [identifier]);

  // cleanup timers on unmount
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach((t) => clearTimeout(t));
      timeoutsRef.current = [];
      if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
      checkAbortFlagRef.current.aborted = true;
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    };
  }, []);

  // sign-in handler: call backend /auth/signin which verifies captcha then signs-in via server
  async function handleSignIn(e) {
    e?.preventDefault?.();
    const emailTrimmed = trimEnds(identifier).toLowerCase();

    if (!emailTrimmed || !password || !signUserType) {
      showStatus("error", 1000);
      return;
    }

    // enforce user-exists check
    if (userExistsEmailStatus !== true) {
      showStatus("error", 1000);
      return;
    }

    // if using API backend, captchaToken must be present
    if (API_BASE_URL && !captchaToken) {
      if (recaptchaRef.current) recaptchaRef.current.reset();
      setCaptchaToken(null);
      showStatus("error", 1000);
      return;
    }

    setBusy(true);

    try {
      // Prefer backend signin for captcha enforcement + logging + rate-limit
      if (API_BASE_URL) {
        const res = await fetch(`${API_BASE_URL}/auth/signin`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: emailTrimmed,
            password,
            captchaToken,
            role: signUserType,
          }),
        });

        const payload = await res.json();

        if (!res.ok) {
          throw new Error(payload?.error || "Sign in failed");
        }

        // If backend returned a session object (access_token/refresh_token) set it in client.
        // Newer supabase client: auth.setSession({ access_token, refresh_token })
        if (payload?.session?.access_token) {
          try {
            // prefer supabase.auth.setSession (if available)
            if (supabase.auth?.setSession) {
              await supabase.auth.setSession({
                access_token: payload.session.access_token,
                refresh_token: payload.session.refresh_token,
              });
            } else if (supabase.auth?.setAuth) {
              // older clients may use setAuth
              supabase.auth.setAuth(payload.session.access_token);
            }
          } catch (sessErr) {
            console.warn("Failed to set session on client:", sessErr);
          }
        } else if (payload?.user && typeof loginFromContext === "function") {
          // fallback to client-side login (less ideal but workable)
          try {
            await loginFromContext(emailTrimmed, password);
          } catch (ctxErr) {
            console.warn("fallback auth.login failed:", ctxErr);
            // continue — user likely still signed in via server session
          }
        }

        showStatus("success", 700);
        const navT = setTimeout(() => {
          if (typeof onNavigate === "function") onNavigate(signUserType);
          if (signUserType === "admin") navigate("/Admin/Dashboard");
          else navigate("/User/Dashboard");
          if (typeof onConfirm === "function") onConfirm(signUserType);
          onClose();
        }, 700);
        timeoutsRef.current.push(navT);
      } else {
        // No API base: fall back to direct supabase sign-in
        const { data, error } = await supabase.auth.signInWithPassword({
          email: emailTrimmed,
          password,
        });
        if (error) throw error;

        showStatus("success", 700);
        const navT = setTimeout(() => {
          if (typeof onNavigate === "function") onNavigate(signUserType);
          if (signUserType === "admin") navigate("/Admin/Dashboard");
          else navigate("/User/Dashboard");
          if (typeof onConfirm === "function") onConfirm(signUserType);
          onClose();
        }, 700);
        timeoutsRef.current.push(navT);
      }
    } catch (err) {
      console.error("Sign-in error:", err);
      // reset captcha so user must re-verify if backend is used
      if (recaptchaRef.current) recaptchaRef.current.reset();
      setCaptchaToken(null);
      showStatus("error", 1000);
    } finally {
      setBusy(false);
    }
  }

  // forgot password handler: call backend to verify captcha then trigger reset email
  async function handleForgot(e) {
    e?.preventDefault?.();
    const emailTrimmed = trimEnds(identifier).toLowerCase();
    if (!emailTrimmed || !signUserType) {
      showStatus("error", 1000);
      return;
    }

    // If using backend we require captcha; for direct supabase flow captcha not required
    if (API_BASE_URL && !captchaToken) {
      if (recaptchaRef.current) recaptchaRef.current.reset();
      setCaptchaToken(null);
      showStatus("error", 1000);
      return;
    }

    setBusy(true);
    try {
      if (API_BASE_URL) {
        // Call backend reset-password endpoint (backend should verify captcha)
        const res = await fetch(`${API_BASE_URL}/auth/reset-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: emailTrimmed,
            captchaToken,
          }),
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload?.error || "Reset failed");

        // backend succeeded — show success UX
        showStatus("success", 1000);
        if (recaptchaRef.current) recaptchaRef.current.reset();
        setCaptchaToken(null);

        const navT = setTimeout(() => {
          if (typeof onNavigate === "function") onNavigate("reset");
          if (typeof onConfirm === "function") onConfirm("reset");
          onClose();
        }, 1200);
        timeoutsRef.current.push(navT);
      } else {
        // fallback: direct supabase call (no server-side captcha)
        // Use your public redirect page
        const { data, error } = await supabase.auth.resetPasswordForEmail(emailTrimmed, {
          redirectTo: PASSWORD_RESET_REDIRECT,
        });
        // supabase returns { data, error } (older SDKs returned { error })
        if (error) throw error;

        showStatus("success", 1200);
        const navT = setTimeout(() => {
          if (typeof onNavigate === "function") onNavigate("reset");
          if (typeof onConfirm === "function") onConfirm("reset");
          onClose();
        }, 1200);
        timeoutsRef.current.push(navT);
      }
    } catch (err) {
      console.error("Forgot password error:", err);
      if (recaptchaRef.current) recaptchaRef.current.reset();
      setCaptchaToken(null);
      showStatus("error", 1000);
    } finally {
      setBusy(false);
    }
  }

  // derive enabled states
  const signValid =
    !!identifier &&
    !!password &&
    !!signUserType &&
    !busy &&
    (API_BASE_URL ? !!captchaToken : true) &&
    userExistsEmailStatus === true;
  const forgotValid = !!identifier && !!signUserType && !busy && (API_BASE_URL ? !!captchaToken : true);

  if (!isOpen) return null;

  return (
    <div className={styles.authOverlay} role="dialog" aria-modal="true" onClick={handleOverlayClick}>
      <div className={styles.authModalContainer}>
        {history.length > 1 && (
          <button className={styles.backBtn} onClick={back} aria-label="Go back">
            <span className={styles.backIcon} />
          </button>
        )}

        <button className={styles.closeX} onClick={handleCloseClick} aria-label="Close" />

        {/* Success mini-modal */}
        {status === "success" && (
          <div className={styles.successPop}>
            {TICK_SVG}
            <p>Success!</p>
          </div>
        )}

        {/* Failure mini-modal */}
        {status === "error" && (
          <div className={styles.errorPop}>
            {CROSS_SVG}
            <p>
              Wrong Credentials
              <br />
              Or Server Error
            </p>
          </div>
        )}

        {/* Header */}
        <header className={styles.authHeader}>
          <img className={styles.brandLogo} src="/qnit-512.svg" alt="QNIT Logo" />
          {view === VIEW.WELCOME && (
            <>
              <h2 className={styles.headline}>Welcome To QNIT</h2>
              <p className={styles.subline}>
                Get started with QNIT and experience fast, secure access to papers, syllabus and more
              </p>
            </>
          )}
          {view === VIEW.SIGNIN && <h2 className={styles.headline}>User Sign In</h2>}
          {view === VIEW.FORGOT && <h2 className={styles.headline}>Reset Password</h2>}
        </header>

        {/* Welcome */}
        <section className={`${styles.panel} ${view === VIEW.WELCOME ? styles.show : ""}`} aria-hidden={view !== VIEW.WELCOME}>
          <div className={styles.spacerRows} />
          <button className={`${styles.btn} ${styles.primary}`} onClick={() => go(VIEW.SIGNIN)}>
            Sign In
          </button>
          <div className={styles.gapLines} />
          <p className={styles.altLink}>
            Don’t have an account?{" "}
            <span
              onClick={() => {
                try {
                  navigate("/SignUp");
                } catch {}
              }}
            >
              Sign Up
            </span>
          </p>
        </section>

        {/* Sign In */}
        <form
          className={`${styles.panel} ${view === VIEW.SIGNIN ? styles.show : ""}`}
          aria-hidden={view !== VIEW.SIGNIN}
          onSubmit={handleSignIn}
          noValidate
        >
          <div className={styles.field}>
            <label>User Type</label>
            <select
              value={signUserType}
              onChange={(e) => {
                setSignUserType(e.target.value);
                setIdentifier("");
                setUserExistsEmailStatus(null);
                setPassword("");
                clearStatusImmediate();
                if (recaptchaRef.current) recaptchaRef.current.reset();
                setCaptchaToken(null);
              }}
              required
            >
              <option value="" disabled>
                -- Select --
              </option>
              <option value="student">Student</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div className={styles.field}>
            <label>User ID</label>
            <input
              type="email"
              placeholder="Enter Your Email"
              value={identifier}
              onChange={(e) => {
                setIdentifier(trimEnds(e.target.value));
              }}
              required
              disabled={!signUserType}
            />
            <div>
              {!trimEnds(identifier) ? null : !validateEmail(trimEnds(identifier)) ? (
                <small className={`${styles.hint} ${styles.error}`}>Invalid email format</small>
              ) : userExistsEmailStatus === true ? (
                <small className={`${styles.hint} ${styles.success}`}>User is registered</small>
              ) : userExistsEmailStatus === false ? (
                <small className={`${styles.hint} ${styles.error}`}>User not registered</small>
              ) : (
                <small className={styles.hint}>Checking if user exists</small>
              )}
            </div>
          </div>

          <div className={styles.field}>
            <label>Password</label>
            <div className={styles.inputWithEye}>
              <input
                type={showPass ? "text" : "password"}
                placeholder="Enter your Password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                }}
                required
                disabled={!signUserType}
              />
              <button
                type="button"
                className={`${styles.eye} ${styles.passwordToggle}`}
                onClick={() => setShowPass((s) => !s)}
                aria-label={showPass ? "Hide password" : "Show password"}
                disabled={!signUserType}
              >
                {showPass ? <EyeSlashIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          <div className={styles.rowBetween}>
            {/* ReCAPTCHA: only show if user email exists and backend requires it */}
            <div
              className={styles.captchaContainer}
              style={{ display: API_BASE_URL && userExistsEmailStatus === true ? "block" : "none" }}
            >
              {RECAPTCHA_SITE_KEY ? (
                <ReCAPTCHA sitekey={RECAPTCHA_SITE_KEY} onChange={handleCaptcha} ref={recaptchaRef} key="dark" theme="dark" />
              ) : (
                API_BASE_URL ? <small style={{ color: "#c33" }}>reCAPTCHA not configured!</small> : null
              )}
            </div>
          </div>

          <button className={`${styles.btn} ${styles.primary} ${styles.block}`} type="submit" disabled={!signValid}>
            {busy ? (
              <>
                <span className={styles.spinnerInline} aria-hidden="true">
                  <i className="fas fa-hourglass-start"></i>
                </span>
                Processing...
              </>
            ) : (
              "Sign In"
            )}
          </button>

          <div className={styles.altLink} style={{ marginTop: "1rem" }}>
            <span onClick={() => go(VIEW.FORGOT)}>Forgot Password?</span>
          </div>
        </form>

        {/* Forgot Password */}
        <form
          className={`${styles.panel} ${view === VIEW.FORGOT ? styles.show : ""}`}
          aria-hidden={view !== VIEW.FORGOT}
          onSubmit={handleForgot}
          noValidate
        >
          <div className={styles.field}>
            <label>User Type</label>
            <select
              value={signUserType}
              onChange={(e) => {
                setSignUserType(e.target.value);
                setIdentifier("");
                setUserExistsEmailStatus(null);
                clearStatusImmediate();
                if (recaptchaRef.current) recaptchaRef.current.reset();
                setCaptchaToken(null);
              }}
              required
            >
              <option value="" disabled>
                -- Select --
              </option>
              <option value="student">Student</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div className={styles.field}>
            <label>User ID</label>
            <input
              type="email"
              placeholder="Enter Your Registered Email"
              value={identifier}
              onChange={(e) => setIdentifier(trimEnds(e.target.value))}
              required
              disabled={!signUserType}
            />
            <div>
              {!trimEnds(identifier) ? null : !validateEmail(trimEnds(identifier)) ? (
                <small className={`${styles.hint} ${styles.error}`}>Invalid email format</small>
              ) : userExistsEmailStatus === true ? (
                <small className={`${styles.hint} ${styles.success}`}>User is registered</small>
              ) : userExistsEmailStatus === false ? (
                <small className={`${styles.hint} ${styles.error}`}>User not registered</small>
              ) : (
                <small className={styles.hint}>Checking if user exists</small>
              )}
            </div>
          </div>

          <div className={styles.rowBetween}>
            {/* ReCAPTCHA: only show if backend requires it and user exists */}
            <div
              className={styles.captchaContainer}
              style={{ display: API_BASE_URL && userExistsEmailStatus === true ? "block" : "none" }}
            >
              {RECAPTCHA_SITE_KEY ? (
                <ReCAPTCHA sitekey={RECAPTCHA_SITE_KEY} onChange={handleCaptcha} ref={recaptchaRef} key="dark" theme="dark" />
              ) : (
                API_BASE_URL ? <small style={{ color: "#c33" }}>reCAPTCHA not configured!</small> : null
              )}
            </div>
          </div>

          <button className={`${styles.btn} ${styles.primary} ${styles.block}`} type="submit" disabled={!forgotValid}>
            {busy ? (
              <>
                <span className={styles.spinnerInline} aria-hidden="true">
                  <i className="fas fa-hourglass-start"></i>
                </span>
                Processing...
              </>
            ) : (
              "Send Recovery Link"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}