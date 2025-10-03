// src/components/ProfileSection.jsx
import { useEffect, useRef, useState } from "react";
import styles from "./ProfileSection.module.css";
import { supabase } from "@/lib/supabaseClient";

const NON_EDITABLE = new Set(["username", "email", "phone"]);
export default function ProfileSection() {
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [profile, setProfile] = useState({
    full_name: "",
    stream: "",
    year_of_study: "",
    semester: "",
    email: "",
    contact: "",
    dob: null,
  });

  const [formData, setFormData] = useState({
    full_name: "",
    stream: "",
    year_of_study: "",
    semester: "",
    email: "",
    contact: "",
    dob: "",
  });

  const firstEditableRef = useRef(null);

  // helper to get client JWT access token
  async function getAccessToken() {
    try {
      if (supabase?.auth?.getSession) {
        const { data } = await supabase.auth.getSession();
        return data?.session?.access_token || null;
      }
      if (typeof supabase.auth?.session === "function") {
        const s = supabase.auth.session();
        return s?.access_token || s?.accessToken || null;
      }
      return null;
    } catch (err) {
      console.warn("Failed to get access token:", err);
      return null;
    }
  }

  // fetch profile from backend
  useEffect(() => {
    let cancelled = false;
    async function fetchProfile() {
      setLoading(true);
      try {
        const token = await getAccessToken();
        if (!token) {
          // user not logged in: keep empty/default
          if (!cancelled) setLoading(false);
          return;
        }
        const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
        const url = `${API_BASE}/user/me/profile`;
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        });
        if (!res.ok) {
          console.warn("Failed to fetch profile:", res.status);
          if (!cancelled) setLoading(false);
          return;
        }
        const payload = await res.json();
        const p = payload?.profile || {};
        // normalize
        const normalized = {
          full_name: p.full_name || "",
          stream: p.stream || "",
          year_of_study: p.year_of_study || "",
          semester: p.semester || "",
          email: p.email || "",
          contact: p.contact || "",
          dob: p.dob ? (typeof p.dob === "string" ? p.dob : p.dob) : "",
        };
        if (!cancelled) {
          setProfile(normalized);
          setFormData({
            full_name: normalized.full_name,
            stream: normalized.stream,
            year_of_study: normalized.year_of_study,
            semester: normalized.semester,
            email: normalized.email,
            contact: normalized.contact,
            dob: normalized.dob || "",
          });
        }
      } catch (err) {
        console.error("Error fetching profile:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  // controlled inputs
  const handleChange = (e) => {
    const { id, value } = e.target;
    if (!id) return;
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const enableEditing = () => {
    setIsEditing(true);
    setTimeout(() => {
      if (firstEditableRef.current) firstEditableRef.current.focus();
    }, 50);
  };

  const disableEditing = () => setIsEditing(false);

  const cancelChanges = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setFormData({
      full_name: profile.full_name,
      stream: profile.stream,
      year_of_study: profile.year_of_study,
      semester: profile.semester,
      email: profile.email,
      contact: profile.contact,
      dob: profile.dob || "",
    });
    disableEditing();
  };

  // Validation + prepare update object
  function validateAndBuildUpdate() {
    const next = { ...profile };
    let changed = false;

    // stream
    const streamPrev = (profile.stream || "").toString().trim();
    const streamCur = (formData.stream || "").toString().trim();
    if (streamCur === "" && streamPrev !== "") {
      window.alert("Stream Cannot Be Left Blank!");
      const el = document.getElementById("stream");
      if (el) el.focus();
      return { ok: false };
    }
    next.stream = streamCur;
    if (streamPrev.localeCompare(streamCur, undefined, { sensitivity: "accent" }) !== 0) {
      changed = true;
    }

    // academic year === year_of_study
    const prevYear = (profile.year_of_study || "").toString().trim();
    const curYear = (formData.year_of_study || "").toString().trim();
    if (curYear === "" && prevYear !== "") {
      window.alert("Academic Year Cannot Be Left Blank!");
      const el = document.getElementById("academicYear");
      if (el) el.focus();
      return { ok: false };
    }
    next.year_of_study = curYear;
    if (prevYear.localeCompare(curYear, undefined, { sensitivity: "accent" }) !== 0) changed = true;

    // semester
    const prevSem = (profile.semester || "").toString().trim();
    const curSem = (formData.semester || "").toString().trim();
    if (curSem === "" && prevSem !== "") {
      window.alert("Semester Cannot Be Left Blank!");
      const el = document.getElementById("semester");
      if (el) el.focus();
      return { ok: false };
    }
    if (curSem) {
      const ok = /^\d+(st|nd|rd|th)?$/i.test(curSem);
      if (!ok) {
        window.alert("Semester must be in format like '5th' or '6th'.");
        const el = document.getElementById("semester");
        if (el) el.focus();
        return { ok: false };
      }
    }
    next.semester = curSem;
    if (prevSem.localeCompare(curSem, undefined, { sensitivity: "accent" }) !== 0) changed = true;

    // dob
    const prevDob = profile.dob ? profile.dob.toString() : "";
    const curDob = (formData.dob || "").toString().trim(); // expect YYYY-MM-DD from date input
    // if trying to clear a previously non-empty dob -> disallow
    if ((curDob === "" || curDob === null) && prevDob) {
      window.alert("Date of Birth cannot be cleared once set!");
      const el = document.getElementById("dob");
      if (el) el.focus();
      return { ok: false };
    }
    // basic date validity check if provided
    if (curDob) {
      // allow formats like YYYY-MM-DD (normal) or DD-MM-YYYY (some browsers/locale)
      let normalized = curDob;
      if (/^\d{2}-\d{2}-\d{4}$/.test(curDob)) {
        // dd-mm-yyyy -> convert
        const [d, m, y] = curDob.split("-");
        normalized = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      }
      // verify
      const dateObj = new Date(normalized);
      if (Number.isNaN(dateObj.getTime())) {
        window.alert("Invalid Date of Birth.");
        const el = document.getElementById("dob");
        if (el) el.focus();
        return { ok: false };
      }
      if (normalized !== prevDob) changed = true;
      next.dob = normalized;
    } else {
      next.dob = prevDob || "";
    }

    if (!changed) {
      window.alert("No Changes Detected!");
      return { ok: false, noChanges: true };
    }

    // build payload mapping to DB column names
    const payload = {
      stream: next.stream || null,
      year_of_study: next.year_of_study || null,
      semester: next.semester || null,
      dob: next.dob || null,
    };

    return { ok: true, payload };
  }

  // Submit update to backend
  const updateProfile = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!isEditing) {
      window.alert("Nothing To Update!");
      return;
    }

    const res = validateAndBuildUpdate();
    if (!res.ok) {
      if (res.noChanges) {
        setFormData({
          full_name: profile.full_name,
          stream: profile.stream,
          year_of_study: profile.year_of_study,
          semester: profile.semester,
          email: profile.email,
          contact: profile.contact,
          dob: profile.dob || "",
        });
        disableEditing();
      }
      return;
    }

    try {
      const token = await getAccessToken();
      if (!token) {
        window.alert("You are not signed in.");
        return;
      }
      const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
      const url = `${API_BASE}/user/me/profile`;
      const resp = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(res.payload),
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        const errMsg = body?.error || `Update failed (${resp.status})`;
        window.alert(errMsg);
        return;
      }

      const payload = await resp.json();
      const updated = payload?.profile || {};

      setProfile({
        full_name: updated.full_name || profile.full_name,
        stream: updated.stream || "",
        year_of_study: updated.year_of_study || "",
        semester: updated.semester || "",
        email: updated.email || profile.email,
        contact: updated.contact || profile.contact,
        dob: updated.dob || "",
      });

      setFormData({
        full_name: updated.full_name || profile.full_name,
        stream: updated.stream || "",
        year_of_study: updated.year_of_study || "",
        semester: updated.semester || "",
        email: updated.email || profile.email,
        contact: updated.contact || profile.contact,
        dob: updated.dob || "",
      });

      window.alert("Profile Updated Successfully!");
      disableEditing();
    } catch (err) {
      console.error("Failed to update profile:", err);
      window.alert("Failed to update profile! Please try again");
    }
  };

  return (
    <section className={styles.profileSection} id="profile-section" aria-label="Profile">
      <h2>User Details</h2>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          type="button"
          id="peditBtn"
          className={styles.editButton}
          aria-label="Edit Profile"
          onClick={enableEditing}
          disabled={loading}
        >
          <i className="fas fa-pen" />
        </button>
      </div>

      {loading ? (
        <p>Loading profile…</p>
      ) : (
        <>
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
                    value={formData.full_name || ""}
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
                      if (el && !firstEditableRef.current) firstEditableRef.current = el;
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
                    value={formData.year_of_study || ""}
                    onChange={(e) => {
                      // map academicYear -> year_of_study
                      setFormData((prev) => ({ ...prev, year_of_study: e.target.value }));
                    }}
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
                    maxLength={6}
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
                    value={formData.contact || ""}
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
        </>
      )}
    </section>
  );
}