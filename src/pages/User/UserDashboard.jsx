// src/pages/UserDashboard.jsx
import { useCallback, useEffect, useRef, useState, Suspense, lazy } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { supabase } from "@/lib/supabaseClient";
import styles from "./UserDashboard.module.css";
import TrendingNews from "./components/TrendingNews";
import MindGame from "./components/MindGame";

/* -----------------------
   Static import helper map
   ----------------------- */
const importers = {
  ProfileSection: () => import("@/common/ProfileSection.jsx"),
  QuestionSection: () => import("./components/QuestionSection.jsx"),
  SyllabusSection: () => import("./components/SyllabusSection.jsx"),
  OthersSection: () => import("./components/OthersSection.jsx"),
  SettingsSection: () => import("@/common/SettingsSection.jsx"),
  FeedbackSection: () => import("@/common/FeedbackSection.jsx"),
};

/* Lazy components created from the importers map */
const Sections = {
  ProfileSection: lazy(() => importers.ProfileSection()),
  QuestionSection: lazy(() => importers.QuestionSection()),
  SyllabusSection: lazy(() => importers.SyllabusSection()),
  OthersSection: lazy(() => importers.OthersSection()),
  SettingsSection: lazy(() => importers.SettingsSection()),
  FeedbackSection: lazy(() => importers.FeedbackSection()),
};

/* Keep logout & overlays as separate lazies (they are not part of the main Sections map) */
const LogoutModalComponent = lazy(() => import("@/common/LogoutModal.jsx"));
const OverlayComponents = {
  ChangePassword: lazy(() => import("@/common/ChangePassword.jsx")),
};

/* Helper to compose class names in a safe way (keeps existing behavior) */
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
      className={cx("loading-spinner", { show: visible })}
      aria-hidden={!visible}
    >
      <div className={cx("spinner")} />
    </div>
  );
}

/* Fallback when a named section doesn't exist as a component */
function NotFoundSection({ name }) {
  return (
    <div style={{ padding: 24, color: "#fff" }}>
      <h3>Section not found</h3>
      <p>
        No component found for <strong>{name}</strong>. Create <code>{name}.jsx</code> in{" "}
        <code>src/components</code>.
      </p>
    </div>
  );
}

/* -----------------------------
   Dashboard main export
   ----------------------------- */
