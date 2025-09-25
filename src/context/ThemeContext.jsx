// src/context/ThemeContext.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

const ThemeContext = createContext({
  lightMode: false,
  toggle: () => {},
});

/* getInitialTheme - Safe client-only read of localStorage */
function getInitialTheme() {
  try {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("lightMode") === "true";
  } catch (e) {
    return false;
  }
}

export function ThemeProvider({ children }) {
  const [lightMode, setLightMode] = useState(() => getInitialTheme());
  const location = useLocation();

  useEffect(() => {
    if (typeof document === "undefined") return;

    const isDashboard = location.pathname.startsWith("/User") || location.pathname.startsWith("/Admin");

    if (isDashboard && lightMode) {
      document.body.classList.add("light-theme");
    } else {
      document.body.classList.remove("light-theme");
    }

    try {
      localStorage.setItem("lightMode", lightMode ? "true" : "false");
    } catch (e) {}
  }, [lightMode, location.pathname]);

  const toggle = () => setLightMode((v) => !v);

  const value = useMemo(() => ({ lightMode, toggle }), [lightMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

export { ThemeContext };
export default ThemeContext;