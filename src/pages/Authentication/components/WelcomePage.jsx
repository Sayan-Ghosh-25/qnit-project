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
      const refresh_token = params.get("refresh_token");
      if (access_token) return { access_token, refresh_token: refresh_token || null };
    }
    const url = new URL(window.location.href);
    const access_token = url.searchParams.get("access_token") || url.searchParams.get("token");
    const refresh_token = url.searchParams.get("refresh_token") || null;
    if (access_token) return { access_token, refresh_token };
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
    u.searchParams.delete("refresh_token");
    // remove hash fragment as well
    const path = u.pathname + u.search;
    window.history.replaceState({}, document.title, path);
  } catch (e) {
    try {
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch {}
  }
}

export default function WelcomePage() {
  const navigate = useNavigate();
  const mountedRef = useRef(true);
  const [status, setStatus] = useState("pending");
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);
  const [preparingText, setPreparingText] = useState("Verifying Your Account, Please Wait…");

  const SUCCESS_IMG = "/Success.jpg";
  const FAIL_IMG = "/Fail.jpg";

  // Utility: sleep
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Get SDK session (safe wrapper)
  async function getSdkSession() {
    try {
      if (supabase?.auth?.getSession) {
        const resp = await supabase.auth.getSession().catch(() => ({}));
        // newer SDK shape: { data: { session } }
        const session = resp?.data?.session ?? resp?.session ?? resp?.data ?? resp;
        return session ?? null;
      }
      // older SDK: supabase.auth.session()
      if (typeof supabase.auth?.session === "function") {
        return supabase.auth.session() ?? null;
      }
    } catch (e) {
      // ignore
    }
    return null;
  }

  // Try to set SDK session from token object { access_token, refresh_token }
  async function trySetSessionFromToken(tokenObj) {
    if (!tokenObj || !tokenObj.access_token) return false;

    try {
      // prefer setSession (newer SDK)
      if (supabase?.auth?.setSession) {
        await supabase.auth.setSession({
          access_token: tokenObj.access_token,
          refresh_token: tokenObj.refresh_token || tokenObj.access_token,
        });
        return true;
      }
      // older fallback: setAuth
      if (supabase?.auth?.setAuth) {
        supabase.auth.setAuth(tokenObj.access_token);
        return true;
      }
    } catch (e) {
      console.warn("WelcomePage: setSession failed:", e);
    }
    return false;
  }

  // Fetch user via SDK getUser or session; fallback to /auth/v1/user if token available
  async function resolveUserUsingSdkOrToken(tokenObj) {
    try {
      // 1) try getUser (newer SDK)
      if (supabase?.auth?.getUser) {
        const { data } = await supabase.auth.getUser().catch(() => ({}));
        if (data?.user) return data.user;
      }

      // 2) try getSession -> session.user
      const session = await getSdkSession();
      if (session?.user) return session.user;

      // 3) fallback: if token present, call /auth/v1/user
      if (tokenObj?.access_token && SUPABASE_URL) {
        try {
          const resp = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`, {
            headers: { Authorization: `Bearer ${tokenObj.access_token}`, "Content-Type": "application/json" },
          });
          if (resp.ok) {
            const userObj = await resp.json().catch(() => null);
            if (userObj) return userObj;
          } else {
            // non-ok -> ignore
          }
        } catch (e) {
          // ignore
        }
      }
    } catch (e) {
      console.warn("WelcomePage: resolveUserUsingSdkOrToken failed:", e);
    }
    return null;
  }

  // Poll for profile existence (best-effort). Returns profile row or null
  async function waitForProfile(userId, maxAttempts = 12, intervalMs = 700) {
    if (!userId) return null;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("id, full_name, email, contact, role, stream, year_of_study, access_key")
          .eq("id", userId)
          .maybeSingle();

        if (!error && profile && profile.id) {
          return profile;
        }
      } catch (e) {
        // ignore and retry
      }
      await sleep(intervalMs);
    }
    return null;
  }

  useEffect(() => {
    mountedRef.current = true;

    async function init() {
      setStatus("pending");
      setMessage("");
      setReady(false);

      try {
        // 1) Attempt to let SDK parse session from URL
        let tokenObj = parseAccessTokenFromUrl();
        let sdkSessionSet = false;
        try {
          if (supabase?.auth?.getSessionFromUrl) {
            // getSessionFromUrl will parse tokens from fragment and store session in client if possible
            const got = await supabase.auth.getSessionFromUrl({ storeSession: true }).catch(() => ({}));
            // check if it yielded a session
            const maybeSession = got?.data?.session ?? got?.session ?? got?.data ?? null;
            if (maybeSession && maybeSession.access_token) {
              sdkSessionSet = true;
              tokenObj = tokenObj || { access_token: maybeSession.access_token, refresh_token: maybeSession.refresh_token || null };
            }
          }
        } catch (e) {
          // ignore
        }

        // 2) If SDK didn't persist session, try setting it manually from token found in URL
        if (!sdkSessionSet && tokenObj) {
          try {
            const ok = await trySetSessionFromToken(tokenObj);
            if (ok) {
              sdkSessionSet = true;
            }
          } catch (e) {
            // ignore
          }
        }

        // 3) Resolve user via SDK or token
        const resolvedUser = await resolveUserUsingSdkOrToken(tokenObj);
        if (!resolvedUser) {
          setStatus("failed");
          setMessage("Unable to verify your request! The confirmation link may be expired or invalid");
          clearTokenFromUrl();
          return;
        }

        // ensure role
        const resolvedRole = resolvedUser.user_metadata?.role || resolvedUser.role || "student";

        // 4) If SDK session not present, set session again (best-effort) to ensure client has access
        if (!sdkSessionSet && tokenObj) {
          try {
            await trySetSessionFromToken(tokenObj);
            sdkSessionSet = true;
          } catch (e) {
            // ignore
          }
        }

        // 5) Wait/poll for profile row to exist (so dashboard can read immediately)
        const profile = await waitForProfile(resolvedUser.id, 12, 700);
        if (!profile) {
          console.warn("WelcomePage: profile not found after waiting; dashboard may need to fetch later");
        }

        // 6) Persist one-time marker
        try {
          localStorage.setItem("qn_welcome_shown", JSON.stringify({ userId: resolvedUser.id, role: resolvedRole, ts: Date.now() }));
        } catch (e) {}

        if (!mountedRef.current) return;
        setUser(resolvedUser);
        setRole(resolvedRole);
        setStatus("success");
        setMessage("You're All Set Now! Use the button below to navigate to your dashboard");

        // mark ready only if sdkSessionSet and profile exists (profile can be null)
        setReady(Boolean(sdkSessionSet && profile && profile.id));
        // if profile missing but sdkSessionSet, keep preparing text and allow retry from button
        if (!sdkSessionSet) {
          setPreparingText("Finalizing Your Session, Please Wait...");
        } else if (!profile) {
          setPreparingText("Finishing setup for your dashboard...");
        }

        // cleanup URL tokens
        clearTokenFromUrl();
      } catch (err) {
        console.error("WelcomePage init error:", err);
        if (!mountedRef.current) return;
        setStatus("failed");
        setMessage("Unable to verify the confirmation link! Please try again or contact support");
        clearTokenFromUrl();
      }
    }

    init();

    return () => {
      mountedRef.current = false;
    };
  }, []);

  // When user clicks Go To Dashboard: ensure session + profile available before navigating
  const handleGoToDashboard = async () => {
    try {
      // 1) if already ready - navigate
      if (ready && user && user.id) {
        try { localStorage.setItem("qn_welcome_shown", JSON.stringify({ userId: user.id, role: role || "student", ts: Date.now() })); } catch (e) {}
        const route = role === "admin" ? "/Admin/Dashboard" : "/User/Dashboard";
        window.location.replace(route);
        return;
      }

      setStatus("pending");
      setPreparingText("Finalizing Your Profile, Please Wait...");

      // 2) try to ensure SDK session exists
      const tokenObj = parseAccessTokenFromUrl();
      let sdkSession = await getSdkSession();
      if (!sdkSession && tokenObj) {
        await trySetSessionFromToken(tokenObj);
        // small delay to let SDK persist
        await sleep(400);
        sdkSession = await getSdkSession();
      }

      // 3) attempt to resolve user again
      const resolvedUser = await resolveUserUsingSdkOrToken(tokenObj);
      if (!resolvedUser) {
        setStatus("failed");
        setMessage("Unable To Establish Session! Try Signing In");
        return;
      }

      // 4) Poll again for profile (give a slightly longer window on button click)
      const profile = await waitForProfile(resolvedUser.id, 15, 700);
      if (!profile) {
        // not found; still navigate but warn that user may need to refresh or sign in
        console.warn("WelcomePage: profile still not found after final wait");
        setStatus("success");
        setReady(false);
        setMessage("Account verified but profile setup is still in progress! If the dashboard looks incomplete, try signing in");
        // Still attempt to navigate (so user can continue)
        try { localStorage.setItem("qn_welcome_shown", JSON.stringify({ userId: resolvedUser.id, role: role || "student", ts: Date.now() })); } catch (e) {}
        const route = (role === "admin") ? "/Admin/Dashboard" : "/User/Dashboard";
        window.location.replace(route);
        return;
      }

      // 5) success: profile exists and session likely present
      try { localStorage.setItem("qn_welcome_shown", JSON.stringify({ userId: resolvedUser.id, role: role || "student", ts: Date.now() })); } catch (e) {}
      setStatus("success");
      setReady(true);
      const route = (role === "admin") ? "/Admin/Dashboard" : "/User/Dashboard";
      window.location.replace(route);
    } catch (err) {
      console.error("WelcomePage goToDashboard error:", err);
      setStatus("failed");
      setMessage("Failed to proceed to dashboard! You can sign in from the home page");
    }
  };

  const handleRetry = () => {
    try {
      window.location.reload();
    } catch (e) {
      navigate("/SignIn", { replace: true });
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
            <img src={status === "success" ? SUCCESS_IMG : FAIL_IMG} alt={status === "success" ? "Success" : "Failed"} className={styles.heroImage} />
          </div>

          <div className={styles.messageBox}>
            {status === "pending" && <p className={styles.hint}>{preparingText}</p>}

            {status === "success" && (
              <>
                <p className={styles.lead}>Congratulations — Account Verification Successful</p>
                <p className={styles.sub}>{message}</p>
                {!ready && (
                  <p className={styles.hint} style={{ marginTop: "0.6rem", opacity: 0.9 }}>
                    Finalizing setup for your dashboard... If this takes long time, try clicking the button below once or opt for sign in
                  </p>
                )}
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
              <button
                className={`${styles.btn} ${styles.primary}`}
                onClick={handleGoToDashboard}
                disabled={!ready && status === "success" && !user}
                aria-disabled={!ready && status === "success" && !user}
              >
                {ready ? "Go To Dashboard" : "Prepare Dashboard"}
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