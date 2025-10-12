// src/common/SettingsSection.jsx
import styles from "./SettingsSection.module.css";
import { useState, useEffect, useCallback, Suspense, lazy } from "react";
import { useTheme } from "@/context/ThemeContext";
import { useNavigate, Routes, Route, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

// Load modals/components
import LogoutModalComponent from "@/common/LogoutModal.jsx";
import ChangePassword from "@/common/ChangePassword.jsx";
const AccountDeleteComponent = lazy(() => import("@/common/AccountDelete.jsx"));

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

  // Only keep the open/close state for the delete modal here.
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const isChangePasswordRoute = location.pathname.includes("/SettingsSection/ChangePassword");

  // Manage global 'modal-open' class
  useEffect(() => {
    try {
      if (showLogoutModal || isChangePasswordRoute) {
        document.body.classList.add("modal-open");
      } else {
        document.body.classList.remove("modal-open");
      }
    } catch {}
    return () => {
      try {
        document.body.classList.remove("modal-open");
      } catch {}
    };
  }, [showLogoutModal, isChangePasswordRoute]);

  // Escape handling
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") {
        if (showLogoutModal) setShowLogoutModal(false);
        if (isChangePasswordRoute) navigate(baseParentPath);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showLogoutModal, isChangePasswordRoute, navigate, baseParentPath]);

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

      {/* Account Delete Modal */}
      {deleteModalOpen && (
        <Suspense fallback={null}>
          <AccountDeleteComponent
            isOpen={deleteModalOpen}
            onClose={() => setDeleteModalOpen(false)}
            onAccountDelete={onAccountDelete}
          />
        </Suspense>
      )}

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
