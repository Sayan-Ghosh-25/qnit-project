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
        'After logging in, browse the available question papers or syllabus. Click on the preview to view the document, and then download or save it to your device.',
    },
    {
      q: "Can I upload study materials here?",
      a:
        "Uploading study materials is only allowed for system administrators, normal users don't have that right."
    },
    {
      q: "Is my personal data safe?",
      a:
        "Absolutely! We use advanced security measures and encryption to keep user account and personal information safe.",
    },
    {
      q: "How often is the database updated?",
      a:
        "We update our database regularly with the latest question papers, syllabus, and other accessories to ensure you always have access to the current materials.",
    },
    {
      q: "Can I invite my friends to this platform?",
      a:
        "Unfortunately, you can't add your friends or cousins to this platfrom who are not part of your college department.",
    },
    {
      q: "Who can I reach out to for any query or support?",
      a:
        'Use the in-Platform feedback section to share your experience or reach out to our team through the contact shared.',
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
  const mainBodyRef = useRef(null);

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
          <p>QNIT &#10038; All Your Study Needs</p>
        </div>

        {/* Home / Dashboard body */}
        <div className={cx("main-body")} id="dashboardHome" ref={mainBodyRef}>
          <div className={cx("main-content")}>
            <div className={cx("image-text-section")}>
              <img
                src="/Welcome.svg"
                alt="Welcome Image"
              />
              <div className={cx("text")}>
                <h2>About The System</h2>
                <p>
                QNIT is a comprehensive study management platform designed to make learning simple and accessible. Students can instantly explore semester-wise study materials. With options to preview, download, and share resources anytime, anywhere, QNIT ensures seamless access to the right materials at the right time
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
                Experience a feature riched software embedded
                with exceptional features required to deliver an extraordinary
                learning experience
              </p>

              <div
                className={cx("features-container")}
                id="features-container-dashboard"
              >
                <div className={cx("feature-box")}>
                  <img
                    src="/Pdf.png"
                    alt="PDF Access"
                  />
                  <h3>Instant PDF Access</h3>
                  <p>
                    View or Download previous year questions, syllabus,
                    and other documents in PDF format
                  </p>
                </div>

                <div className={cx("feature-box")}>
                  <img
                    src="/Share.svg"
                    alt="Share"
                  />
                  <h3>Easy Sharing</h3>
                  <p>
                    Share study materials with friends and classmates directly
                    from the platform with embedded links
                  </p>
                </div>

                <div className={cx("feature-box")}>
                  <img
                    src="/Multi Devices.png"
                    alt="Cross Device Compatibility"
                  />
                  <h3>Cross Device Compatibility</h3>
                  <p>
                    Access all the features of the platfrom from any device - Desktop, Tablet or
                    Smartphone
                  </p>
                </div>

                <div className={cx("feature-box")}>
                  <img
                    src="/News.svg"
                    alt="News"
                  />
                  <h3>Dedicated News Service</h3>
                  <p>
                    Stay updated with the latest global updates and trends shaping the fast-growing software industry
                  </p>
                </div>

                <div className={cx("feature-box")}>
                  <img
                    src="/Puzzle.svg"
                    alt="Game Arena"
                  />
                  <h3>Mind Refreshing Games</h3>
                  <p>
                    In-Platform Game Arena that provides mind refreshment and stress-free enjoyment
                  </p>
                </div>

                <div className={cx("feature-box")}>
                  <img
                    src="/Theme.png"
                    alt="Theme"
                  />
                  <h3>Theme Switch</h3>
                  <p>
                    Seamless theme switching option to let user choose their preference between various themes
                  </p>
                </div>
              </div>
            </section>

            {/* FAQ */}
            <FAQ />

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
      </main>

      {/* Learn More Modal (React controlled) */}
      <div
        id="learnMoreModal"
        className={cx("learnMoreModal", showLearnMore && "show")}
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
              <strong>Authorized Access:</strong> Only verified college students can create accounts, ensuring study materials remain exclusive and secure from external users.
            </li>
            <li style={{ marginTop: "0.5rem" }}></li>
            <li>
              <strong>Comprehensive Account Control:</strong> Users have full control over their accounts, including the ability to update personal details or permanently delete their profile at any time.
            </li>
            <li style={{ marginTop: "0.5rem" }}></li>
            <li>
              <strong>Regular Content Updates:</strong> Study materials are frequently refreshed with the latest information to maintain accuracy, reliability, and relevance.
            </li>
            <li style={{ marginTop: "0.5rem" }}></li>
            <li>
              <strong>Enhanced Data Security:</strong> Advanced security measures protect all user data and personal information, minimizing any risk of data breaches or unauthorized access.
            </li>
            <li style={{ marginTop: "0.5rem" }}></li>
            <li>
              <strong>24&times;7 Support & Feedback:</strong> A dedicated support system is available around the clock to assist users and continuously enhance their overall experience.
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