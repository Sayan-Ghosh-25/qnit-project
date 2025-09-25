// src/HomeLander.jsx
import { useCallback, useEffect, useRef, useState, Suspense, lazy } from "react";
import styles from "./HomeLander.module.css";

const AuthModalComponent = lazy(() => import("./components/AuthModal"));

/* Helper to compose class names in a safe way */
function cx(...names) {
  return names
    .filter(Boolean)
    .map((n) => (styles && styles[n] ? styles[n] : n))
    .join(" ");
}

/* The FAQ Content — React-Driven */
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
            <div
              className={cx("faq-answer")}
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
   HomeLander Main Export
   ----------------------------- */
export default function HomeLander() {
  // Refs
  const mainBodyRef = useRef(null); // the home body area

  // UI state
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showLearnMore, setShowLearnMore] = useState(false);

  /* -----------------------
     Global Key handler for Escape (Close Modals)
     ----------------------- */
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") {
        if (showLearnMore) setShowLearnMore(false);
        if (showAuthModal) setShowAuthModal(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showLearnMore, showAuthModal]);

  /* -----------------------
     Helper: Show/Hide LearnMore Modal
     ----------------------- */
  const openLearnMore = useCallback((e) => {
    e?.preventDefault?.();
    setShowLearnMore(true);
  }, []);

  const handleAuthConfirm = useCallback(() => {
    setShowAuthModal(false);
  }, []);

  /* small helper for scrollIntoView — uses the original class as fallback */
  const scrollToFeatures = (e) => {
    e?.preventDefault?.();
    const cls = styles && styles["features-section"] ? styles["features-section"] : "features-section";
    const el = document.querySelector("." + cls);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className={cx("container")}>
      {/* Main area */}
      <main className={cx("main")} id="main-content">
        <div className={cx("main-top")}>
          <p>STUDY MANAGEMENT SYSTEM</p>
        </div>

        {/* Home / Dashboard body */}
        <div className={cx("main-body")} id="dashboardHome" ref={mainBodyRef}>
          <div className={cx("main-content")}>
            <div className={cx("image-text-section")}>
              <img
                src="Welcome.svg"
                alt="Classroom Management"
              />
              <div className={cx("text")}>
                <h2>About The System</h2>
                <p>
                  Welcome to Study Management System! This platform empowers
                  students to easily access previous year question papers,
                  syllabus, and other accessories in PDF format. With secure
                  user accounts, you can preview, download, and share study
                  materials directly from frequently updated database
                </p>
                <div className={cx("intro-buttons")}>
                  <button
                    type="button"
                    id="logoutBtn"
                    className={cx("authenticationBtn")}
                    onClick={() => setShowAuthModal(true)}
                  >
                    Dive In
                  </button>

                  <a
                    href="#"
                    id="learnMoreBtn"
                    data-modal="learnMoreModal"
                    onClick={openLearnMore}
                  >
                    Learn More
                  </a>

                  <a href="#" onClick={scrollToFeatures}>
                    Explore Features
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

              <div
                className={cx("features-container")}
                id="features-container-dashboard"
              >
                <div className={cx("feature-box")}>
                  <img
                    src="Pdf.png"
                    alt="PDF Access"
                  />
                  <h3>Instant PDF Access</h3>
                  <p>
                    View and download previous year question papers, syllabus,
                    and other documents in PDF format with just a click
                  </p>
                </div>

                <div className={cx("feature-box")}>
                  <img
                    src="Share.png"
                    alt="Share"
                  />
                  <h3>Easy Sharing</h3>
                  <p>
                    Share study materials with friends and classmates directly
                    from the platform
                  </p>
                </div>

                <div className={cx("feature-box")}>
                  <img
                    src="Smartphone.png"
                    alt="Mobile Friendly"
                  />
                  <h3>Mobile Friendly</h3>
                  <p>
                    Access all features from any device - Desktop, Table or
                    Smartphone
                  </p>
                </div>

                <div className={cx("feature-box")}>
                  <img
                    src="Security.png"
                    alt="Security"
                  />
                  <h3>Advanced Security</h3>
                  <p>
                    Your account and personal data are protected with robust
                    security measures and encryption
                  </p>
                </div>

                <div className={cx("feature-box")}>
                  <img
                    src="Database.png"
                    alt="Frequent Updates"
                  />
                  <h3>Frequently Updated Database</h3>
                  <p>
                    The resource library is actively updated with the latest
                    question papers, syllabus, and notes
                  </p>
                </div>

                <div className={cx("feature-box")}>
                  <img
                    src="Support.png"
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

            {/* FAQ */}
            <FAQ />

            <p className={cx("text-muted")}>
              <i className="far fa-copyright"></i>{" "}
              {new Date().getFullYear()} QNIT. All Rights Reserved.
              <br />
              <span className={cx("divider")}>
                <i className="fas fa-lock"></i> Secured Data
              </span>
              <i className="fas fa-wrench"></i> Made in India
            </p>
          </div>
        </div>
      </main>

      {/* Learn More Modal (React controlled) */}
      <div
        id="learnMoreModal"
        className={`${cx("learnMoreModal")} ${showLearnMore ? "show" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="learnMoreModalTitle"
        onClick={() => setShowLearnMore(false)}
      >
        <div className={cx("modal-content")} onClick={(e) => e.stopPropagation()}>
          <button
            id="closeLearnMoreModal"
            data-close
            aria-label="Close"
            onClick={() => setShowLearnMore(false)}
          >
            &times;
          </button>
          <h2 id="learnMoreModalTitle">Insights of the System</h2>
          <ul>
            <li>
              <strong>Comprehensive Database:</strong> Previous year question
              papers, syllabus, and notes stored as Google Drive links.
            </li>
            <li>
              <strong>Preview & Download:</strong> Instantly preview PDFs before
              downloading or sharing.
            </li>
            <li>
              <strong>Easy Sharing:</strong> Share materials with classmates
              directly from the platform.
            </li>
            <li>
              <strong>Frequent Updates:</strong> Study materials are regularly
              updated for accuracy and relevance.
            </li>
            <li>
              <strong>Advanced Security:</strong> Your personal data is
              protected with robust security measures.
            </li>
            <li>
              <strong>Mobile Friendly:</strong> Access resources from any
              device, anytime.
            </li>
          </ul>
        </div>
      </div>

      {/* AuthModal area (React-driven). Lazy component is parent-controlled */}
      {showAuthModal && (
        <Suspense fallback={null}>
          <AuthModalComponent
            isOpen={showAuthModal}
            onClose={() => setShowAuthModal(false)}
            onConfirm={handleAuthConfirm}
          />
        </Suspense>
      )}
    </div>
  );
}