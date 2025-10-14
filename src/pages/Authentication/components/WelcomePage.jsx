// src/pages/Authentication/components/WelcomePage.jsx
import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import styles from "./WelcomePage.module.css";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";

// Helper: parse an access token or token from URL fragment or query
function parseAccessTokenFromUrl() {
  try {
    if (window.location.hash) {
      const hash = window.location.hash.replace(/^#/, "");
      const params = new URLSearchParams(hash);
      const access_token = params.get("access_token") || params.get("token");
      if (access_token) return access_token;
    }
    const url = new URL(window.location.href);
    const access_token = url.searchParams.get("access_token") || url.searchParams.get("token");
    if (access_token) return access_token;
  } catch (e) {
    // ignore
  }
  return null;
}

// Clear token params from URL
function clearTokenFromUrl() {
  try {
    const u = new URL(window.location.href);
    u.searchParams.delete("access_token");
    u.searchParams.delete("token");
    window.history.replaceState({}, document.title, u.pathname + u.search);
  } catch (e) {
    try { window.history.replaceState({}, document.title, window.location.pathname); } catch (e) {}
  }
}

export default function WelcomePage() {
  const navigate = useNavigate();
  const mountedRef = useRef(true);
  const [status, setStatus] = useState("pending");
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [message, setMessage] = useState("");
  const SUCCESS_IMG = "/Success.jpg";
  const FAIL_IMG = "/Fail.jpg";

  useEffect(() => {
    mountedRef.current = true;

    async function resolveSessionAndUser() {
      setStatus("pending");

      // 1) If welcome already consumed, redirect immediately to the appropriate dashboard
      try {
        const seen = localStorage.getItem("qn_welcome_shown");
        if (seen) {
          try {
            const parsed = JSON.parse(seen);
            if (parsed && parsed.userId) {
              const route = parsed.role === "admin" ? "/Admin/Dashboard" : "/User/Dashboard";
              // use location.replace to prevent back-navigation to welcome
              window.location.replace(route);
              return;
            }
          } catch (e) {
            // ignore parse errors and continue
          }
        }
      } catch (e) {
        // ignore localStorage errors
      }

      try {
        // 2) Try SDK helper that parses session from URL and stores it
        if (supabase?.auth?.getSessionFromUrl) {
          try {
            const { data, error } = await supabase.auth.getSessionFromUrl({ storeSession: true }).catch(() => ({}));
            if (!error && (data?.session?.user || data?.user)) {
              const u = data.session?.user || data.user;
              if (!mountedRef.current) return;
              setUser(u);
              const r = u.user_metadata?.role || u.role || "student";
              setRole(r);
              setStatus("success");
              setMessage("You're All Set Now! Use the button below to navigate to your dashboard");
              try { localStorage.setItem("qn_welcome_shown", JSON.stringify({ userId: u.id, role: r, ts: Date.now() })); } catch (e) {}
              clearTokenFromUrl();
              return;
            }
          } catch (errInner) {
            // ignore and continue
          }
        }

        // 3) Fallback: check for already stored session
        try {
          const { data: sessionResp } = await supabase.auth.getSession();
          const sessionObj = sessionResp?.session ?? sessionResp;
          if (sessionObj?.user) {
            const u = sessionObj.user;
            if (!mountedRef.current) return;
            setUser(u);
            const r = u.user_metadata?.role || u.role || "student";
            setRole(r);
            setStatus("success");
            setMessage("You're All Set Now! Use the button below to navigate to your dashboard");
            try { localStorage.setItem("qn_welcome_shown", JSON.stringify({ userId: u.id, role: r, ts: Date.now() })); } catch (e) {}
            clearTokenFromUrl();
            return;
          }
        } catch (errSession) {
          // ignore and continue
        }

        // 4) Fallback: parse access token from URL (hash or query) and call /auth/v1/user to validate
        const token = parseAccessTokenFromUrl();
        if (token && SUPABASE_URL) {
          try {
            const resp = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`, {
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            });
            if (resp.ok) {
              const u = await resp.json();
              if (!mountedRef.current) return;
              setUser(u);
              const r = u.user_metadata?.role || u.role || "student";
              setRole(r);
              setStatus("success");
              setMessage("You're All Set Now! Use the button below to navigate to your dashboard");
              try { localStorage.setItem("qn_welcome_shown", JSON.stringify({ userId: u.id, role: r, ts: Date.now() })); } catch (e) {}
              clearTokenFromUrl();

              // best-effort: ensure server-side profile exists (upsert)
              try {
                const meta = u.user_metadata || {};
                const profileRow = {
                  id: u.id,
                  full_name: meta.full_name || null,
                  email: u.email || null,
                  contact: meta.contact || null,
                  role: meta.role || (r === "admin" ? "admin" : "student"),
                  stream: meta.stream || null,
                  year_of_study: meta.year_of_study || null,
                };
                // Upsert (service role not available here — this is best-effort from client)
                await supabase.from("profiles").upsert([profileRow], { onConflict: "id", returning: "minimal" });
              } catch (e) {
                // Non-fatal
                console.warn("WelcomePage: profile upsert failed:", e);
              }
              return;
            }
          } catch (e) {
            console.warn("WelcomePage: token user fetch failed", e);
          }
        }

        // If we get here, we could not verify session/token
        setStatus("failed");
        setMessage("Unable to verify your request! The confirmation link may be expired or invalid");
      } catch (err) {
        console.error("WelcomePage error:", err);
        setStatus("failed");
        setMessage("Unable to verify the confirmation link! Please try again or contact support");
      }
    }
    resolveSessionAndUser();

    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Action when user clicks Go To Dashboard
  const handleGoToDashboard = () => {
    try {
      if (user && user.id) {
        try { localStorage.setItem("qn_welcome_shown", JSON.stringify({ userId: user.id, role: role || "student", ts: Date.now() })); } catch (e) {}
      }
      const route = role === "admin" ? "/Admin/Dashboard" : "/User/Dashboard";
      // replace so back button won't return to welcome
      window.location.replace(route);
    } catch (e) {
      console.warn("Failed to navigate to dashboard:", e);
      navigate(role === "admin" ? "/Admin/Dashboard" : "/User/Dashboard", { replace: true });
    }
  };

  const handleRetry = () => {
    try {
      window.location.reload();
    } catch (e) {
      navigate("/SignUp", { replace: true });
    }
  };

  return (
    <div className={styles.welcomePage}>
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>{status === "success" ? "Welcome To QNIT" : "Confirmation Issue"}</h1>
        </header>

        <main className={styles.main}>
          <div className={styles.imageWrap}>
            <img
              src={status === "success" ? SUCCESS_IMG : FAIL_IMG}
              alt={status === "success" ? "Success" : "Failed"}
              className={styles.heroImage}
            />
          </div>

          <div className={styles.messageBox}>
            {status === "pending" && <p className={styles.hint}>Verifying Your Account, Please Wait…</p>}

            {status === "success" && (
              <>
                <p className={styles.lead}>Congratulations — Account Verification Successful</p>
                <p className={styles.sub}>{message}</p>
              </>
            )}

            {status === "failed" && (
              <>
                <p className={styles.lead}>We couldn't confirm your account</p>
                <p className={styles.sub}>{message}</p>
              </>
            )}
          </div>

          <div className={styles.actions}>
            {status === "success" ? (
              <button className={`${styles.btn} ${styles.primary}`} onClick={handleGoToDashboard}>
                Go To Dashboard
              </button>
            ) : (
              <>
                <button className={`${styles.btn} ${styles.primary}`} onClick={handleRetry}>Try Again</button>
              </>
            )}
          </div>
        </main>

        <footer className={styles.footer}>
          <small>{new Date().getFullYear()} QNIT. All Rights Reserved.</small>
        </footer>
      </div>
    </div>
  );
}