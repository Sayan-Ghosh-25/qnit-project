// src/components/ProfileSection.jsx
import { useEffect, useRef, useState } from "react";
import styles from "./ProfileSection.module.css";
import { supabase } from "@/lib/supabaseClient";
import { useProfile } from "@/context/ProfileContext";

export default function ProfileSection() {
  const { profile, setProfile, loading: profileLoading } = useProfile();
  const [loading, setLoading] = useState(profileLoading);
  const [isEditing, setIsEditing] = useState(false);
  const [updating, setUpdating] = useState(false);

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

  // sync local formData when context profile changes
  useEffect(() => {
    setFormData({
      full_name: profile.full_name || "",
      stream: profile.stream || "",
      year_of_study: profile.year_of_study || "",
      semester: profile.semester || "",
      email: profile.email || "",
      contact: profile.contact || "",
      dob: profile.dob || "",
    });
    setLoading(profileLoading);
  }, [profile, profileLoading]);

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

  // Normalize DOB helper
  function normalizeDobInput(input) {
    if (!input) return null;
    const s = String(input).trim();
    if (s === "") return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
      const [d, m, y] = s.split("-");
      return `${y}-${m}-${d}`;
    }
    const parsed = new Date(s);
    if (!Number.isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const mm = `${parsed.getMonth() + 1}`.padStart(2, "0");
      const dd = `${parsed.getDate()}`.padStart(2, "0");
      return `${y}-${mm}-${dd}`;
    }
    return null;
  }

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

  // Build payload & validate
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
    if (streamPrev.localeCompare(streamCur, undefined, { sensitivity: "accent" }) !== 0) changed = true;

    // year_of_study
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
    const curDobRaw = (formData.dob || "").toString().trim();
    if ((curDobRaw === "" || curDobRaw === null) && prevDob) {
      window.alert("Date of Birth cannot be cleared once set!");
      const el = document.getElementById("dob");
      if (el) el.focus();
      return { ok: false };
    }
    if (curDobRaw) {
      const normalized = normalizeDobInput(curDobRaw);
      if (!normalized) {
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

    const payload = {
      stream: next.stream || null,
      year_of_study: next.year_of_study || null,
      semester: next.semester || null,
      dob: next.dob || null,
    };

    return { ok: true, payload, optimisticProfile: next };
  }

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

    const { payload, optimisticProfile } = res;
    const prevProfile = { ...profile };

    // optimistic update in shared context (so other components update immediately)
    setProfile((p) => ({ ...p, ...optimisticProfile }));
    setFormData((f) => ({
      ...f,
      stream: optimisticProfile.stream,
      year_of_study: optimisticProfile.year_of_study,
      semester: optimisticProfile.semester,
      dob: optimisticProfile.dob || "",
    }));
    setUpdating(true);

    try {
      const token = await getAccessToken();
      if (!token) {
        window.alert("You are not signed in");
        // rollback
        setProfile(prevProfile);
        setFormData({
          full_name: prevProfile.full_name,
          stream: prevProfile.stream,
          year_of_study: prevProfile.year_of_study,
          semester: prevProfile.semester,
          email: prevProfile.email,
          contact: prevProfile.contact,
          dob: prevProfile.dob || "",
        });
        setUpdating(false);
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
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        const errMsg = body?.error || `Update failed (${resp.status})`;
        // rollback and show error
        setProfile(prevProfile);
        setFormData({
          full_name: prevProfile.full_name,
          stream: prevProfile.stream,
          year_of_study: prevProfile.year_of_study,
          semester: prevProfile.semester,
          email: prevProfile.email,
          contact: prevProfile.contact,
          dob: prevProfile.dob || "",
        });
        window.alert(errMsg);
        setUpdating(false);
        return;
      }

      // server response (authoritative)
      const payloadResp = await resp.json();
      const updated = payloadResp?.profile || {};

      const normalizedUpdated = {
        full_name: updated.full_name || prevProfile.full_name,
        stream: updated.stream ?? prevProfile.stream ?? "",
        year_of_study: updated.year_of_study ?? prevProfile.year_of_study ?? "",
        semester: updated.semester ?? prevProfile.semester ?? "",
        email: updated.email ?? prevProfile.email ?? "",
        contact: updated.contact ?? prevProfile.contact ?? "",
        dob: updated.dob ?? prevProfile.dob ?? "",
      };

      // set authoritative profile in context
      setProfile(normalizedUpdated);
      setFormData({
        full_name: normalizedUpdated.full_name,
        stream: normalizedUpdated.stream,
        year_of_study: normalizedUpdated.year_of_study,
        semester: normalizedUpdated.semester,
        email: normalizedUpdated.email,
        contact: normalizedUpdated.contact,
        dob: normalizedUpdated.dob || "",
      });

      // other components can listen to the context change
      window.alert("Profile Updated Successfully!");
      disableEditing();
    } catch (err) {
      console.error("Failed to update profile:", err);
      // rollback
      setProfile(prevProfile);
      setFormData({
        full_name: prevProfile.full_name,
        stream: prevProfile.stream,
        year_of_study: prevProfile.year_of_study,
        semester: prevProfile.semester,
        email: prevProfile.email,
        contact: prevProfile.contact,
        dob: prevProfile.dob || "",
      });
      window.alert("Failed to update profile! Please try again");
    } finally {
      setUpdating(false);
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
          disabled={loading || updating}
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
                    disabled={!isEditing || updating}
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
                    disabled={!isEditing || updating}
                    value={formData.year_of_study || ""}
                    onChange={(e) => {
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
                    disabled={!isEditing || updating}
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
                    disabled={!isEditing || updating}
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
              disabled={!isEditing || updating}
            >
              {updating ? "Updating..." : "Update"}
            </button>

            <button
              type="button"
              id="cancelBtn"
              className={styles.cancelButton}
              onClick={cancelChanges}
              disabled={!isEditing || updating}
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </section>
  );
}