import styles from './SettingsSection.module.css'
import { useState, useEffect, useRef, useCallback } from "react";
import { useTheme } from "@/context/ThemeContext";

export default function SettingsSection({ onAccountDelete, openOverlay, openLogoutModal  }) {
  const { lightMode, toggle: toggleTheme } = useTheme();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const modalRef = useRef(null);
  const confirmBtnRef = useRef(null);

  useEffect(() => {
    try {
      if (deleteModalOpen) {
        document.body.classList.add("modal-open");
        // Focus the confirm button a tick after modal appears
        setTimeout(() => confirmBtnRef.current?.focus?.(), 30);
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
  }, [deleteModalOpen]);

  // ESC to close
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape" && deleteModalOpen) setDeleteModalOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [deleteModalOpen]);

  // Click on backdrop closes modal (if click target is overlay)
  const onBackdropClick = (e) => {
    if (e.target === modalRef.current) {
      setDeleteModalOpen(false);
    }
  };

  // Safe clearing of user-like localStorage keys (avoid clearing unrelated keys)
  const safeClearUserData = useCallback(() => {
    try {
      const keysToKeep = []; // add guaranteed-keep keys here if needed
      const dangerousKeyPattern = /(profile|feedback|auth|token|session|user|credential|login)/i;
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (keysToKeep.includes(k)) continue;
        if (dangerousKeyPattern.test(k)) toRemove.push(k);
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
    } catch (err) {
      // localStorage might be unavailable — ignore
    }
  }, []);

  // Confirm deletion handler
  const onConfirmDelete = useCallback(() => {
    setDeleteModalOpen(false);
    // Clear likely user data to protect privacy
    safeClearUserData();

    // Inform user (in production do server-side deletion)
    try {
      alert("Your Account Has Been Deleted!");
    } catch (err) {}

    // If parent passed a handler, call it (e.g. to navigate via router)
    if (typeof onAccountDelete === "function") {
      try {
        onAccountDelete();
        return;
      } catch (err) {
        // if it fails, fallback to redirect below
      }
    }

  }, [onAccountDelete, safeClearUserData]);

  return (
    <>
      {/* Settings Section */}
      <section
        className={styles.settingsSection}
        id="settings-section"
        aria-label="Settings">
        <h2>Settings</h2>
  
        {/* Theme Settings */}
        <div className={styles.settingsContainer} aria-labelledby="theme-heading">
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
  
        <div className={styles.settingsContainer} aria-labelledby="account-heading">
          <h4 id="account-heading">Manage Account</h4>
          
          {/* Account Settings - Change Password */}
          <div className={styles.compartment}>
            <label htmlFor="changePassword">Change Password</label>
            <button
              id="changePassword"
              aria-haspopup="dialog"
              aria-controls="change-modal"
              onClick={() => {
                if (typeof openOverlay === "function") {
                  openOverlay("ChangePassword");
                  return;
                }}}
            >
              <i className="fas fa-pen" aria-hidden="true" style={{color: '#00e6b0ff'}}/>
            </button>
          </div>
          
          {/* Account Settings - Delete Account */}
          <div className={styles.compartment} style={{ marginTop: '1rem', borderTop: '0.5px solid #57caff56', paddingTop: '0.9rem' }}>
            <label htmlFor="deleteAccount" style={{color: '#f44336ed'}}>Delete My Account</label>
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
          <div className={styles.compartment} style={{ marginTop: '1rem', borderTop: '0.5px solid #57caff56', paddingTop: '0.9rem' }}>
            <label htmlFor="logoutBtn" style={{color: '#f44336ed'}}>Log Out</label>
            <button
              id="logoutBtn"
              aria-haspopup="dialog"
              aria-controls="logout-modal"
              onClick={(e) => {e.preventDefault();
                if (typeof openLogoutModal === "function") {
                  openLogoutModal();
                } else {
                  console.warn("openLogoutModal not provided");
                }}}>
              <i className="fas fa-sign-out-alt" aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>
  
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
    </>
  );  
}