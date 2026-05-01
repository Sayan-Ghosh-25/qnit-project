import styles from './LogoutModal.module.css'
export default function LogoutModal({ isOpen, onClose, onConfirm }) {
  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className={styles.logoutModal}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
    >
      <div className={styles.logoutContent} onClick={(e) => e.stopPropagation()}>
        <h2>Confirm Logout</h2>
        <p>Are you sure you want to log out?</p>
        <div className={styles.logoutActions}>
          <button
            className={styles.logoutBtn}
            onClick={() => {
              if (typeof onConfirm === "function") onConfirm();
            }}
          >
            Logout
          </button>

          <button
            className={styles.cancelBtn}
            onClick={() => {
              if (typeof onClose === "function") onClose();
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}