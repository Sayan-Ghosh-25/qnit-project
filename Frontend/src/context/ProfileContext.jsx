// src/context/ProfileContext.jsx
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const ProfileContext = createContext(null);
const FIRSTNAME_KEY = "user_firstname";
const DEFAULT_PROFILE = {
  full_name: "",
  stream: "",
  year_of_study: "",
  semester: "",
  email: "",
  contact: "",
  dob: "",
};

async function getAccessToken() {
  try {
    if (supabase?.auth?.getSession) {
      const { data } = await supabase.auth.getSession();
      return data?.session?.access_token || null;
    }
    if (typeof supabase.auth?.session === "function") {
      const s = supabase.auth.session();
      return s?.access_token || s?.accessToken || null;
    }
    return null;
  } catch (err) {
    console.warn("getAccessToken failed:", err);
    return null;
  }
}

export function ProfileProvider({ children }) {
  // Try to seed full_name from local cache to avoid flicker
  let cachedFirst = "";
  try {
    cachedFirst = localStorage.getItem(FIRSTNAME_KEY) || "";
  } catch (err) {
    cachedFirst = "";
  }

  const [profile, setProfile] = useState({
    ...DEFAULT_PROFILE,
    full_name: cachedFirst || DEFAULT_PROFILE.full_name,
  });
  const [loading, setLoading] = useState(true);

  const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

  async function fetchProfile() {
    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        setProfile(DEFAULT_PROFILE);
        setLoading(false);
        return;
      }

      const res = await fetch(`${API_BASE}/user/me/profile`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });

      if (!res.ok) {
        setProfile(DEFAULT_PROFILE);
        setLoading(false);
        return;
      }

      const payload = await res.json();
      const p = payload?.profile || {};

      const normalized = {
        full_name: p.full_name || "",
        stream: p.stream || "",
        year_of_study: p.year_of_study || "",
        semester: p.semester || "",
        email: p.email || "",
        contact: p.contact || "",
        dob: p.dob || "",
      };

      setProfile(normalized);

      // persist a canonical first name to localStorage so AuthContext can show instantly next time
      try {
        const first = (normalized.full_name || normalized.email || "")
          .toString()
          .trim()
          .split(/\s+/)[0] || "";
        if (first) localStorage.setItem(FIRSTNAME_KEY, first);
      } catch (err) {
        // ignore localStorage errors
      }
    } catch (err) {
      console.error("fetchProfile error:", err);
      setProfile(DEFAULT_PROFILE);
    } finally {
      setLoading(false);
    }
  }

  // On mount, fetch profile and also re-fetch when auth state changes
  useEffect(() => {
    let mounted = true;

    fetchProfile();

    // subscribe to auth state changes so profile refreshes on login/logout
    const { data: { subscription } = {} } = supabase.auth.onAuthStateChange((_event, _session) => {
      if (!mounted) return;
      // call fetchProfile but don't await
      fetchProfile().catch(() => {});
    });

    return () => {
      subscription?.unsubscribe?.();
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ProfileContext.Provider
      value={{
        profile,
        setProfile,
        loading,
        refreshProfile: fetchProfile,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within ProfileProvider");
  return ctx;
}
