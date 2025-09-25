// src/AdminDashboard.jsx
import {useCallback, useEffect, useRef, useState, Suspense, lazy} from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import './AdminDashboard.css'

/* Dynamically import modules at runtime to call any exported init functions */
const ProfileSection = lazy(() => import("./components/ProfileSection"));
const QuestionSection = lazy(() => import("./components/QuestionSection"));
const SyllabusSection = lazy(() => import("./components/SyllabusSection"));
const OthersSection = lazy(() => import("./components/OthersSection"));
const SettingsSection = lazy(() => import("@/common/SettingsSection"));
const FeedbackSection = lazy(() => import("./components/FeedbackSection"));
const LogoutModalComponent = lazy(() => import("@/common/LogoutModal"));
const OverlayComponents = { ChangePassword: lazy(() => import("@/common/ChangePassword"))};

/* Small presentational fallback used within Suspense while a section loads */
function SpinnerOverlay({ visible = true }) {
  if (!visible) return null;
  return (
    <div id="loading-spinner" className="show" aria-hidden={!visible}>
      <div className="spinner" />
    </div>
  );
}

/* Fallback when a named section doesn't exist as a component */
function NotFoundSection({ name }) {
  return (
    <div style={{ padding: 24, color: "#fff" }}>
      <h3>Section not found</h3>
      <p>
        No component found for <strong>{name}</strong>. Create{" "}
        <code>{name}.jsx</code> in <code>src/components</code>.
      </p>
    </div>
  );
}

