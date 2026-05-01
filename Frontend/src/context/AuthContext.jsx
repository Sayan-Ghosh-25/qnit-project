// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const AuthContext = createContext();
const FIRSTNAME_KEY = "user_firstname";

async function getAccessTokenFromSupabase() {
  try {
    if (supabase?.auth?.getSession) {
      const { data } = await supabase.auth.getSession();
      return data?.session?.access_token || null;
    }
    // backward compatibility
    if (typeof supabase.auth?.session === "function") {
      const s = supabase.auth.session();
      return s?.access_token || s?.accessToken || null;
    }
    return null;
  } catch (err) {
    console.warn("getAccessTokenFromSupabase:", err);
    return null;
  }
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

  // fetch first name from backend endpoint /user/me/firstname
  async function fetchFirstNameFromBackend(token) {
    if (!token) return null;
    try {
      const url = `${API_BASE}/user/me/firstname`;
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
      if (!res.ok) {
        // non-fatal
        return null;
      }
      const payload = await res.json();
      return payload?.firstName || null;
    } catch (err) {
      console.warn("fetchFirstNameFromBackend failed:", err);
      return null;
    }
  }

  // Helper: update user state with new firstname and persist cache
  function applyFirstNameToUser(firstName) {
    if (!firstName) return;
    try {
      localStorage.setItem(FIRSTNAME_KEY, firstName);
    } catch (err) {
      // ignore localStorage issues
    }
    setUser((prev) => {
      if (!prev) return prev;
      return { ...prev, firstname: firstName };
    });
  }

  // Try to refresh first name (background)
  async function refreshFirstNameForCurrentUser(currentUser) {
    const token = await getAccessTokenFromSupabase();
    if (!token || !currentUser) return;
    const fn = await fetchFirstNameFromBackend(token);
    if (fn) applyFirstNameToUser(fn);
  }

  // Initialize session on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: { session } = {} } = await supabase.auth.getSession();
        const currentUser = session?.user ?? null;

        // Read cached first name (fast path)
        let cachedFirst = null;
        try {
          cachedFirst = localStorage.getItem(FIRSTNAME_KEY);
        } catch (err) {
          cachedFirst = null;
        }

        if (currentUser) {
          // attach cached first name if available (instant)
          const quickUser = {
            ...currentUser,
            firstname: cachedFirst || undefined,
          };
          if (mounted) setUser(quickUser);

          // then refresh with backend (async)
          refreshFirstNameForCurrentUser(currentUser).catch((e) => {
            /* ignore */
          });
        } else {
          if (mounted) setUser(null);
        }
      } catch (err) {
        console.error("AuthProvider init error:", err);
        if (mounted) setUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    // listen for auth state changes
    const { data: { subscription } = {} } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const currentUser = session?.user ?? null;

        // apply cached first name immediately if present
        let cachedFirst = null;
        try {
          cachedFirst = localStorage.getItem(FIRSTNAME_KEY);
        } catch (err) {
          cachedFirst = null;
        }

        if (currentUser) {
          setUser({ ...currentUser, firstname: cachedFirst || undefined });
          // refresh backend value
          refreshFirstNameForCurrentUser(currentUser).catch(() => {});
        } else {
          // logged out
          setUser(null);
          try {
            // remove cached firstname on sign-out
            localStorage.removeItem(FIRSTNAME_KEY);
          } catch (err) {}
        }
      }
    );

    return () => {
      subscription?.unsubscribe?.();
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Login: set user immediately with cached firstname, then fetch fresh one
  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const signedUser = data.user;
    // apply cached first name quickly
    let cachedFirst = null;
    try {
      cachedFirst = localStorage.getItem(FIRSTNAME_KEY);
    } catch (err) {
      cachedFirst = null;
    }

    const quickUser = { ...signedUser, firstname: cachedFirst || undefined };
    setUser(quickUser);

    // refresh from backend
    refreshFirstNameForCurrentUser(signedUser).catch(() => {});

    return quickUser;
  };

  // Signup
  const signup = async (email, password, role = "user") => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { role },
      },
    });
    if (error) throw error;
    return data.user;
  };

  // Logout
  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    localStorage.removeItem(FIRSTNAME_KEY);
  };

  // Expose a manual refresh helper (in case other parts of app want to force update)
  const refreshFirstName = async () => {
    const token = await getAccessTokenFromSupabase();
    if (!token || !user) return null;
    const fn = await fetchFirstNameFromBackend(token);
    if (fn) applyFirstNameToUser(fn);
    return fn;
  };

  return (
    <AuthContext.Provider value={{ user, setUser, login, logout, signup, loading, refreshFirstName }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);