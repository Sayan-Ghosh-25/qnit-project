// src/services/authService.js
import { supabase } from "../config/supabaseClient.js";

export const signInUser = async (email, password, expectedRole = null) => {
  const trimmedEmail = email?.trim().toLowerCase();
  if (!trimmedEmail || !password) {
    throw new Error("Email and password are required");
  }

  // Authenticate with Supabase
  const { data, error } = await supabase.auth.signInWithPassword({
    email: trimmedEmail,
    password,
  });

  if (error || !data?.user) {
    console.warn(`Failed login attempt for ${trimmedEmail}:`, error?.message || error);
    throw new Error("Invalid email or password");
  }

  const user = data.user;
  let actualRole =
    (user.user_metadata && user.user_metadata.role) ||
    (user.app_metadata && user.app_metadata.role) ||
    null;

  // If role not present in metadata, try profiles table (server-side)
  if (!actualRole) {
    try {
      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (!pErr && profile && profile.role) {
        actualRole = profile.role;
      }
    } catch (e) {
      console.warn("signInUser: profiles lookup failed:", e);
    }
  }

  // If expectedRole provided, compare case-insensitively
  if (expectedRole) {
    const expectedNormalized = String(expectedRole).trim().toLowerCase();
    const actualNormalized = (actualRole || "").toString().trim().toLowerCase();

    if (!actualNormalized || actualNormalized !== expectedNormalized) {
      console.warn(
        `Role mismatch for ${trimmedEmail}: expected=${expectedNormalized} actual=${actualNormalized || "unknown"}`
      );

      try {
        if (supabase.auth && typeof supabase.auth.signOut === "function") {
          await supabase.auth.signOut().catch(() => {});
        }
      } catch (e) {
        // ignore signOut errors
      }
      throw new Error("Invalid email or password");
    }
  }

  return user;
};
