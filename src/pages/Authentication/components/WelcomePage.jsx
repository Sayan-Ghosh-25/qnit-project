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

  // Helper: upsert profile (best-effort)
  async function tryUpsertProfile(u, resolvedRole) {
    if (!u || !u.id) return false;

    // Build profile object from metadata (best-effort)
    const meta = u.user_metadata || {};
    const profileRow = {
      id: u.id,
      full_name: meta.full_name || null,
      email: u.email || null,
      contact: meta.contact || null,
      role: meta.role || resolvedRole || (resolvedRole === "admin" ? "admin" : "student"),
      stream: meta.stream || null,
      year_of_study: meta.year_of_study || null,
      access_key: meta.access_key || null,
    };

    // If email missing, still attempt (some setups may not require email in profile)
    try {
      const { error } = await supabase
        .from("profiles")
        .upsert([profileRow], { onConflict: "id", returning: "minimal" });
      if (error) {
        console.warn("WelcomePage: profiles upsert returned error:", error);
        return false;
      }
      return true;
    } catch (e) {
      console.warn("WelcomePage: profiles upsert failed:", e);
      return false;
    }
  }

  useEffect(() => {
    mountedRef.current = true;

    async function resolveSessionAndUser() {
      setStatus("pending");

      try {
        // Attempt flow A: SDK helper that parses session from URL (preferred)
        let resolvedUser = null;
        let resolvedRole = null;
        if (supabase?.auth?.getSessionFromUrl) {
          try {
            const got = await supabase.auth.getSessionFromUrl({ storeSession: true }).catch(() => ({}));
            const maybeUser = got?.data?.session?.user || got?.user || got?.data?.user || null;
            if (maybeUser) {
              resolvedUser = maybeUser;
              resolvedRole = maybeUser.user_metadata?.role || maybeUser.role || "student";
              // Attempt to refresh user metadata from SDK
              try {
                if (supabase?.auth?.getUser) {
                  const { data: refreshed } = await supabase.auth.getUser();
                  if (refreshed?.user) resolvedUser = refreshed.user;
                }
              } catch (e) {
                // ignore
              }
            }
          } catch (errInner) {
            // ignore and continue to other fallbacks
            console.warn("WelcomePage: getSessionFromUrl failed:", errInner);
          }
        }

        // Attempt flow B: check stored session
        if (!resolvedUser) {
          try {
            const sessionResp = await supabase.auth.getSession().catch(() => ({}));
            const sessionObj = sessionResp?.data?.session ?? sessionResp?.session ?? sessionResp?.data ?? sessionResp;
            const maybeUser = sessionObj?.user ?? null;
            if (maybeUser) {
              resolvedUser = maybeUser;
              resolvedRole = maybeUser.user_metadata?.role || maybeUser.role || "student";
            }
          } catch (errSession) {
            console.warn("WelcomePage: getSession error:", errSession);
          }
        }

        // Attempt flow C: parse access token in URL and call auth/v1/user (server-side method)
        const token = parseAccessTokenFromUrl();
        if (!resolvedUser && token && SUPABASE_URL) {
          try {
            const resp = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`, {
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            });
            if (resp.ok) {
              const fetchedUser = await resp.json();
              // fetchedUser shape is user object
              if (fetchedUser) {
                resolvedUser = fetchedUser;
                resolvedRole = fetchedUser.user_metadata?.role || fetchedUser.role || "student";
              }
            } else {
              console.warn("WelcomePage: /auth/v1/user returned non-ok:", resp.status);
            }
          } catch (e) {
            console.warn("WelcomePage: token user fetch failed", e);
          }
        }

        // If we still don't have a user, verification failed
        if (!resolvedUser) {
          await new Promise(res => setTimeout(res, 500));

          if (!resolvedUser) {
            setStatus("failed");
            setMessage("Unable to verify your request! The confirmation link may be expired or invalid");
            return;
          }
        }        

        // We have a resolvedUser. Try to refresh the user via SDK getUser() if possible to get freshest metadata
        try {
          if (supabase?.auth?.getUser) {
            const { data: refreshed } = await supabase.auth.getUser().catch(() => ({}));
            if (refreshed?.user) {
              resolvedUser = refreshed.user;
              resolvedRole = resolvedUser.user_metadata?.role || resolvedUser.role || resolvedRole || "student";
            }
          }
        } catch (e) {
          // ignore
        }

        // Best-effort: if metadata seems minimal, attempt one more fetch using token (if available)
        if (token && (!resolvedUser.user_metadata || Object.keys(resolvedUser.user_metadata || {}).length === 0)) {
          try {
            const resp = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`, {
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            });
            if (resp.ok) {
              const fetchedUser = await resp.json();
              if (fetchedUser) {
                resolvedUser = fetchedUser;
                resolvedRole = fetchedUser.user_metadata?.role || fetchedUser.role || resolvedRole || "student";
              }
            }
          } catch (e) {
            // ignore
          }
        }

        // Attempt upsert — best-effort
        try {
          await new Promise(res => setTimeout(res, 300));
          await tryUpsertProfile(resolvedUser, resolvedRole);
        } catch (e) {
          console.warn("WelcomePage: profile upsert attempt threw:", e);
        }

        // Mark success
        if (!mountedRef.current) return;
        setUser(resolvedUser);
        setRole(resolvedRole || "student");
        setStatus("success");
        setMessage("You're All Set Now! Use the button below to navigate to your dashboard");

        // Persist one-time marker so the welcome cannot be revisited
        try {
          localStorage.setItem("qn_welcome_shown", JSON.stringify({ userId: resolvedUser.id, role: resolvedRole || "student", ts: Date.now() }));
        } catch (e) {
          // ignore storage errors
        }

        // cleanup URL tokens
        clearTokenFromUrl();
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
      {status === "pending" ?
      <p className={styles.wait} style={{fontSize: "1.25rem"}}>Verifying...</p> :
        (<div className={styles.container}>
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
      </div> )}
    </div>
  );
}