// src/pages/Authentication/components/WelcomePage.jsx
import { useEffect, useRef, useState } from "react";
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
    try {
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (e) {
      // ignore
    }
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

  const MAX_ATTEMPTS = 5;
  const ATTEMPT_DELAY_MS = 800;
  const PROFILE_UPSERT_GRACE_MS = 500;

  // best-effort: upsert profile so dashboard can load profile row later
  async function tryUpsertProfile(u, resolvedRole) {
    if (!u || !u.id) return false;
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

    async function attemptResolveUser(token) {
      // 1) Try SDK's getSessionFromUrl (consumes token if present in URL and stores session)
      if (supabase?.auth?.getSessionFromUrl) {
        try {
          const got = await supabase.auth.getSessionFromUrl({ storeSession: true }).catch(() => ({}));
          const maybeUser = got?.data?.session?.user || got?.user || got?.data?.user || null;
          if (maybeUser) {
            return { user: maybeUser, source: "getSessionFromUrl" };
          }
        } catch (e) {
          // ignore and continue
          console.warn("WelcomePage: getSessionFromUrl threw:", e);
        }
      }

      // 2) Try SDK's getSession/getUser (may return if SDK stored session)
      try {
        if (typeof supabase.auth.getUser === "function") {
          const { data: refreshed } = await supabase.auth.getUser().catch(() => ({}));
          if (refreshed?.user) {
            return { user: refreshed.user, source: "auth.getUser" };
          }
        }
      } catch (e) {
        console.warn("WelcomePage: auth.getUser threw:", e);
      }

      // Older SDK: getSession()
      try {
        if (typeof supabase.auth.getSession === "function") {
          const sessionResp = await supabase.auth.getSession().catch(() => ({}));
          const sessionObj = sessionResp?.data?.session ?? sessionResp?.session ?? sessionResp;
          const maybeUser = sessionObj?.user ?? null;
          if (maybeUser) {
            return { user: maybeUser, source: "auth.getSession" };
          }
        }
      } catch (e) {
        console.warn("WelcomePage: auth.getSession threw:", e);
      }

      // 3) If we have a token in URL, call /auth/v1/user with it (server-side validate)
      if (token && SUPABASE_URL) {
        try {
          const resp = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`, {
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          });
          if (resp.ok) {
            const fetchedUser = await resp.json().catch(() => null);
            if (fetchedUser) {
              return { user: fetchedUser, source: "auth/v1/user" };
            }
          } else {
            console.warn("WelcomePage: /auth/v1/user returned non-ok:", resp.status);
          }
        } catch (e) {
          console.warn("WelcomePage: token user fetch failed:", e);
        }
      }
      return null;
    }

    async function resolveSessionAndUser() {
      setStatus("pending");
      setMessage("");

      const token = parseAccessTokenFromUrl();

      let resolved = null;
      for (let attempt = 0; attempt < MAX_ATTEMPTS && mountedRef.current; attempt++) {
        try {
          resolved = await attemptResolveUser(token);
        } catch (e) {
          console.warn("WelcomePage: attemptResolveUser error:", e);
          resolved = null;
        }

        if (resolved && resolved.user) {
          const resolvedUser = resolved.user;
          const resolvedRole = resolvedUser.user_metadata?.role || resolvedUser.role || "student";

          // give backend a small grace window for profile row creation/upsert
          try {
            await new Promise((r) => setTimeout(r, PROFILE_UPSERT_GRACE_MS));
            await tryUpsertProfile(resolvedUser, resolvedRole);
          } catch (e) {
            console.warn("WelcomePage: upsert after resolve failed:", e);
          }

          // Finalize Success
          if (!mountedRef.current) return;
          setUser(resolvedUser);
          setRole(resolvedRole);
          setStatus("success");
          setMessage("You're All Set Now! Use the button below to navigate to your dashboard");
          clearTokenFromUrl();
          return;
        }

        // not resolved this attempt: wait and retry
        await new Promise((r) => setTimeout(r, ATTEMPT_DELAY_MS));
      }

      // exhausted attempts
      if (!mountedRef.current) return;
      setStatus("failed");
      setMessage(
        "Unable to verify your request! The confirmation link may be expired or invalid"
      );
      clearTokenFromUrl();
    }
    resolveSessionAndUser();

    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Action when user clicks Go To Dashboard
  const handleGoToDashboard = () => {
    try {
      if (user && user.id) {
        try {
          localStorage.setItem("qn_welcome_shown", JSON.stringify({ userId: user.id, role: role || "student", ts: Date.now() }));
        } catch (e) {
          // ignore
        }
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
      {status === "pending" ? (
        <div className={styles.pendingBox}>
          <p className={styles.wait} style={{ fontSize: "1.25rem", textAlign: "center" }}>
            Verifying...
          </p>
        </div>
      ) : (
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
                  <button className={`${styles.btn} ${styles.primary}`} onClick={handleRetry}>
                    Try Again
                  </button>
                </>
              )}
            </div>
          </main>

          <footer className={styles.footer}>
            <small>{new Date().getFullYear()} QNIT. All Rights Reserved.</small>
          </footer>
        </div>
      )}
    </div>
  );
}