// src/pages/Authentication/components/AuthModal.jsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import styles from "./AuthModal.module.css";

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

/* Small Eye Icon */
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

export default function AuthModal({
  isOpen = true,
  onClose = () => {},
  onNavigate = () => {},
  onConfirm = () => {},
}) {
  const navigate = useNavigate();
  const auth = useAuth();
  // prefer calling auth.login(email, password) (remember removed)
  const loginFromContext = auth?.login;

  const [history, setHistory] = useState([VIEW.WELCOME]);
  const view = history[history.length - 1];

  // states
  const [signUserType, setSignUserType] = useState("");
  const [identifier, setIdentifier] = useState(""); // raw input (we trim ends on change)
  const [password, setPassword] = useState("");
  // keep checkbox visible but non-functional (UI only)
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);

  const [status, setStatus] = useState(null); // "success" | "error" | null
  const [showPass, setShowPass] = useState(false);

  // user-exists check states:
  // false = not registered, "checking" = in flight, true = registered, null = unknown/error
  const [userExistsEmailStatus, setUserExistsEmailStatus] = useState(null);
  const checkTimerRef = useRef(null);
  const checkControllerRef = useRef(null);

  const timeoutsRef = useRef([]);

  // helpers
  const go = (next) => setHistory((h) => [...h, next]);
  const back = () => {
    setStatus(null);
    if (history.length > 1) setHistory((h) => h.slice(0, -1));
    else onClose();
  };

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) {
      setStatus(null);
      onClose();
    }
  }
  function handleCloseClick() {
    setStatus(null);
    onClose();
  }

  // small utility: trim only leading/trailing spaces (keeps inner spaces)
  function trimEnds(v = "") {
    return v.replace(/^\s+|\s+$/g, "");
  }

  function validateEmail(em) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em);
  }

  // Debounced user-exists check
  useEffect(() => {
    const trimmed = trimEnds(identifier);

    // clear any previous pending timer / controller
    if (checkTimerRef.current) {
      clearTimeout(checkTimerRef.current);
      checkTimerRef.current = null;
    }
    if (checkControllerRef.current) {
      try {
        checkControllerRef.current.abort();
      } catch {}
      checkControllerRef.current = null;
    }

    if (!trimmed) {
      setUserExistsEmailStatus(null);
      return;
    }

    // show checking while we wait for debounce + fetch result
    setUserExistsEmailStatus("checking");

    // only attempt server check if looks like a valid email to reduce noise
    if (!validateEmail(trimmed)) {
      // keep "checking" until user types a valid-looking email
      return;
    }

    const controller = new AbortController();
    checkControllerRef.current = controller;

    checkTimerRef.current = setTimeout(async () => {
      try {
        let exists = false;

        if (API_BASE_URL) {
          const url = new URL(`${API_BASE_URL}/auth/check-user`);
          url.searchParams.set("field", "email");
          url.searchParams.set("value", trimmed.toLowerCase());
          const res = await fetch(url.toString(), { signal: controller.signal });
          if (res.ok) {
            const j = await res.json();
            exists = !!j.exists;
          } else {
            // non-ok response -> treat as unknown
            exists = false;
          }
        } else {
          // fallback: check profiles table (case-insensitive)
          const { data, error } = await supabase
            .from("profiles")
            .select("id")
            .ilike("email", trimmed.toLowerCase())
            .maybeSingle();
          if (error) {
            console.warn("profiles check error:", error);
            exists = false;
          } else {
            exists = !!data?.id;
          }
        }

        setUserExistsEmailStatus(exists);
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Check failed:", err);
          setUserExistsEmailStatus(null);
        }
      } finally {
        checkControllerRef.current = null;
        checkTimerRef.current = null;
      }
    }, 420);

    return () => {
      if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
      if (checkControllerRef.current) {
        try {
          checkControllerRef.current.abort();
        } catch {}
      }
      checkTimerRef.current = null;
      checkControllerRef.current = null;
    };
  }, [identifier]);

  // cleanup timers
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach((t) => clearTimeout(t));
      timeoutsRef.current = [];
      if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
      if (checkControllerRef.current) {
        try {
          checkControllerRef.current.abort();
        } catch {}
      }
    };
  }, []);

  // sign-in handler
  async function handleSignIn(e) {
    e?.preventDefault?.();

    const emailTrimmed = trimEnds(identifier).toLowerCase();

    if (!emailTrimmed || !password || !signUserType) {
      setStatus("error");
      return;
    }

    // enforce user-exists check: must be explicitly true
    if (userExistsEmailStatus !== true) {
      setStatus("error");
      return;
    }

    setBusy(true);
    try {
      // Call context login (which now accepts only email & password)
      if (typeof loginFromContext === "function") {
        try {
          await loginFromContext(emailTrimmed, password);
        } catch (ctxErr) {
          // fallback to direct supabase if context login fails
          console.warn("context login failed (falling back to supabase):", ctxErr);
          const { data, error } = await supabase.auth.signInWithPassword({
            email: emailTrimmed,
            password,
          });
          if (error) throw error;
        }
      } else {
        // fallback: direct supabase
        const { data, error } = await supabase.auth.signInWithPassword({
          email: emailTrimmed,
          password,
        });
        if (error) throw error;
      }

      setStatus("success");

      // small delay to let success mini-modal show
      const navT = setTimeout(() => {
        if (typeof onNavigate === "function") onNavigate(signUserType);
        if (signUserType === "admin") navigate("/Admin/Dashboard");
        else navigate("/User/Dashboard");
        if (typeof onConfirm === "function") onConfirm(signUserType);
        onClose();
      }, 700);
      timeoutsRef.current.push(navT);
    } catch (err) {
      console.error("Sign-in error:", err);
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }

  // whenever status changes, auto clear after 1000ms
  useEffect(() => {
    if (status === "success" || status === "error") {
      const t = setTimeout(() => setStatus(null), 1000);
      timeoutsRef.current.push(t);
      return () => clearTimeout(t);
    }
  }, [status]);

  // forgot password handler (uses trimmed email)
  async function handleForgot(e) {
    e?.preventDefault?.();
    const emailTrimmed = trimEnds(identifier).toLowerCase();
    if (!emailTrimmed || !signUserType) {
      setStatus("error");
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(emailTrimmed, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;

      setStatus("success");
      const navT = setTimeout(() => {
        if (typeof onNavigate === "function") onNavigate("reset");
        if (typeof onConfirm === "function") onConfirm("reset");
        onClose();
      }, 1200);
      timeoutsRef.current.push(navT);
    } catch (err) {
      console.error("Forgot password error:", err);
      setStatus("error");
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
    userExistsEmailStatus === true; // enforce user exists

  const forgotValid = !!identifier && !!signUserType && !busy;

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
              Wrong
              <br />
              Credentials
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
                // reset identifier/user check when user type changes
                setIdentifier("");
                setUserExistsEmailStatus(null);
                setPassword("");
                setStatus(null);
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
            <label>Email</label>
            <input
              type="email"
              placeholder="Enter Your Email"
              value={identifier}
              // trim leading/trailing spaces only
              onChange={(e) => setIdentifier(trimEnds(e.target.value))}
              required
              disabled={!signUserType}
            />
            <div>
              {/* Show guidance based on trimmed identifier and check status */}
              {!trimEnds(identifier) ? null : userExistsEmailStatus === "checking" ? (
                <small className={styles.hint}>Checking if user exists</small>
              ) : userExistsEmailStatus === true ? (
                <small className={`${styles.hint} ${styles.success}`}>User is registered</small>
              ) : userExistsEmailStatus === false ? (
                <small className={`${styles.hint} ${styles.error}`}>User not registered</small>
              ) : (
                // null indicates ambiguous state (check error or not attempted)
                <small className={styles.hint}>Unable to check the email</small>
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
                onChange={(e) => setPassword(e.target.value)}
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
            <label className={styles.remember}>
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                disabled={!signUserType}
              />
              Remember me
            </label>
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
                setStatus(null);
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
            <label>Email</label>
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
                <small className={styles.hint}>Unable to check the email</small>
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