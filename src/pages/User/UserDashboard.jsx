// src/pages/UserDashboard.jsx
import { useCallback, useEffect, useRef, useState, Suspense, lazy } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import styles from "./UserDashboard.module.css";

/* -----------------------
   Static import helper map
   ----------------------- */
const importers = {
  ProfileSection: () => import("./components/ProfileSection.jsx"),
  QuestionSection: () => import("./components/QuestionSection.jsx"),
  SyllabusSection: () => import("./components/SyllabusSection.jsx"),
  OthersSection: () => import("./components/OthersSection.jsx"),
  SettingsSection: () => import("@/common/SettingsSection.jsx"),
  FeedbackSection: () => import("./components/FeedbackSection.jsx"),
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
        No component found for <strong>{name}</strong>. Create <code>{name}.jsx</code> in <code>src/components</code>.
      </p>
    </div>
  );
}

/* The FAQ content — React-driven (kept behavior, accessible accordions) */
function FAQ() {
  const items = [
    {
      q: "How can I preview and download study materials?",
      a:
        'After logging in, browse the available question papers, syllabus, or notes. Click "Preview" to view the document, or "Download" to save it to your device',
    },
    {
      q: "Can I share materials with others?",
      a:
        'Yes! Use the "Share" button to send Google Drive links to classmates or friends directly from the platform',
    },
    {
      q: "How often is the database updated?",
      a:
        "We update our database regularly with the latest question papers, syllabus, and notes to ensure you always have access to current materials",
    },
    {
      q: "Is my personal data safe?",
      a:
        "Absolutely! We use advanced security measures and encryption to keep your account and personal information safe",
    },
    {
      q: "Does this platform support cross device compatibility?",
      a: "Yes, our platform is fully responsive and works smoothly on any type of device",
    },
    {
      q: "Who can I contact for support or feedback?",
      a: 'Use the "Support & Feedback" section to reach out to our team.\'re here to help!',
    },
  ];

  const [openIndex, setOpenIndex] = useState(null);
  const answerRefs = useRef([]);

  useEffect(() => {
    items.forEach((_, i) => {
      const el = answerRefs.current[i];
      if (!el) return;
      if (openIndex === i) {
        el.style.height = el.scrollHeight + "px";
      } else {
        el.style.height = "0";
      }
    });
  }, [openIndex, items]);

  function toggle(i) {
    setOpenIndex((prev) => (prev === i ? null : i));
  }

  return (
    <section className={cx("faq-section")} aria-label="FAQ">
      <h2>Frequently Asked Questions (FAQ)</h2>
      <div className={cx("faq-container")}>
        {items.map((it, i) => (
          <div className={cx("faq-item")} key={i}>
            <h3
              className={cx("faq-question", openIndex === i && "active")}
              tabIndex={0}
              onClick={() => toggle(i)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggle(i);
                }
              }}
            >
              {it.q}
            </h3>
            <div className={cx("faq-answer")} ref={(el) => (answerRefs.current[i] = el)}>
              <p>{it.a}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
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
  const { logout } = useAuth();

  // UI state
  const [spinnerVisible, setSpinnerVisible] = useState(false); // show spinner only during lazy loads
  const [activeSection, setActiveSection] = useState("home"); // 'home' or 'ProfileSection', etc.
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showLearnMore, setShowLearnMore] = useState(false);
  const [quoteText, setQuoteText] = useState(""); // motivational quote
  const [greetingText, setGreetingText] = useState("");
  const [togglerVisible, setTogglerVisible] = useState(false); // home toggler visibility due to inactivity
  const { lightMode } = useTheme();
  const [overlay, setOverlay] = useState(null); // e.g. "ChangePassword"
  const [overlayProps, setOverlayProps] = useState({});

  /* -----------------------
     Compute greeting (kept behavior)
     ----------------------- */
  useEffect(() => {
    const userName = "Sayan"; // keep this behavior; replace with real user data when available
    const hour = new Date().getHours();
    let greeting = "Hello";
    if (hour >= 5 && hour < 12) greeting = "Good Morning";
    else if (hour >= 12 && hour < 17) greeting = "Good Afternoon";
    else if (hour >= 17 && hour <= 23) greeting = "Good Evening";
    setGreetingText(`${greeting} ${userName}`);
  }, []);

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
     Sidebar collapse / logo click behavior
     ----------------------- */
  useEffect(() => {
    const navOuter = navRef.current;
    const logoImg = navRef.current ? navRef.current.querySelector(`.${styles.logo} img`) : null;

    function logoClickHandler() {
      if (navOuter) navOuter.classList.toggle(styles.collapsed);
    }

    if ((logoImg && navOuter) || window.innerWidth < 768) {
      if (logoImg) logoImg.addEventListener("click", logoClickHandler);
    }

    function handleSidebarCollapse() {
      if (!navOuter) return;
      if (window.innerWidth < 768) {
        navOuter.classList.add(styles.collapsed);
      } else {
        navOuter.classList.remove(styles.collapsed);
      }
    }

    handleSidebarCollapse();
    window.addEventListener("resize", handleSidebarCollapse);

    return () => {
      if (logoImg) logoImg.removeEventListener("click", logoClickHandler);
      window.removeEventListener("resize", handleSidebarCollapse);
    };
  }, []);

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
      <nav aria-label="Main navigation" className={cx("sidebar-nav")} id="sidebarNav" ref={navRef}>
        <div className={cx("navbar")}>
          <div className={cx("logo")} id="logoImg">
            <img src="/Logo.png" alt="Logo" />
            <h1>MENU</h1>
          </div>
          <ul className={cx("nav-links")}>
            <NavLink compName="ProfileSection" label="PROFILE" iconClass="fas fa-user" />
            <NavLink compName="QuestionSection" label="PYQs" iconClass="fas fa-chart-bar" />
            <NavLink compName="SyllabusSection" label="SYLLABUS" iconClass="fas fa-tasks" />
            <NavLink compName="OthersSection" label="OTHERS" iconClass="fas fa-briefcase" />
            <NavLink compName="SettingsSection" label="SETTINGS" iconClass="fas fa-cog" />
            <NavLink compName="FeedbackSection" label="FEEDBACK" iconClass="fas fa-comment" />
            <li data-section="LogoutModal.html">
              <a
                href="#"
                id="logoutBtn"
                data-section="LogoutModal.html"
                className={cx("logout")}
                onClick={(e) => {
                  e.preventDefault();
                  setShowLogoutModal(true);
                }}
              >
                <i className="fas fa-sign-out-alt" aria-hidden="true" />
                <span className={cx("nav-item")}>LOG OUT</span>
              </a>
            </li>
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

              {/* Features */}
              <section className={cx("features-section")} aria-label="Key Features">
                <h2>Key Features</h2>
                <p>
                  A comprehensive online resource management software embedded
                  with exceptional features required to deliver an extraordinary
                  learning experience
                </p>

                <div className={cx("features-container")} id="features-container-dashboard">
                  <div className={cx("feature-box")}>
                    <img src="/Pdf.png" alt="PDF Access" />
                    <h3>Instant PDF Access</h3>
                    <p>
                      View and download previous year question papers, syllabus,
                      and other documents in PDF format with just a click
                    </p>
                  </div>

                  <div className={cx("feature-box")}>
                    <img src="/Share.png" alt="Share" />
                    <h3>Easy Sharing</h3>
                    <p>Share study materials with friends and classmates directly from the platform</p>
                  </div>

                  <div className={cx("feature-box")}>
                    <img src="/Smartphone.png" alt="Mobile Friendly" />
                    <h3>Mobile Friendly</h3>
                    <p>Access all features from any device - Desktop, Table or Smartphone</p>
                  </div>

                  <div className={cx("feature-box")}>
                    <img src="/Security.png" alt="Security" />
                    <h3>Advanced Security</h3>
                    <p>Your account and personal data are protected with robust security measures and encryption</p>
                  </div>

                  <div className={cx("feature-box")}>
                    <img src="/Database.png" alt="Frequent Updates" />
                    <h3>Frequently Updated Database</h3>
                    <p>The resource library is actively updated with the latest question papers, syllabus, and notes</p>
                  </div>

                  <div className={cx("feature-box")}>
                    <img src="/Support.png" alt="Support" />
                    <h3>Support & Feedback</h3>
                    <p>Reach out for help or share feedback to help in improving user experience</p>
                  </div>
                </div>
              </section>

              {/* FAQ (React-based) */}
              <FAQ />

              <p className={cx("text-muted")}>
                <i className="far fa-copyright" /> {new Date().getFullYear()} QNIT. All Rights Reserved.
                <br />
                <span className={cx("divider")}><i className="fas fa-lock" /> Secured Data</span>
                <i className="fas fa-wrench" /> Made in India
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
          <span className="material-symbols-outlined">HOME</span>
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
                    <Component openOverlay={openOverlay} closeOverlay={closeOverlay} />
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