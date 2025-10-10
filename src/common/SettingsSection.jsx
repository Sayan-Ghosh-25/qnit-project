// src/common/SettingsSection.jsx
import styles from "./SettingsSection.module.css";
import { useState, useEffect, useRef, useCallback, Suspense, lazy } from "react";
import { useTheme } from "@/context/ThemeContext";
import { useNavigate, Routes, Route, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

// Lazy load modals/components
const LogoutModalComponent = lazy(() => import("@/common/LogoutModal.jsx"));
const ChangePassword = lazy(() => import("@/common/ChangePassword.jsx"));

// Skeleton Loader for ChangePassword lazy loading
function ChangePasswordSkeleton() {
  return (
    <div className={styles.skeletonWrapper}>
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className={styles.skeletonRow}>
          <div className={styles.skeletonLabel}></div>
          <div className={styles.skeletonInput}></div>
        </div>
      ))}
    </div>
  );
}

export default function SettingsSection({ onAccountDelete }) {
  const { lightMode, toggle: toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, userRole } = useAuth() || {};

  const isAdminPath = location.pathname.startsWith("/Admin/");
  const baseParentPath = isAdminPath
    ? "/Admin/Dashboard/SettingsSection"
    : "/User/Dashboard/SettingsSection";

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const modalRef = useRef(null);
  const confirmBtnRef = useRef(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const isChangePasswordRoute = location.pathname.includes("/SettingsSection/ChangePassword");

  useEffect(() => {
    try {
      if (deleteModalOpen || showLogoutModal || isChangePasswordRoute) {
        document.body.classList.add("modal-open");
        if (deleteModalOpen) setTimeout(() => confirmBtnRef.current?.focus?.(), 30);
      } else {
        document.body.classList.remove("modal-open");
      }
    } catch {}
    return () => {
      try {
        document.body.classList.remove("modal-open");
      } catch {}
    };
  }, [deleteModalOpen, showLogoutModal, isChangePasswordRoute]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") {
        if (deleteModalOpen) setDeleteModalOpen(false);
        if (showLogoutModal) setShowLogoutModal(false);
        if (isChangePasswordRoute) navigate(baseParentPath);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [deleteModalOpen, showLogoutModal, isChangePasswordRoute, navigate, baseParentPath]);

  const onBackdropClick = (e) => {
    if (e.target === modalRef.current) setDeleteModalOpen(false);
  };

  const safeClearUserData = useCallback(() => {
    try {
      const keysToKeep = [];
      const dangerousKeyPattern = /(profile|feedback|auth|token|session|user|credential|login)/i;
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (keysToKeep.includes(k)) continue;
        if (dangerousKeyPattern.test(k)) toRemove.push(k);
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
    } catch {}
  }, []);

  const onConfirmDelete = useCallback(() => {
    setDeleteModalOpen(false);
    safeClearUserData();
    try {
      alert("Your Account Has Been Deleted!");
    } catch {}
    if (typeof onAccountDelete === "function") {
      try {
        onAccountDelete();
        return;
      } catch {}
    }
    navigate("/");
  }, [onAccountDelete, safeClearUserData, navigate]);

  const openLogoutModal = useCallback(() => setShowLogoutModal(true), []);
  const handleLogoutConfirm = useCallback(async () => {
    setShowLogoutModal(false);
    try {
      await logout?.();
    } catch (err) {
      console.error("Logout failed:", err);
    }

    try {
      sessionStorage.clear();
      const keys = ["sb-", "session", "profile", "auth", "user", "token", "_grecaptcha"];
      keys.forEach((k) => {
        if (k.startsWith("sb-")) {
          const toRemove = [];
          for (let i = 0; i < localStorage.length; i++) {
            const currentKey = localStorage.key(i);
            if (currentKey && currentKey.startsWith(k)) toRemove.push(currentKey);
          }
          toRemove.forEach((rk) => localStorage.removeItem(rk));
        } else {
          localStorage.removeItem(k);
        }
      });
    } catch (e) {
      console.error("Error clearing local/session storage:", e);
    }

    try {
      if (window.history.pushState) {
        window.history.pushState(null, "", window.location.href);
        window.history.go(1);
      }
    } catch (e) {
      console.warn("Could not manipulate browser history:", e);
    }

    navigate("/", { replace: true });
  }, [logout, navigate]);

  const handleChangePassword = useCallback(() => {
    const isAdmin = (userRole && userRole === "Admin") || isAdminPath;
    const target = isAdmin
      ? "/Admin/Dashboard/SettingsSection/ChangePassword"
      : "/User/Dashboard/SettingsSection/ChangePassword";
    navigate(target);
  }, [userRole, isAdminPath, navigate]);

  return (
    <>
      <Routes>
        <Route
          index
          element={
            <section className={styles.settingsSection} id="settings-section" aria-label="Settings">
              <h2>Settings</h2>

              {/* Theme Settings */}
              <div className={styles.settingsContainer} aria-labelledby="theme-heading">
                <h4 id="theme-heading">Theme</h4>
                <div className={styles.compartment}>
                  <label htmlFor="themeSwitch" style={{ cursor: "pointer" }}>Light Theme</label>
                  <label className={styles.switch}>
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

              {/* Account Settings */}
              <div className={styles.settingsContainer} aria-labelledby="account-heading">
                <h4 id="account-heading">Manage Account</h4>

                {/* Change Password */}
                <div className={styles.compartment}>
                  <label htmlFor="changePassword" style={{ cursor: "pointer" }}>Change Password</label>
                  <button
                    id="changePassword"
                    aria-haspopup="dialog"
                    aria-controls="change-modal"
                    onClick={handleChangePassword}
                  >
                    <i className="fas fa-pen" aria-hidden="true" style={{ color: "#00e6b0ff" }} />
                  </button>
                </div>

                {/* Delete Account */}
                <div
                  className={styles.compartment}
                  style={{ marginTop: "1rem", borderTop: "0.5px solid #57caff56", paddingTop: "0.9rem" }}
                >
                  <label htmlFor="deleteAccount" style={{ color: "#f44336ed", cursor: "pointer" }}>
                    Delete My Account
                  </label>
                  <button id="deleteAccount" aria-haspopup="dialog" aria-controls="delete-modal" onClick={() => setDeleteModalOpen(true)}>
                    <i className="fas fa-trash" aria-hidden="true" />
                  </button>
                </div>

                {/* Log Out */}
                <div
                  className={styles.compartment}
                  style={{ marginTop: "1rem", borderTop: "0.5px solid #57caff56", paddingTop: "0.9rem" }}
                >
                  <label htmlFor="logoutBtn" style={{ color: "#f44336ed", cursor: "pointer" }}>
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
            <Suspense fallback={<ChangePasswordSkeleton />}>
              <ChangePassword
                onCancel={() => navigate(baseParentPath)}
                onClose={() => navigate(baseParentPath)}
              />
            </Suspense>
          }
        />

        <Route path="*" element={<p>Settings Sub-Section Not Found</p>} />
      </Routes>

      {/* Delete Modal */}
      <div
        id="delete-modal"
        className={`${styles.deleteModal} ${deleteModalOpen ? styles.show : styles.hiddenDelete}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-modal-title"
        ref={modalRef}
        onClick={onBackdropClick}
      >
        <div className={styles.deleteContent} onClick={(e) => e.stopPropagation()}>
          <h2 id="delete-modal-title">Confirm Deletion</h2>
          <p>Are you sure you want to delete your account?</p>

          <div className={styles.deleteActions}>
            <button id="confirm-delete" className={styles.deleteBtn} onClick={onConfirmDelete} ref={confirmBtnRef}>
              Delete
            </button>
            <button id="cancel-delete" className={styles.cancelBtn} onClick={() => setDeleteModalOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      </div>

      {/* Logout Modal */}
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
