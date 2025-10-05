// src/common/SettingsSection.jsx
import styles from "./SettingsSection.module.css";
import { useState, useEffect, useRef, useCallback, Suspense, lazy } from "react";
import { useTheme } from "@/context/ThemeContext";
import { useNavigate, Routes, Route, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

// Lazy load modals
const LogoutModalComponent = lazy(() => import("@/common/LogoutModal.jsx"));
const ChangePassword = lazy(() => import("@/common/ChangePassword.jsx"));

// Small presentational fallback used within Suspense while a component loads
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

// Helper to compose class names in a safe way
function cx(...names) {
  return names
    .filter(Boolean)
    .map((n) => (styles && styles[n] ? styles[n] : n))
    .join(" ");
}

export default function SettingsSection({ onAccountDelete }) {
  const { lightMode, toggle: toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth() || {};

  // State for Delete Account modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const modalRef = useRef(null);
  const confirmBtnRef = useRef(null);

  // State for Logout modal
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // Determine if ChangePassword route is active
  const isChangePasswordRoute =
    location.pathname === "/User/Dashboard/SettingsSection/ChangePassword";

  // Effect for Delete Account modal
  useEffect(() => {
    try {
      if (deleteModalOpen || showLogoutModal || isChangePasswordRoute) {
        document.body.classList.add("modal-open");
        if (deleteModalOpen) {
          setTimeout(() => confirmBtnRef.current?.focus?.(), 30);
        }
      } else {
        document.body.classList.remove("modal-open");
      }
    } catch (err) {
      // ignore (server-side or restricted env)
    }
    return () => {
      try {
        document.body.classList.remove("modal-open");
      } catch (e) {}
    };
  }, [deleteModalOpen, showLogoutModal, isChangePasswordRoute]);

  // ESC to close any active modal/route overlay
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") {
        if (deleteModalOpen) setDeleteModalOpen(false);
        if (showLogoutModal) setShowLogoutModal(false);
        if (isChangePasswordRoute) navigate("/User/Dashboard/SettingsSection");
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [deleteModalOpen, showLogoutModal, isChangePasswordRoute, navigate]);

  // Click on backdrop closes modal
  const onBackdropClick = (e) => {
    if (e.target === modalRef.current) {
      setDeleteModalOpen(false);
    }
  };

  // Safe clearing of user-like localStorage keys
  const safeClearUserData = useCallback(() => {
    try {
      const keysToKeep = [];
      const dangerousKeyPattern =
        /(profile|feedback|auth|token|session|user|credential|login)/i;
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (keysToKeep.includes(k)) continue;
        if (dangerousKeyPattern.test(k)) toRemove.push(k);
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
    } catch (err) {
      // ignore if localStorage unavailable
    }
  }, []);

  // Confirm deletion handler
  const onConfirmDelete = useCallback(() => {
    setDeleteModalOpen(false);
    safeClearUserData();

    try {
      alert("Your Account Has Been Deleted!");
    } catch (err) {}

    if (typeof onAccountDelete === "function") {
      try {
        onAccountDelete();
        return;
      } catch (err) {
        // if it fails, fallback to redirect below
      }
    }
    // Fallback if onAccountDelete not provided or fails
    navigate("/");
  }, [onAccountDelete, safeClearUserData, navigate]);

  // Logout modal handlers
  const openLogoutModal = useCallback(() => setShowLogoutModal(true), []);
  const handleLogoutConfirm = useCallback(async () => {
    setShowLogoutModal(false);

    try {
      await logout?.();
    } catch (err) {
      console.error("Logout failed:", err);
      // Even if logout fails, still clear the client state
    }

    try {
      sessionStorage.clear();
      const keys = ["sb-", "session", "profile", "auth", "user", "token", "_grecaptcha"];
      keys.forEach((k) => {
        if (k.startsWith('sb-')) {
          for (let i = 0; i < localStorage.length; i++) {
            const currentKey = localStorage.key(i);
            if (currentKey && currentKey.startsWith(k)) {
              localStorage.removeItem(currentKey);
            }
          }
        } else {
          // Remove specific keys
          localStorage.removeItem(k);
        }
      });
    } catch (e) {
      console.error("Error clearing local/session storage:", e);
    }

    try {
      if (window.history.pushState) {
        window.history.pushState(null, '', window.location.href);
        window.history.go(1);
      }
    } catch (e) {
      console.warn("Could not manipulate browser history:", e);
    }

    navigate("/", { replace: true });

  }, [logout, navigate]);

  return (
    <>
      <Routes>
        <Route
          index
          element={
            // Settings Section - Main content
            <section
              className={styles.settingsSection}
              id="settings-section"
              aria-label="Settings"
            >
              <h2>Settings</h2>

              {/* Theme Settings */}
              <div
                className={styles.settingsContainer}
                aria-labelledby="theme-heading"
              >
                <h4 id="theme-heading">Theme</h4>
                <div className={styles.compartment}>
                  <label htmlFor="themeSwitch">Light Theme</label>

                  <label className={styles.switch} aria-hidden="false">
                    <input
                      id="themeSwitch"
                      type="checkbox"
                      checked={!!lightMode}
                      onChange={() => toggleTheme()}
                      aria-checked={!!lightMode}
                    />
                    <span className={styles.slider} />
                  </label>
                </div>
              </div>

              <div
                className={styles.settingsContainer}
                aria-labelledby="account-heading"
              >
                <h4 id="account-heading">Manage Account</h4>

                {/* Account Settings - Change Password */}
                <div className={styles.compartment}>
                  <label htmlFor="changePassword">Change Password</label>
                  <button
                    id="changePassword"
                    aria-haspopup="dialog"
                    aria-controls="change-modal"
                    onClick={() =>
                      navigate("/User/Dashboard/SettingsSection/ChangePassword")
                    } // Navigate to sub-route
                  >
                    <i
                      className="fas fa-pen"
                      aria-hidden="true"
                      style={{ color: "#00e6b0ff" }}
                    />
                  </button>
                </div>

                {/* Account Settings - Delete Account */}
                <div
                  className={styles.compartment}
                  style={{
                    marginTop: "1rem",
                    borderTop: "0.5px solid #57caff56",
                    paddingTop: "0.9rem",
                  }}
                >
                  <label htmlFor="deleteAccount" style={{ color: "#f44336ed" }}>
                    Delete My Account
                  </label>
                  <button
                    id="deleteAccount"
                    aria-haspopup="dialog"
                    aria-controls="delete-modal"
                    onClick={() => setDeleteModalOpen(true)}
                  >
                    <i className="fas fa-trash" aria-hidden="true" />
                  </button>
                </div>

                {/* Account Settings - Log Out */}
                <div
                  className={styles.compartment}
                  style={{
                    marginTop: "1rem",
                    borderTop: "0.5px solid #57caff56",
                    paddingTop: "0.9rem",
                  }}
                >
                  <label htmlFor="logoutBtn" style={{ color: "#f44336ed" }}>
                    Log Out
                  </label>
                  <button
                    id="logoutBtn"
                    aria-haspopup="dialog"
                    aria-controls="logout-modal"
                    onClick={(e) => {
                      e.preventDefault();
                      openLogoutModal();
                    }}
                  >
                    <i className="fas fa-sign-out-alt" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </section>
          }
        />
        {/* Route For ChangePassword */}
        <Route
          path="ChangePassword"
          element={
            <Suspense fallback={<SpinnerOverlay visible={true} />}>
              <ChangePassword
                onCancel={() => navigate("/User/Dashboard/SettingsSection")}
                onClose={() => navigate("/User/Dashboard/SettingsSection")}
              />
            </Suspense>
          }
        />
        <Route path="*" element={<p>Settings Sub-Section Not Found</p>} />
      </Routes>

      {/* Delete Modal */}
      <div
        id="delete-modal"
        className={`${styles.deleteModal} ${
          deleteModalOpen ? styles.show : styles.hiddenDelete
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-modal-title"
        ref={modalRef}
        onClick={onBackdropClick}
      >
        <div
          className={`${styles.deleteContent} ${deleteModalOpen ? "" : ""}`}
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="delete-modal-title">Confirm Deletion</h2>
          <p>Are you sure you want to delete your account?</p>

          <div className={styles.deleteActions}>
            <button
              id="confirm-delete"
              className={styles.deleteBtn}
              onClick={onConfirmDelete}
              ref={confirmBtnRef}
            >
              Delete
            </button>

            <button
              id="cancel-delete"
              className={styles.cancelBtn}
              onClick={() => setDeleteModalOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      {/* Logout Modal Area (React-driven) */}
      {showLogoutModal && (
        <Suspense fallback={null}>
          <LogoutModalComponent
            isOpen={showLogoutModal}
            onClose={() => setShowLogoutModal(false)}
            onConfirm={handleLogoutConfirm}
          />
        </Suspense>
      )}
    </>
  );
}