/* The FAQ content — React-driven */
function FAQ() {
  const items = [
    {
      q: "How can I preview and download study materials?",
      a:
        'After logging in, browse the available question papers, syllabus, or notes. Click "Preview" to view the document, or "Download" to save it to your device.',
    },
    {
      q: "Can I share materials with others?",
      a:
        'Yes! Use the "Share" button to send Google Drive links to classmates or friends directly from the platform.',
    },
    {
      q: "How often is the database updated?",
      a:
        "We update our database regularly with the latest question papers, syllabus, and notes to ensure you always have access to current materials.",
    },
    {
      q: "Is my personal data safe?",
      a:
        "Absolutely! We use advanced security measures and encryption to keep your account and personal information safe.",
    },
    {
      q: "Can I access the platform on my mobile device?",
      a:
        "Yes, our platform is fully responsive and works smoothly on smartphones and tablets.",
    },
    {
      q: "Who can I contact for support or feedback?",
      a:
        'Use the "Support & Feedback" section to reach out to our team. We\'re here to help!',
    },
  ];

  const [openIndex, setOpenIndex] = useState(null);
  const answerRefs = useRef([]);

  useEffect(() => {
    // Animate heights for open/close transitions
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
    <section className="faq-section" aria-label="FAQ">
      <h2>Frequently Asked Questions (FAQ)</h2>
      <div className="faq-container">
        {items.map((it, i) => (
          <div className="faq-item" key={i}>
            <h3
              className={`faq-question ${openIndex === i ? "active" : ""}`}
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
            <div
              className="faq-answer"
              ref={(el) => (answerRefs.current[i] = el)}
            >
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
export default function AdminDashboard() {
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

  // Map of compiled lazy components (for rendering)
  const Sections = {
    ProfileSection,
    QuestionSection,
    SyllabusSection,
    OthersSection,
    SettingsSection,
    FeedbackSection,
  };

  // Helper: compute username/greeting (kept behavior of original)
  useEffect(() => {
    const userName = "Sayan";
    const hour = new Date().getHours();
    let greeting = "Hello";
    if (hour >= 5 && hour < 12) greeting = "Good Morning";
    else if (hour >= 12 && hour < 17) greeting = "Good Afternoon";
    else if (hour >= 17 && hour <= 23) greeting = "Good Evening";
    setGreetingText(`${greeting} ${userName}`);
  }, []);

  // Load motivational quote from Quotes.json (safe fetch + JSON parsing)
  useEffect(() => {
    let cancelled = false;
    async function loadQuote() {
      try {
        // local Quotes.json should be placed in public/ or served by your server
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
          const altList =
            payload.quotes || payload.items || payload.data || [];
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
        const text =
          q?.text || q?.quote || q?.content || q?.quoteText || q?.message || "";
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
    // Clear any stale spinner
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
    try { document.body.classList.add("modal-open"); } catch (e) {}
  }, []);

  const closeOverlay = useCallback(() => {
    setOverlay(null);
    setOverlayProps({});
    try { document.body.classList.remove("modal-open"); } catch (e) {}
  }, []);

  /* -----------------------
     Section preloading helper
     ----------------------- */
  const preloadSection = useCallback((compName) => {
    if (!compName) return;
    // Start dynamic import in background for faster next load
    import(
      /* webpackChunkName: "[request]" */ `./components/${compName}`
    ).catch(() => {
      /* ignore preload errors (component may not exist yet) */
    });
  }, []);

  /* -----------------------
     Dynamic initializer (single function for all sections)
     ----------------------- */
  const runSectionInitializer = useCallback(
    async (compName) => {
      if (!compName) return;
      try {
        const mod = await import(
          /* webpackChunkName: "init-[request]" */ `./components/${compName}`
        ).catch(() => null);

        if (!mod) return;

        // prefer named exports first, then default
        const possibleInits = [
          mod.init,
          mod.initSection,
          mod[`init${compName}`],
          mod.default && mod.default.init,
        ].filter(Boolean);

        const initFn = possibleInits.length ? possibleInits[0] : null;
        if (typeof initFn === "function") {
          // call it with the content container (contentAreaRef) for compatibility with previous code
          try {
            const container = contentAreaRef.current || document.body;
            // give React time to mount the lazy component into the DOM
            // a small delay ensures DOM nodes exist for the init to find
            setTimeout(() => {
              try {
                initFn(container);
              } catch (e) {
                // init function may expect different args — swallow errors
                // console.warn("init function error for", compName, e);
              }
            }, 40);
          } catch (e) {
          }
        }
      } catch (err) {
        // console.debug("runSectionInitializer failed:", compName, err);
      }
    },
    [contentAreaRef]
  );

  /* -----------------------
     Navigation click handler
     ----------------------- */
  const handleNavClick = useCallback(
    async (e, dataSection) => {
      e?.preventDefault?.();

      const compName = (dataSection || "").replace(/\.html$/i, "");
      if (!compName) return;

      // If user clicked logout action, open logout modal — don't change activeSection
      if (/logout/i.test(compName)) {
        setShowLogoutModal(true);
        return;
      }

      // Show spinner while module is being imported / initialized
      setSpinnerVisible(true);
      try {
        setActiveSection(compName);

        // hide home body (original behavior)
        if (mainBodyRef.current) mainBodyRef.current.classList.add("hidden");

        const importPromise = import(
          /* webpackChunkName: "[request]" */ `./components/${compName}`
        );

        // call dynamic initializer once module is fetched (non-blocking)
        importPromise
          .then(() => {
            runSectionInitializer(compName);
          })
          .catch(() => {
          })
          .finally(() => {
            // stop spinner when load attempt finishes (successful or failed)
            // small timeout helps avoid flicker for very-fast loads
            setTimeout(() => setSpinnerVisible(false), 80);
          });
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
      // scroll to top of dashboard home for good UX
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
    const navOuter = document.querySelector("nav");
    const logoImg = navRef.current ? navRef.current.querySelector(".logo img") : null;

    function logoClickHandler() {
      if (navOuter) navOuter.classList.toggle("collapsed");
    }
    if ((logoImg && navOuter) || window.innerWidth < 768) {
      if (logoImg) logoImg.addEventListener("click", logoClickHandler);
    }

    function handleSidebarCollapse() {
      if (!navOuter) return;
      if (window.innerWidth < 768) {
        navOuter.classList.add("collapsed");
      } else {
        navOuter.classList.remove("collapsed");
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
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showLearnMore, showLogoutModal]);

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
    // toggler should not show when home is active
    if (activeSection === "home") {
      setTogglerVisible(false);
      // clear any timer
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      return;
    }

    // show toggler initially when opening a section
    setTogglerVisible(true);

    // create a function to hide toggler after inactivity
    const startInactivityTimer = () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = setTimeout(() => {
        setTogglerVisible(false);
        inactivityTimerRef.current = null;
      }, 3000); // 3 seconds of inactivity
    };

    // start the initial timer
    startInactivityTimer();

    // event handler to show toggler and reset timer on activity
    const activityHandler = () => {
      // if toggler hidden, show immediately
      setTogglerVisible(true);
      startInactivityTimer();
    };

    // listen for common activity events
    const events = ["mousemove", "keydown", "scroll", "touchstart", "click"];
    events.forEach((ev) => document.addEventListener(ev, activityHandler, { passive: true }));

    // cleanup
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
          className={isActive ? "active" : ""}
        >
          <i className={iconClass} aria-hidden="true" />
          <span className="nav-item">{label}</span>
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
    const stateClass = isHome ? "home-hidden" : (togglerVisible ? "visible" : "hidden"); 
    const activeClass = togglerVisible ? " active" : ""; 
    const className = `home-toggler ${stateClass}${activeClass}`;
    const ActiveOverlayComponent = overlay ? OverlayComponents[overlay] : null;

  /* -----------------------
     Render Dashboard JSX
     ----------------------- */
  return (
      <div className="container">
        {/* Spinner overlay used during lazy section loads */}
        <SpinnerOverlay visible={spinnerVisible} />

        {/* Sidebar / Navigation */}
        <nav
          aria-label="Main navigation"
          className="sidebar-nav"
          id="sidebarNav"
          ref={navRef}
        >
          <div className="navbar">
            <div className="logo">
              <img
                src="/Logo.png"
                alt="Logo"
              />
              <h1>MENU</h1>
            </div>
            <ul className="nav-links">
              <NavLink compName="ProfileSection" label="PROFILE" iconClass="fas fa-user"/>
              <NavLink compName="QuestionSection" label="PYQs" iconClass="fas fa-chart-bar"/>
              <NavLink compName="SyllabusSection" label="SYLLABUS" iconClass="fas fa-tasks"/>
              <NavLink compName="OthersSection" label="OTHERS" iconClass="fas fa-briefcase"/>
              <NavLink compName="SettingsSection" label="SETTINGS" iconClass="fas fa-cog"/>
              <NavLink compName="FeedbackSection" label="FEEDBACK" iconClass="fas fa-comment"/>
              <li data-section="LogoutModal.html">
                <a
                  href="#"
                  id="logoutBtn"
                  data-section="LogoutModal.html"
                  className="logout"
                  onClick={(e) => {
                    e.preventDefault();
                    setShowLogoutModal(true);
                  }}
                >
                  <i className="fas fa-sign-out-alt" aria-hidden="true" />
                  <span className="nav-item">LOG OUT</span>
                </a>
              </li>
            </ul>
          </div>
        </nav>

        {/* Main area */}
        <main className="main" id="main-content">
          <div className="main-top">
            <p>STUDENT DASHBOARD</p>
          </div>

          {/* Home / Dashboard body (shown only when activeSection === 'home') */}
          {activeSection === "home" && (
            <div className="main-body" id="dashboardHome" ref={mainBodyRef}>
              <div className="main-content">
                <div className="image-text-section">
                  <img
                    src="/Welcome.svg"
                    alt="Classroom Management"
                  />
                  <div className="text">
                    <h2>{greetingText}</h2>
                    <p>
                      Turn Stress Into Your Strength! All You Need Just A Little Bit
                      Motivation...<br />
                      Let's Power Up Your Day With The Perfect Motivational Quote:
                    </p>
                    <p id="motivational-quote">
                      {quoteText ? <em><br/>“{quoteText}”</em> : ""}
                    </p>
                    <div className="intro-buttons">
                      <a
                        href="#"
                        id="learnMoreBtn"
                        data-modal="learnMoreModal"
                        onClick={openLearnMore}
                      >
                        What's New
                      </a>
                      <a
                        href="#"
                        data-section="FeedbackSection.html"
                        onClick={(e) => handleNavClick(e, "FeedbackSection.html")}
                      >
                        Post Your Review
                      </a>
                    </div>
                  </div>
                </div>

                {/* Features */}
                <section className="features-section" aria-label="Key Features">
                  <h2>Key Features</h2>
                  <p>
                    A comprehensive online resource management software embedded
                    with exceptional features required to deliver an extraordinary
                    learning experience
                  </p>

                  <div
                    className="features-container"
                    id="features-container-dashboard"
                  >
                    <div className="feature-box">
                      <img
                        src="/Pdf.png"
                        alt="PDF Access"
                      />
                      <h3>Instant PDF Access</h3>
                      <p>
                        View and download previous year question papers, syllabus,
                        and other documents in PDF format with just a click
                      </p>
                    </div>

                    <div className="feature-box">
                      <img
                        src="/Share.png"
                        alt="Share"
                      />
                      <h3>Easy Sharing</h3>
                      <p>
                        Share study materials with friends and classmates directly
                        from the platform
                      </p>
                    </div>

                    <div className="feature-box">
                      <img
                        src="/Smartphone.png"
                        alt="Mobile Friendly"
                      />
                      <h3>Mobile Friendly</h3>
                      <p>
                        Access all features from any device - Desktop, Table or
                        Smartphone
                      </p>
                    </div>

                    <div className="feature-box">
                      <img
                        src="/Security.png"
                        alt="Security"
                      />
                      <h3>Advanced Security</h3>
                      <p>
                        Your account and personal data are protected with robust
                        security measures and encryption
                      </p>
                    </div>

                    <div className="feature-box">
                      <img
                        src="/Database.png"
                        alt="Frequent Updates"
                      />
                      <h3>Frequently Updated Database</h3>
                      <p>
                        The resource library is actively updated with the latest
                        question papers, syllabus, and notes
                      </p>
                    </div>

                    <div className="feature-box">
                      <img
                        src="/Support.png"
                        alt="Support"
                      />
                      <h3>Support & Feedback</h3>
                      <p>
                        Reach out for help or share feedback to help in improving
                        user experience
                      </p>
                    </div>
                  </div>
                </section>

                {/* FAQ (React-based) */}
                <FAQ />

                <p className="text-muted">
                  <i className="far fa-copyright"></i> {new Date().getFullYear()} QNIT. All Rights Reserved.
                  <br/>
                  <span className="divider"><i className="fas fa-lock"></i> Secured Data</span>
                  <i className="fas fa-wrench"></i> Made in India
                </p>
              </div>
            </div>
          )}

          {/* Home toggler (hidden on 'home' and auto-hidden by inactivity) */}
          <button
            id="homeToggler"
            aria-label="Go to Home"
            className={className}
            onClick={handleHomeClick}
            ref={homeTogglerRef}
            hidden={isHome ? true : !togglerVisible}
            title="Return Home"
          >
            <span className="material-symbols-outlined">HOME</span>
          </button>

          {/* Dynamic Section Loading Area (lazy loaded React components) */}
          <div className="content-area" id="content-area" ref={contentAreaRef}>
            {activeSection !== "home" && (
              <Suspense fallback={<SpinnerOverlay visible={true} />}>
                {activeSection === "SettingsSection" ? (
                  overlay && ActiveOverlayComponent ? (
                    // Render overlay instead of SettingsSection
                    <ActiveOverlayComponent
                      onCancel={closeOverlay}
                      onClose={closeOverlay}
                      {...(overlayProps || {})}
                    />
                  ) : (
                    // Render SettingsSection normally
                    <ActiveSectionComponent
                      openOverlay={openOverlay}
                      closeOverlay={closeOverlay}
                    />
                  )
                ) : ActiveSectionComponent ? (
                  // Render any other section
                  <ActiveSectionComponent />
                ) : (
                  <NotFoundSection name={activeSection} />
                )}
              </Suspense>
            )}
          </div>
        </main>

        {/* Learn More modal (React controlled) */}
        <div
          id="learnMoreModal"
          className={`modal ${showLearnMore ? "show" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="learnMoreModalTitle"
          onClick={() => setShowLearnMore(false)}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              id="closeLearnMoreModal"
              data-close
              aria-label="Close"
              onClick={() => setShowLearnMore(false)}
            >
              &times;
            </button>
            <h2 id="learnMoreModalTitle">New in the System</h2>
            <ul>
              <li>
                <strong>New Uploads:</strong>
                <br />- 5th Semester's Previous Year Questions <br />- 5th
                Semester's Syllabus <br />- 5th Semester's Lab Cover Pages
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
            <LogoutModalComponent
              isOpen={showLogoutModal}
              onClose={() => setShowLogoutModal(false)}
              onConfirm={handleLogoutConfirm}
            />
          </Suspense>
        )}
      </div>
  );
}