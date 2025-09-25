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

export default function AuthModal({
  isOpen = true,
  onClose = () => {},
  onNavigate = () => {},
  onConfirm = () => {}, // optional
}) {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [history, setHistory] = useState([VIEW.WELCOME]);
  const view = history[history.length - 1];

  // States
  const [signUserType, setSignUserType] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);

  const [status, setStatus] = useState(null);
  const [showPass, setShowPass] = useState(false);

  const timeoutsRef = useRef([]);

  // Helpers
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

  const fieldsDisabled = !signUserType;

  /* 🔹 Sign In with Supabase */
  async function handleSignIn(e) {
    e?.preventDefault?.();
    if (!identifier || !password || !signUserType) return;

    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: identifier,
        password,
      });

      if (error) throw error;

      setStatus("success");

      login({
        id: data.user.id,
        role: signUserType,
        email: data.user.email,
        remember,
      });

      const navT = setTimeout(() => {
        if (typeof onNavigate === "function") onNavigate(signUserType);

        if (signUserType === "admin") {
          navigate("/Admin/Dashboard");
        } else {
          navigate("/User/Dashboard");
        }

        if (typeof onConfirm === "function") onConfirm(signUserType);
        onClose();
      }, 900);

      timeoutsRef.current.push(navT);
    } catch (err) {
      console.error("Sign-in error:", err.message);
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }

  /* 🔹 Forgot Password with Supabase Email Link */
  async function handleForgot(e) {
    e?.preventDefault?.();
    if (!identifier || !signUserType) return;

    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(identifier, {
        redirectTo: `${window.location.origin}/reset-password`, // Must be whitelisted in Supabase
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
      console.error("Forgot password error:", err.message);
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }

  // Auto-remove mini notifications
  useEffect(() => {
    if (status === "success" || status === "error") {
      const t = setTimeout(() => setStatus(null), 1500);
      timeoutsRef.current.push(t);
      return () => clearTimeout(t);
    }
  }, [status]);

  // Clean timers on unmount
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach((id) => clearTimeout(id));
      timeoutsRef.current = [];
    };
  }, []);

  const signValid = !!identifier && !!password && !!signUserType && !busy;
  const forgotValid = !!identifier && !!signUserType && !busy;

  if (!isOpen) return null;

  return (
    <div
      className={styles.authOverlay}
      role="dialog"
      aria-modal="true"
      onClick={handleOverlayClick}
    >
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
                Get started with QNIT and experience fast, secure access to
                papers, syllabus and more
              </p>
            </>
          )}
          {view === VIEW.SIGNIN && <h2 className={styles.headline}>User Sign In</h2>}
          {view === VIEW.FORGOT && <h2 className={styles.headline}>Reset Password</h2>}
        </header>

        {/* Welcome */}
        <section
          className={`${styles.panel} ${view === VIEW.WELCOME ? styles.show : ""}`}
          aria-hidden={view !== VIEW.WELCOME}
        >
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
              onChange={(e) => setSignUserType(e.target.value)}
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
              placeholder="Registered Email"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              disabled={fieldsDisabled}
            />
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
                disabled={fieldsDisabled}
              />
              <button
                type="button"
                className={`${styles.eye} ${styles.passwordToggle}`}
                onClick={() => setShowPass((s) => !s)}
                aria-label={showPass ? "Hide password" : "Show password"}
                disabled={fieldsDisabled}
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
                disabled={fieldsDisabled}
              />
              Remember me
            </label>
          </div>

          <button
            className={`${styles.btn} ${styles.primary} ${styles.block}`}
            type="submit"
            disabled={!signValid}
          >
            {busy ? "Processing..." : "Sign In"}
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
              onChange={(e) => setSignUserType(e.target.value)}
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
              placeholder="Enter your Registered Email"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              disabled={fieldsDisabled}
            />
          </div>

          <button
            className={`${styles.btn} ${styles.primary} ${styles.block}`}
            type="submit"
            disabled={!forgotValid}
          >
            {busy ? "Processing..." : "Send Recovery Link"}
          </button>
        </form>
      </div>
    </div>
  );
}