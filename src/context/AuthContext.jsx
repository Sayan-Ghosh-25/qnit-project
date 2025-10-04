// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const AuthContext = createContext();
const API_BASE = import.meta.env.VITE_API_BASE_URL;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      setLoading(false);
    };

    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Login
  const login = async (email, password, captchaToken) => {
    const response = await fetch(`${API_BASE}/api/auth/signin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password, captchaToken }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Login failed through custom backend');
    }

    // After successful custom backend login, Supabase session should be established
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      setUser(authData.user);
      return authData.user;
    } else {
      setUser(session.user);
      return session.user;
    }
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
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, signup, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);