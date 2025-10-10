// src/pages/Admin/AdminDashboard.jsx
import { useCallback, useEffect, useRef, useState, Suspense, lazy } from "react";
import { useNavigate, Routes, Route, NavLink as RouterNavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import styles from "./AdminDashboard.module.css";
import { useProfile } from "@/context/ProfileContext";

/* -----------------------
   Lazy loaded section components
   ----------------------- */
const ProfileSection = lazy(() => import("@/common/ProfileSection.jsx"));
const ManageUsers = lazy(() => import("./components/ManageUsers.jsx"));
const UploadSection = lazy(() => import("./components/UploadSection.jsx"));
const UserFeedbacks = lazy(() => import("./components/UserFeedbacks.jsx"));
const SettingsSection = lazy(() => import("@/common/SettingsSection.jsx"));

/* Helper to compose class names in a safe way */
function cx(...names) {
  return names
    .filter(Boolean)
    .map((n) => (styles && styles[n] ? styles[n] : n))
    .join(" ");
}

/* Small presentational fallback used within Suspense while a section loads */
function SpinnerOverlay({ visible = true }) {
  if (!visible) return null;
  return (
    <div
      id="loading-spinner"
      className={cx("loading-spinner", visible ? "show" : "")}
      aria-hidden={!visible}
      style={{ zIndex: 9999 }}
    >
      <div className={cx("spinner")} />
    </div>
  );
}

/* Fallback for unknown routes within the dashboard */
function NotFoundSection() {
  return (
    <div style={{ padding: 24, color: "#fff", textAlign: "center" }}>
      <h3>404 - Dashboard Section Not Found</h3>
      <p>The requested dashboard section does not exist</p>
    </div>
  );
}

/* -----------------------------
   Dashboard Home Content
   ----------------------------- */
function DashboardHomeContent({ greetingText, openLearnMore, handleNavClick }) {
  return (
    <div className={cx("main-body")} id="dashboardHome">
      <div className={cx("main-content")}>
        <div className={cx("image-text-section")}>
          <img src="/Welcome.svg" alt="Welcome Image" />
          <div className={cx("text")}>
            <h2>{greetingText}</h2>
            <p>
              Turn Stress Into Your Strength! All You Need Just A Little Bit
              Motivation...
              <br />
              Let's Power Up Your Day With The Perfect Motivational Quote:
            </p>
            <div className={cx("intro-buttons")}>
              <a href="#" id="learnMoreBtn" data-modal="learnMoreModal" onClick={openLearnMore}>
                What's New
              </a>
            </div>
          </div>
        </div>

        <p className={cx("text-muted")}>
          <i className="far fa-copyright" style={{ marginRight: "0.15rem" }}></i>{" "}
          {new Date().getFullYear()} QNIT. All Rights Reserved.
          <br />
          <span className={cx("divider")}>
            <i className="fas fa-lock" style={{ marginRight: "0.15rem" }}></i> Secured Data
          </span>
          <i className="fas fa-wrench" style={{ marginRight: "0.15rem" }}></i> Made in India <br />
          <i className="fas fa-envelope" style={{ marginRight: "0.15rem" }}></i> Contact - devtruster@gmail.com
        </p>
      </div>
    </div>
  );
}

/* -----------------------------
   Dashboard main export
   ----------------------------- */
export default function AdminDashboard() {
  // Refs
  const navRef = useRef(null);
  const inactivityTimerRef = useRef(null);
  const homeTogglerRef = useRef(null);
  const spinnerTimerRef = useRef(null);
  const spinnerShownAtRef = useRef(0);

  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();
  const { profile } = useProfile();

  // UI state
  const [spinnerVisible, setSpinnerVisible] = useState(false);
  const [showLearnMore, setShowLearnMore] = useState(false);
  const [greetingText, setGreetingText] = useState("");
  const [togglerVisible, setTogglerVisible] = useState(false);
  const [hideNavbar, setHideNavbar] = useState(false);
  const [userFirstName, setUserFirstName] = useState("");

  // Determine if current path is the dashboard home
  const isHome =
    location.pathname === "/Admin/Dashboard" ||
    location.pathname === "/Admin/Dashboard/";

  /* -----------------------
     Compute greeting (uses fetched userFirstName)
     ----------------------- */
  useEffect(() => {
    const hour = new Date().getHours();
    let greeting = "Hello";
    if (hour >= 5 && hour < 12) greeting = "Good Morning";
    else if (hour >= 12 && hour < 17) greeting = "Good Afternoon";
    else if (hour >= 17 && hour <= 23) greeting = "Good Evening";

    let namePart = "User";
    if (userFirstName) {
      namePart = userFirstName;
    } else if (profile?.full_name) {
      namePart = profile.full_name.toString().trim().split(/\s+/)[0] || "User";
    } else if (auth?.user?.email) {
      namePart = (auth.user.email || "").split("@")[0] || "User";
    }
    setGreetingText(`${greeting} ${namePart}`);
  }, [profile?.full_name, auth?.user?.email, userFirstName]);

  /* -----------------------
     Load user first name from Database / Profiles
     ----------------------- */
  useEffect(() => {
    let cancelled = false;

    async function fetchFirstNameViaBackend() {
      try {
        let token = null;
        if (supabase?.auth?.getSession) {
          try {
            const { data: sessionData } = await supabase.auth.getSession();
            token = sessionData?.session?.access_token || null;
          } catch (e) {
            // ignore and fallback
          }
        }

        if (!token && auth?.session?.access_token) {
          token = auth.session.access_token;
        }

        if (!token) {
          if (!cancelled) setUserFirstName("");
          return;
        }

        const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
        const url = `${API_BASE}/user/me/firstname`;

        const res = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        });

        if (!res.ok) {
          console.warn("Could not fetch first name from backend:", res.status);
          if (!cancelled) setUserFirstName("");
          return;
        }

        const payload = await res.json();
        if (!cancelled) setUserFirstName(payload?.firstName || "");
      } catch (err) {
        console.error("Error fetching first name via backend:", err);
        if (!cancelled) setUserFirstName("");
      }
    }

    fetchFirstNameViaBackend();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.user?.id, auth?.user?.email]);

  // Ensure spinner is hidden on mount
  useEffect(() => {
    setSpinnerVisible(false);
  }, []);

  /* -----------------------
     Loading Spinner Helpers
     ----------------------- */
  const MIN_SPINNER_MS = 220;

  const showSpinner = useCallback(() => {
    if (spinnerTimerRef.current) {
      clearTimeout(spinnerTimerRef.current);
      spinnerTimerRef.current = null;
    }
    spinnerShownAtRef.current = Date.now();
    setSpinnerVisible(true);
  }, []);

  const hideSpinnerRespectingMinTime = useCallback(() => {
    const shownAt = spinnerShownAtRef.current || 0;
    const elapsed = Date.now() - shownAt;
    const remaining = Math.max(0, MIN_SPINNER_MS - elapsed);
    if (spinnerTimerRef.current) clearTimeout(spinnerTimerRef.current);
    spinnerTimerRef.current = setTimeout(() => {
      spinnerTimerRef.current = null;
      setSpinnerVisible(false);
      spinnerShownAtRef.current = 0;
    }, remaining);
  }, []);

  // hide spinner when route changes
  useEffect(() => {
    hideSpinnerRespectingMinTime();
    return () => {
      if (spinnerTimerRef.current) {
        clearTimeout(spinnerTimerRef.current);
        spinnerTimerRef.current = null;
      }
    };
  }, [location.pathname, hideSpinnerRespectingMinTime]);

  /* -----------------------
     Navigation click handler
     ----------------------- */
  const handleNavClick = useCallback(
    (e, sectionPath) => {
      e?.preventDefault?.();
      const targetPath = `/Admin/Dashboard/${sectionPath}`;
      if (location.pathname === targetPath) return;
      showSpinner();
      navigate(targetPath);
    },
    [navigate, location.pathname, showSpinner]
  );

  /* -----------------------
     Home toggler click
     ----------------------- */
  const handleHomeClick = useCallback(() => {
    showSpinner();
    navigate("/Admin/Dashboard");
    setShowLearnMore(false);
  }, [navigate, showSpinner]);

  /* -----------------------
  Sidebar collapse / Logo click behavior
  ----------------------- */
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      const collapseRangeMql = window.matchMedia("(min-width: 30.0625rem) and (max-width: 48rem)");
      return !!collapseRangeMql.matches;
    }
    return false;
  });
  const lastScrollRef = useRef(typeof window !== "undefined" ? window.scrollY : 0);
  const mqlMobileRef = useRef(null);

  /* ---------- Collapse / Responsive Behavior ---------- */
  useEffect(() => {
    const navOuter = navRef.current;
    if (!navOuter) return;

    const collapseRangeMql = window.matchMedia("(min-width: 30.0625rem) and (max-width: 48rem)");
    const mobileMql = window.matchMedia("(max-width: 30rem)");
    mqlMobileRef.current = mobileMql;

    const applyState = () => {
      if (mobileMql.matches) {
        setCollapsed(false);
      } else if (collapseRangeMql.matches) {
        setCollapsed(true);
      } else {
        setCollapsed(false);
      }
    };

    applyState();

    const mqHandler = () => applyState();
    collapseRangeMql.addEventListener("change", mqHandler);
    mobileMql.addEventListener("change", mqHandler);

    // logo click should toggle collapsed only on non-mobile
    const logoEl = document.getElementById("logoImg");
    const logoClickHandler = () => {
      if (mobileMql.matches) return;
      setCollapsed((s) => !s);
    };
    if (logoEl) logoEl.addEventListener("click", logoClickHandler);

    return () => {
      collapseRangeMql.removeEventListener("change", mqHandler);
      mobileMql.removeEventListener("change", mqHandler);
      if (logoEl) logoEl.removeEventListener("click", logoClickHandler);
    };
  }, []);

  /* -----------------------
    Navbar auto-hide while scrolling down
    ----------------------- */
  useEffect(() => {
    const mobileMql = window.matchMedia("(max-width: 30rem)");
    mqlMobileRef.current = mobileMql;

    let rafId = null;

    const onScroll = () => {
      if (!mobileMql.matches) return;

      const current = window.scrollY;
      const last = lastScrollRef.current;

      if (Math.abs(current - last) < 12) return;

      if (current > last && current > 80) {
        setHideNavbar((prev) => (prev ? prev : true));
      } else {
        setHideNavbar((prev) => (prev ? false : prev));
      }
      lastScrollRef.current = current;
    };

    const handler = () => {
      if (rafId === null) {
        rafId = window.requestAnimationFrame(() => {
          onScroll();
          rafId = null;
        });
      }
    };

    window.addEventListener("scroll", handler, { passive: true });
    return () => {
      window.removeEventListener("scroll", handler);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  /* -----------------------
     Global key handler for Escape (close modals)
     ----------------------- */
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") {
        if (showLearnMore) setShowLearnMore(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showLearnMore]);

  /* -----------------------
     Toggler auto-hide / inactivity detection
     ----------------------- */
  useEffect(() => {
    if (isHome) {
      setTogglerVisible(false);
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      return;
    }

    setTogglerVisible(true);

    const startInactivityTimer = () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = setTimeout(() => {
        setTogglerVisible(false);
        inactivityTimerRef.current = null;
      }, 3000);
    };

    startInactivityTimer();

    const activityHandler = () => {
      setTogglerVisible(true);
      startInactivityTimer();
    };

    const events = ["mousemove", "keydown", "scroll", "touchstart", "click"];
    events.forEach((ev) => document.addEventListener(ev, activityHandler, { passive: true }));

    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      events.forEach((ev) => document.removeEventListener(ev, activityHandler));
    };
  }, [isHome]);

  /* -----------------------
     Helper: show/hide LearnMore modal
     ----------------------- */
  const openLearnMore = useCallback((e) => {
    e?.preventDefault?.();
    setShowLearnMore(true);
  }, []);

  /* -----------------------
     NavLink Wrapperr
     ----------------------- */
  const NavLink = ({ to, label, iconClass }) => {
    return (
      <li>
        <RouterNavLink
          to={to}
          className={({ isActive }) => (isActive ? cx("active") : "")}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            if (location.pathname === to) return;
            showSpinner();
            navigate(to);
          }}
        >
          <i className={iconClass} aria-hidden="true" />
          <span className={cx("nav-item")}>{label}</span>
        </RouterNavLink>
      </li>
    );
  };

  const stateClass = isHome ? "home-hidden" : togglerVisible ? "visible" : "hidden";
  const activeClass = togglerVisible ? "toggler-active" : "";
  const homeTogglerClassName = cx("home-toggler", stateClass, activeClass);

  /* -----------------------
     Render Dashboard JSX
     ----------------------- */
  return (
    <div className={cx("container")}>
      {/* Sidebar / Navigation */}
      <nav
        aria-label="Main navigation"
        className={cx("nav", collapsed && "collapsed", hideNavbar && "hide-navbar")}
        id="nav"
        ref={navRef}
      >
        <div className={cx("navbar")}>
          <div className={cx("logo")} id="logoImg">
            <img src="/Menu.png" alt="Menu" />
            <h1>MENU</h1>
          </div>
          <ul className={cx("nav-links")}>
            <NavLink to="/Admin/Dashboard/ProfileSection" label="Profile" iconClass="fas fa-user" />
            <NavLink to="/Admin/Dashboard/ManageUsers" label="Tracking" iconClass="fas fa-search" />
            <NavLink to="/Admin/Dashboard/UploadSection" label="Uploads" iconClass="fas fa-upload" />
            <NavLink to="/Admin/Dashboard/UserFeedbacks" label="Feedbacks" iconClass="fas fa-comment" />
            <NavLink to="/Admin/Dashboard/SettingsSection" label="Settings" iconClass="fas fa-cog" />
          </ul>
        </div>
      </nav>

      {/* Main area */}
      <main className={cx("main")} id="main-content">
        <div className={cx("main-top")}>
          <p>ADMIN DASHBOARD</p>
        </div>

        {/* Dynamic Section Loading Area (lazy loaded React components controlled by React Router) */}
        <div className={cx("content-area")} id="content-area">
          {/* Manual spinner (shows immediately on click) */}
          {spinnerVisible && <SpinnerOverlay visible={true} />}

          {/* Suspense fallback (shows when React suspends while loading a lazy import) */}
          <Suspense fallback={<SpinnerOverlay visible={true} />}>
            <Routes>
              {/* Dashboard Home Route */}
              <Route
                index
                element={<DashboardHomeContent greetingText={greetingText} openLearnMore={openLearnMore} handleNavClick={handleNavClick} />}
              />
              {/* Individual Dashboard Sections */}
              <Route path="ProfileSection" element={<ProfileSection />} />
              <Route path="ManageUsers" element={<ManageUsers />} />
              <Route path="UploadSection" element={<UploadSection />} />
              <Route path="UserFeedbacks" element={<UserFeedbacks />} />
              <Route path="SettingsSection/*" element={<SettingsSection />} />

              {/* Catch-all for unknown dashboard routes */}
              <Route path="*" element={<NotFoundSection />} />
            </Routes>
          </Suspense>
        </div>

        {/* Home toggler (hidden on 'home' and auto-hidden by inactivity) */}
        <button id="homeToggler" aria-label="Go to Home" className={homeTogglerClassName} onClick={handleHomeClick} ref={homeTogglerRef} title="Return Home">
          <i className="fas fa-home" style={{ fontSize: "1.25rem", color: "#fff" }}></i>
        </button>
      </main>

      {/* Learn More modal (React controlled) */}
      <div id="learnMoreModal" className={cx("learnMoreModal", showLearnMore && "show")} role="dialog" aria-modal="true" aria-labelledby="learnMoreModalTitle" onClick={() => setShowLearnMore(false)}>
        <div className={cx("modal-content")} onClick={(e) => e.stopPropagation()}>
          <button id="closeLearnMoreModal" data-close aria-label="Close" onClick={() => setShowLearnMore(false)}>&times;</button>
          <h2 id="learnMoreModalTitle">New in the System</h2>
          <ul>
            <li>
              <strong>New Uploads:</strong>
              <br />- 5th Semester's Previous Year Questions <br />- 5th Semester's Syllabus <br />- 5th Semester's Lab Cover Pages
            </li>
            <li>
              <br />
            </li>
            <li>
              <strong>System:</strong>
              <br />- Fixed Some Known Issues <br />- Improved Overall Performance
            </li>
          </ul>
        </div>
      </div>

      {/* Global manual spinner (keeps parity with previous placement) */}
      {spinnerVisible && <SpinnerOverlay visible={spinnerVisible} />}
    </div>
  );
}