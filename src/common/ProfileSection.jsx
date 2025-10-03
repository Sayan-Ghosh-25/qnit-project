// src/components/ProfileSection.jsx
import { useEffect, useRef, useState } from "react";
import styles from "./ProfileSection.module.css";

const DEFAULT_PROFILE = {
  username: "Sayan Ghosh",
  stream: "Information Technology",
  academicYear: "3rd",
  section: "A",
  rollNo: "62",
  semester: "5th",
  email: "sayan.ghosh@nit.ac.in",
  phone: "+91 9163756976",
  dob: "",
};

const STORAGE_KEY = "profileData";

export default function ProfileSection() {
  // load initial user data from localStorage (safe)
  const [userData, setUserData] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...DEFAULT_PROFILE, ...JSON.parse(raw) } : { ...DEFAULT_PROFILE };
    } catch (e) {
      console.warn("Failed to parse stored profileData:", e);
      return { ...DEFAULT_PROFILE };
    }
  });

  // formData for editing (controlled)
  const [formData, setFormData] = useState(() => ({ ...userData }));

  // editing flag
  const [isEditing, setIsEditing] = useState(false);

  // which fields should remain non-editable (keeps original behavior)
  const NON_EDITABLE = useRef(new Set(["username", "email", "phone"]));

  // ref to focus first editable input when entering edit mode
  const firstEditableRef = useRef(null);

  // Keep localStorage changes in sync if changed from another tab/window
  useEffect(() => {
    function onStorage(e) {
      if (e.key === STORAGE_KEY) {
        try {
          const newData = e.newValue ? JSON.parse(e.newValue) : null;
          if (newData) {
            setUserData((prev) => ({ ...prev, ...newData }));
            // if not editing, keep formData in sync
            if (!isEditing) setFormData((prev) => ({ ...prev, ...newData }));
          }
        } catch (err) {
          // ignore parse errors
        }
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [isEditing]);

  // if userData changed (e.g., loaded from storage) and we're not editing, sync formData
  useEffect(() => {
    if (!isEditing) setFormData({ ...userData });
  }, [userData, isEditing]);

  // persist data safely to localStorage
  const saveData = (data) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.error("Failed to save profile data:", err);
      window.alert("Unable to save profile to local storage.");
    }
  };

  // Controlled input change handler
  const handleChange = (e) => {
    const { id, value } = e.target;
    if (!id) return;
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  // enter edit mode
  const enableEditing = () => {
    setIsEditing(true);
    setTimeout(() => {
      if (firstEditableRef.current) firstEditableRef.current.focus();
    }, 50);
  };

  // exit edit mode (UI only)
  const disableEditing = () => {
    setIsEditing(false);
  };

  // cancel changes -> restore from saved userData
  const cancelChanges = (e) => {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    setFormData({ ...userData });
    disableEditing();
  };

  // validation rules (keeps original behaviour but explicit)
  function validateAndBuildNewData() {
    const old = { ...userData };
    const next = { ...old };
    let changed = false;

    for (const key of Object.keys(DEFAULT_PROFILE)) {
      // skip non-editable
      if (NON_EDITABLE.current.has(key)) continue;

      const prevValue = (old[key] || "").toString().trim();
      const currentValue = ((formData[key] || "") + "").toString().trim();

      // disallow clearing a previously non-empty field (preserve original behaviour)
      if (currentValue === "" && prevValue !== "") {
        window.alert(`Field "${key}" Cannot Be Left Blank!`);
        // focus the offending input if it's present
        const input = document.getElementById(key);
        if (input) input.focus();
        return { ok: false };
      }
      next[key] = currentValue;

      if (prevValue.localeCompare(currentValue, undefined, { sensitivity: "accent" }) !== 0) {
        changed = true;
      }
    }

    // additional lightweight validations you may want (optional):
    // - rollNo numeric
    if (next.rollNo && !/^\d+$/.test(next.rollNo)) {
      window.alert("Roll No. must be numeric.");
      const el = document.getElementById("rollNo");
      if (el) el.focus();
      return { ok: false };
    }

    // - semester (small sanity)
    if (next.semester && !/^\d+(st|nd|rd|th)?$/i.test(next.semester)) {
    }

    if (!changed) {
      // no edits
      window.alert("No Changes Detected!");
      return { ok: false, noChanges: true };
    }

    return { ok: true, data: next };
  }

  // update handler => validate & persist
  const updateProfile = (e) => {
    if (e && typeof e.preventDefault === "function") e.preventDefault();

    if (!isEditing) {
      window.alert("Nothing To Update!");
      return;
    }

    const res = validateAndBuildNewData();
    if (!res.ok) {
      // if noChanges true, we still disable editing and restore
      if (res.noChanges) {
        setFormData((prev) => ({ ...userData }));
        disableEditing();
      }
      return;
    }

    try {
      saveData(res.data);
      setUserData({ ...res.data });
      setFormData({ ...res.data });
      window.alert("Profile Updated Successfully!");
      disableEditing();
    } catch (err) {
      console.error("Failed to update profile:", err);
      window.alert("Failed to update profile. Please try again.");
    }
  };

  return (
    <section className={styles.profileSection} id="profile-section" aria-label="Profile">
      <h2>User Details</h2>
      <button
        type="button"
        id="peditBtn"
        className={styles.editButton}
        aria-label="Edit Profile"
        onClick={enableEditing}
      >
        <i className="fas fa-pen" />
      </button>

      <table aria-describedby="profile-section">
        <tbody>
          <tr>
            <th scope="row">
              <label htmlFor="username">Name</label>
            </th>
            <td>
              <input
                type="text"
                id="username"
                name="Name"
                maxLength={100}
                disabled
                value={formData.username || ""}
                onChange={handleChange}
              />
            </td>
          </tr>

          <tr>
            <th scope="row">
              <label htmlFor="stream">Stream</label>
            </th>
            <td>
              <input
                type="text"
                id="stream"
                name="Stream"
                maxLength={100}
                disabled={!isEditing}
                value={formData.stream || ""}
                onChange={handleChange}
                ref={(el) => {
                  // set first editable ref on mount
                  if (el && !firstEditableRef.current && !NON_EDITABLE.current.has("stream")) {
                    firstEditableRef.current = el;
                  }
                }}
              />
            </td>
          </tr>

          <tr>
            <th scope="row">
              <label htmlFor="academicYear">Academic Year</label>
            </th>
            <td>
              <input
                type="text"
                id="academicYear"
                name="Academic Year"
                maxLength={10}
                disabled={!isEditing}
                value={formData.academicYear || ""}
                onChange={handleChange}
              />
            </td>
          </tr>

          <tr>
            <th scope="row">
              <label htmlFor="section">Section</label>
            </th>
            <td>
              <input
                type="text"
                id="section"
                name="Section"
                maxLength={10}
                disabled={!isEditing}
                value={formData.section || ""}
                onChange={handleChange}
              />
            </td>
          </tr>

          <tr>
            <th scope="row">
              <label htmlFor="rollNo">Roll No.</label>
            </th>
            <td>
              <input
                type="text"
                id="rollNo"
                name="Roll No"
                maxLength={5}
                disabled={!isEditing}
                value={formData.rollNo || ""}
                onChange={handleChange}
              />
            </td>
          </tr>

          <tr>
            <th scope="row">
              <label htmlFor="semester">Current Semester</label>
            </th>
            <td>
              <input
                type="text"
                id="semester"
                name="Semester"
                maxLength={3}
                disabled={!isEditing}
                value={formData.semester || ""}
                onChange={handleChange}
              />
            </td>
          </tr>

          <tr>
            <th scope="row">
              <label htmlFor="email">Email</label>
            </th>
            <td>
              <input
                type="email"
                id="email"
                name="Email"
                maxLength={50}
                disabled
                value={formData.email || ""}
                onChange={handleChange}
              />
            </td>
          </tr>

          <tr>
            <th scope="row">
              <label htmlFor="phone">Phone Number</label>
            </th>
            <td>
              <input
                type="tel"
                id="phone"
                name="Phone"
                maxLength={15}
                disabled
                value={formData.phone || ""}
                onChange={handleChange}
              />
            </td>
          </tr>

          <tr>
            <th scope="row">
              <label htmlFor="dob">Date of Birth</label>
            </th>
            <td>
              <input
                type="date"
                id="dob"
                name="DOB"
                disabled={!isEditing}
                value={formData.dob || ""}
                onChange={handleChange}
              />
            </td>
          </tr>
        </tbody>
      </table>

      <div className={styles.profileSectionButtons}>
        <button
          type="button"
          id="updateBtn"
          className={styles.updateButton}
          onClick={updateProfile}
          disabled={!isEditing}
        >
          Update
        </button>

        <button
          type="button"
          id="cancelBtn"
          className={styles.cancelButton}
          onClick={cancelChanges}
          disabled={!isEditing}
        >
          Cancel
        </button>
      </div>
    </section>
  );
}