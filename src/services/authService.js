// src/services/authService.js
import { supabaseAdmin } from "../config/supabaseClient.js";

export const signInUser = async (email, password) => {
  const trimmedEmail = email?.trim().toLowerCase();
  if (!trimmedEmail || !password) {
    throw new Error("Email and password are required");
  }

  const { data, error } = await supabaseAdmin.auth.signInWithPassword({
    email: trimmedEmail,
    password,
  });

  if (error) {
    console.warn(`Failed login attempt for ${trimmedEmail}:`, error.message);
    throw new Error(error.message || "Invalid credentials");
  }

  return data.user;
};