export default function UserDashboard() {
  // Refs
  const contentAreaRef = useRef(null); // where lazy sections render
  const mainBodyRef = useRef(null); // the home body area
  const navRef = useRef(null); // sidebar nav
  const inactivityTimerRef = useRef(null);
  const homeTogglerRef = useRef(null);

  const navigate = useNavigate();
  const auth = useAuth();
  const { logout } = auth || {};

  // UI state
  const [spinnerVisible, setSpinnerVisible] = useState(false);
  const [activeSection, setActiveSection] = useState("home");
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const openLogoutModal = useCallback(() => setShowLogoutModal(true), []);
  const [showLearnMore, setShowLearnMore] = useState(false);
  const [quoteText, setQuoteText] = useState(""); // motivational quote
  const [greetingText, setGreetingText] = useState("");
  const [togglerVisible, setTogglerVisible] = useState(false);
  const { lightMode } = useTheme();
  const [overlay, setOverlay] = useState(null);
  const [overlayProps, setOverlayProps] = useState({});
  const [hideNavbar, setHideNavbar] = useState(false);
  const [lastScroll, setLastScroll] = useState(0);

  // New: store resolved user first name
  const [userFirstName, setUserFirstName] = useState("");

  /* -----------------------
     Compute greeting (uses fetched userFirstName)
     ----------------------- */
  useEffect(() => {
    const hour = new Date().getHours();
    let greeting = "Hello";
    if (hour >= 5 && hour < 12) greeting = "Good Morning";
    else if (hour >= 12 && hour < 17) greeting = "Good Afternoon";
    else if (hour >= 17 && hour <= 23) greeting = "Good Evening";

    const namePart = userFirstName ? userFirstName : "User";
    setGreetingText(`${greeting} ${namePart}`);
  }, [userFirstName]);

  /* -----------------------
     Load user first name from Supabase / profiles
     ----------------------- */
  useEffect(() => {
    let cancelled = false;

    async function loadUserFirstName() {
      try {
        let user = auth?.user || null;

        // If not present, try supabase client methods (v2 or older fallbacks)
        if (!user) {
          if (typeof supabase.auth?.getUser === "function") {
            try {
              const result = await supabase.auth.getUser();
              user = result?.data?.user || null;
            } catch (e) {
              // ignore and continue to other fallbacks
            }
          }

          // older clients sometimes expose supabase.auth.user()
          if (!user && typeof supabase.auth?.user === "function") {
            try {
              user = supabase.auth.user();
            } catch (e) {
              // ignore
            }
          }
        }

        // No User -> Bail (Keep greeting fallback to "User")
        if (!user) {
          if (!cancelled) setUserFirstName("");
          return;
        }

        const userId = user?.id;
        const email = (user?.email || "").toLowerCase();
        let firstName = "";

        try {
          // Build basic select list we want to check
          const selectCols = "first_name,full_name,name,display_name,email";
          let query = supabase.from("profiles").select(selectCols).limit(1);

          if (userId) {
            query = query.eq("id", userId);
          } else if (email) {
            query = query.eq("email", email);
          }

          const { data: profileData, error: profileErr } = await query.maybeSingle();

          if (!profileErr && profileData) {
            // pick the best available candidate
            const raw =
              profileData.full_name ||
              profileData.email || "";

            firstName = (raw || "").toString().trim().split(/\s+/)[0] || "";
          }
        } catch (e) {
          // ignore and try metadata fallback
          console.warn("profiles lookup failed:", e);
        }

        // If still not found, look into user metadata
        if (!firstName) {
          const meta = user?.user_metadata || {};
          const rawMeta =
            meta?.first_name ||
            meta?.full_name ||
            meta?.name ||
            meta?.preferred_username ||
            user?.email || "";
            
          firstName = (rawMeta || "").toString().trim().split(/\s+/)[0] || "";
        }

        if (!cancelled) setUserFirstName(firstName || "");
      } catch (err) {
        console.error("Failed to load user first name:", err);
        if (!cancelled) setUserFirstName("");
      }
    }

    loadUserFirstName();

    return () => {
      cancelled = true;
    };
    // Intentionally run on mount and when auth identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.user?.id, auth?.user?.email]);

  // Preload LogoutModal immediately
  useEffect(() => {
    import("@/common/LogoutModal.jsx").catch(() => {});
  }, []);

  /* -----------------------
     Load motivational quote from Quotes.json (safe fetch + JSON parsing)
     ----------------------- */
  useEffect(() => {
    let cancelled = false;
    async function loadQuote() {
      try {
        const res = await fetch("/data/Quotes.json", { cache: "no-cache" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = await res.json();

        const list =
          Array.isArray(payload)
            ? payload
            : Array.isArray(payload.motivationalQuotes)
            ? payload.motivationalQuotes
            : [];

        if (!list.length) {
          const altList = payload.quotes || payload.items || payload.data || [];
          if (Array.isArray(altList) && altList.length) {
            const q = altList[Math.floor(Math.random() * altList.length)];
            const txt = q?.text || q?.quote || q?.message || "";
            if (!cancelled) setQuoteText(txt || "");
            return;
          }
          if (!cancelled) setQuoteText("");
          return;
        }

        const q = list[Math.floor(Math.random() * list.length)];
        const text = q?.text || q?.quote || q?.content || q?.quoteText || q?.message || "";
        if (!cancelled) setQuoteText(text || "");
      } catch (err) {
        if (!cancelled) setQuoteText("");
      }
    }

    loadQuote();
    return () => {
      cancelled = true;
    };
  }, []);

  // SpinnerVisible is only used when loading sections.
  useEffect(() => {
    setSpinnerVisible(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -----------------------
     Overlay control helpers
     ----------------------- */
  const openOverlay = useCallback((name, props = {}) => {
    if (!name) return;
    setOverlay(name);
    setOverlayProps(props || {});
    try {
      document.body.classList.add("modal-open");
    } catch (e) {}
  }, []);

  const closeOverlay = useCallback(() => {
    setOverlay(null);
    setOverlayProps({});
    try {
      document.body.classList.remove("modal-open");
    } catch (e) {}
  }, []);

  /* -----------------------
     Section preloading helper (uses the static importers)
     ----------------------- */
  const preloadSection = useCallback((compName) => {
    if (!compName || !importers[compName]) return;
    // Call the static importer to warm the module cache
    try {
      importers[compName]();
    } catch (e) {
      // ignore preload errors
    }
  }, []);

  /* -----------------------
     Dynamic initializer (single function for all sections)
     If a section module exports init / initSection / init<CompName>, call it.
     ----------------------- */
  const runSectionInitializer = useCallback(
    async (compName) => {
      if (!compName || !importers[compName]) return;
      try {
        const mod = await importers[compName]().catch(() => null);
        if (!mod) return;
        const possibleInits = [mod.init, mod.initSection, mod[`init${compName}`], mod.default && mod.default.init].filter(Boolean);
        const initFn = possibleInits.length ? possibleInits[0] : null;
        if (typeof initFn === "function") {
          const container = contentAreaRef.current || document.body;
          setTimeout(() => {
            try {
              initFn(container);
            } catch (e) {
              // swallow init errors
            }
          }, 40);
        }
      } catch (err) {
        // ignore
      }
    },
    [contentAreaRef]
  );

  /* -----------------------
     Navigation click handler (Vite-friendly: uses Sections mapping)
     ----------------------- */
  const handleNavClick = useCallback(
    (e, dataSection) => {
      e?.preventDefault?.();
      const compName = (dataSection || "").replace(/\.html$/i, "");
      if (!compName) return;

      // If user clicked logout action, open logout modal — don't change activeSection
      if (/logout/i.test(compName)) {
        setShowLogoutModal(true);
        return;
      }

      setSpinnerVisible(true);
      try {
        setActiveSection(compName);

        // hide home body (original behavior)
        if (mainBodyRef.current) mainBodyRef.current.classList.add("hidden");

        // warm module and run initializer (non-blocking)
        if (importers[compName]) {
          importers[compName]()
            .then(() => runSectionInitializer(compName))
            .catch(() => {})
            .finally(() => {
              setTimeout(() => setSpinnerVisible(false), 80);
            });
        } else {
          // no importer (section missing) — stop spinner
          setTimeout(() => setSpinnerVisible(false), 80);
        }
      } catch (err) {
        setSpinnerVisible(false);
        console.error("Error loading section:", err);
      }
    },
    [runSectionInitializer]
  );

  /* -----------------------
     Home toggler click
     ----------------------- */
  const handleHomeClick = useCallback(() => {
    setActiveSection("home");
    if (mainBodyRef.current) {
      mainBodyRef.current.classList.remove("hidden");
      mainBodyRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setShowLogoutModal(false);
    setShowLearnMore(false);
    closeOverlay();
  }, [closeOverlay]);

  /* -----------------------
     Sidebar collapse / Logo click behavior
     ----------------------- */
  useEffect(() => {
    const navOuter = navRef.current;
    if (!navOuter) return;

    const collapsedClass = styles?.collapsed ?? "collapsed";
    const logoImg = document.getElementById("logoImg");
    const mobileMql = window.matchMedia("(max-width: 30rem)");
    const collapseRangeMql = window.matchMedia(
      "(min-width: 30.0625rem) and (max-width: 48rem)"
    );

    const applyState = () => {
      if (mobileMql.matches) {
        navOuter.classList.remove(collapsedClass);
      } else if (collapseRangeMql.matches) {
        navOuter.classList.add(collapsedClass);
      } else {
        navOuter.classList.remove(collapsedClass);
      }
    };

    applyState();

    const mqHandler = () => applyState();
    mobileMql.addEventListener("change", mqHandler);
    collapseRangeMql.addEventListener("change", mqHandler);

    const logoClickHandler = () => {
      if (mobileMql.matches) return;
      navOuter.classList.toggle(collapsedClass);
    };

    if (logoImg) logoImg.addEventListener("click", logoClickHandler);

    return () => {
      mobileMql.removeEventListener("change", mqHandler);
      collapseRangeMql.removeEventListener("change", mqHandler);
      if (logoImg) logoImg.removeEventListener("click", logoClickHandler);
    };
  }, []);

  /* -----------------------
    Navbar auto-hide while scrolling down
    ----------------------- */
  useEffect(() => {
    const handleScroll = () => {
      const currentScroll = window.scrollY;

      if (currentScroll > lastScroll) {
        setHideNavbar(true);
      } else {
        setHideNavbar(false);
      }
      setLastScroll(currentScroll);
    };

    // Throttle scroll for performance
    let ticking = false;
    const throttledScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          handleScroll();
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", throttledScroll);

    return () => window.removeEventListener("scroll", throttledScroll);
  }, [lastScroll]);

  /* -----------------------
     Global key handler for Escape (close modals)
     ----------------------- */
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") {
        if (showLearnMore) setShowLearnMore(false);
        if (showLogoutModal) setShowLogoutModal(false);
        if (overlay) closeOverlay();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showLearnMore, showLogoutModal, overlay, closeOverlay]);

  /* -----------------------
     Keep main body visible when returning to home
     ----------------------- */
  useEffect(() => {
    if (activeSection === "home" && mainBodyRef.current) {
      mainBodyRef.current.classList.remove("hidden");
    }
  }, [activeSection]);

  /* -----------------------
     Toggler auto-hide / inactivity detection
     ----------------------- */
  useEffect(() => {
    if (activeSection === "home") {
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
  }, [activeSection]);

  /* -----------------------
     Helper: show/hide LearnMore modal
     ----------------------- */
  const openLearnMore = useCallback((e) => {
    e?.preventDefault?.();
    setShowLearnMore(true);
  }, []);

  /* -----------------------
     Render functions: nav links
     ----------------------- */
  const NavLink = ({ compName, label, iconClass }) => {
    const htmlData = `${compName}.html`;
    const isActive = activeSection === compName;
    return (
      <li data-section={htmlData}>
        <a
          href="#"
          data-section={htmlData}
          onClick={(e) => handleNavClick(e, htmlData)}
          onMouseEnter={() => preloadSection(compName)}
          className={isActive ? cx("active") : ""}
        >
          <i className={iconClass} aria-hidden="true" />
          <span className={cx("nav-item")}>{label}</span>
        </a>
      </li>
    );
  };

  /* -----------------------
     Safe OnConfirm for Logout
     ----------------------- */
  const handleLogoutConfirm = useCallback(() => {
    setShowLogoutModal(false);
    logout();
    navigate("/");
  }, [logout, navigate]);

  /* -----------------------
     Which component to render for activeSection
     ----------------------- */
  const ActiveSectionComponent = activeSection !== "home" ? Sections[activeSection] : null;
  const isHome = activeSection === "home";
  const stateClass = isHome ? "home-hidden" : togglerVisible ? "visible" : "hidden";
  const activeClass = togglerVisible ? "toggler-active" : "";
  const className = cx("home-toggler", stateClass, activeClass);
  const ActiveOverlayComponent = overlay ? OverlayComponents[overlay] : null;

  /* -----------------------
     Render Dashboard JSX
     - Render all sections (lazy) but toggle visibility via style to avoid remounts
     ----------------------- */
  return (
    <div className={cx("container")}>
      {/* Spinner overlay used during lazy section loads */}
      <SpinnerOverlay visible={spinnerVisible} />

      {/* Sidebar / Navigation */}
      <nav aria-label="Main navigation" className={cx("nav", hideNavbar ? "hide-navbar" : "")}
      id="nav" ref={navRef}>
        <div className={cx("navbar")}>
          <div className={cx("logo")} id="logoImg">
            <img src="/Menu.png" alt="Menu" />
            <h1>MENU</h1>
          </div>
          <ul className={cx("nav-links")}>
            <NavLink compName="ProfileSection" label="Profile" iconClass="fas fa-user" />
            <NavLink compName="QuestionSection" label="PYQs" iconClass="fas fa-chart-bar" />
            <NavLink compName="SyllabusSection" label="Syllabus" iconClass="fas fa-tasks" />
            <NavLink compName="OthersSection" label="Others" iconClass="fas fa-briefcase" />
            <NavLink compName="FeedbackSection" label="Feedback" iconClass="fas fa-comment" />
            <NavLink compName="SettingsSection" label="Settings" iconClass="fas fa-cog" />
          </ul>
        </div>
      </nav>

      {/* Main area */}
      <main className={cx("main")} id="main-content">
        <div className={cx("main-top")}>
          <p>STUDENT DASHBOARD</p>
        </div>

        {/* Home / Dashboard body (shown only when activeSection === 'home') */}
        {isHome && (
          <div className={cx("main-body")} id="dashboardHome" ref={mainBodyRef}>
            <div className={cx("main-content")}>
              <div className={cx("image-text-section")}>
                <img src="/Welcome.svg" alt="Classroom Management" />
                <div className={cx("text")}>
                  <h2>{greetingText}</h2>
                  <p>
                    Turn Stress Into Your Strength! All You Need Just A Little Bit
                    Motivation...<br />
                    Let's Power Up Your Day With The Perfect Motivational Quote:
                  </p>
                  <p id="motivational-quote">{quoteText ? <em><br />“{quoteText}”</em> : ""}</p>
                  <div className={cx("intro-buttons")}>
                    <a href="#" id="learnMoreBtn" data-modal="learnMoreModal" onClick={openLearnMore}>
                      What's New
                    </a>
                    <a href="#" data-section="FeedbackSection.html" onClick={(e) => handleNavClick(e, "FeedbackSection.html")}>
                      Post Your Review
                    </a>
                  </div>
                </div>
              </div>

              {/* News Section */}
              <section className={cx("newsSection")} aria-label="Trending News">
                <TrendingNews />
              </section>

              {/* Game Section */}
              <section className={cx("gameSection")} aria-label="Game">
              <MindGame />
              </section>

            <p className={cx("text-muted")}>
            <i className="far fa-copyright" style={{marginRight: "0.15rem"}}></i>{" "}
            {new Date().getFullYear()} QNIT. All Rights Reserved.
            <br />
            <span className={cx("divider")}>
              <i className="fas fa-lock" style={{marginRight: "0.15rem"}}></i> Secured Data
            </span>
            <i className="fas fa-wrench" style={{marginRight: "0.15rem"}}></i> Made in India <br />
            <i className="fas fa-envelope" style={{marginRight: "0.15rem"}}></i> Contact - devtruster@gmail.com
          </p>
            </div>
          </div>
        )}

        {/* Home toggler (hidden on 'home' and auto-hidden by inactivity) */}
        <button
          id="homeToggler"
          aria-label="Go to Home"
          className={cx("home-toggler", isHome ? "home-hidden" : togglerVisible ? "visible" : "hidden")}
          onClick={handleHomeClick}
          ref={homeTogglerRef}
          title="Return Home"
        >
          <span className="material-symbols-outlined">home</span>
        </button>

        {/* Dynamic Section Loading Area (lazy loaded React components) */}
        <div className={cx("content-area")} id="content-area" ref={contentAreaRef}>
          <Suspense fallback={<SpinnerOverlay visible={true} />}>
            {/* Render each section once and control visibility via CSS/style to avoid remounts */}
            {Object.entries(Sections).map(([name, Component]) => (
              <div
                key={name}
                aria-hidden={activeSection !== name}
                style={{ display: activeSection === name ? "block" : "none" }}
                className={cx("section-wrapper")}
                data-section={`${name}.html`}
              >
                {name === "SettingsSection" ? (
                  overlay && ActiveOverlayComponent ? (
                    /* Render overlay over settings when requested */
                    <ActiveOverlayComponent onCancel={closeOverlay} onClose={closeOverlay} {...overlayProps} />
                  ) : (
                    <Component openOverlay={openOverlay} closeOverlay={closeOverlay}
                    openLogoutModal={openLogoutModal}/>
                  )
                ) : (
                  <Component />
                )}
              </div>
            ))}

            {/* If requested activeSection doesn't exist in map, show NotFound */}
            {activeSection !== "home" && !Sections[activeSection] && (
              <NotFoundSection name={activeSection} />
            )}
          </Suspense>
        </div>
      </main>

      {/* Learn More modal (React controlled) */}
        <div
          id="learnMoreModal"
          className={cx("learnMoreModal", showLearnMore && "show")}
          role="dialog"
          aria-modal="true"
          aria-labelledby="learnMoreModalTitle"
          onClick={() => setShowLearnMore(false)}
        >
        <div className={cx("modal-content")} onClick={(e) => e.stopPropagation()}>
          <button id="closeLearnMoreModal" data-close aria-label="Close" onClick={() => setShowLearnMore(false)}>
            &times;
          </button>
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

      {/* Logout modal area (React-driven). Lazy component is parent-controlled */}
      {showLogoutModal && (
        <Suspense fallback={null}>
          <LogoutModalComponent isOpen={showLogoutModal} onClose={() => setShowLogoutModal(false)} onConfirm={handleLogoutConfirm} />
        </Suspense>
      )}
    </div>
  );
}
