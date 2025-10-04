// src/components/ProfileSection.jsx
import { useEffect, useRef, useState } from "react";
import styles from "./ProfileSection.module.css";
import { supabase } from "@/lib/supabaseClient";

export default function ProfileSection() {
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [updating, setUpdating] = useState(false);

  // Authoritative profile state
  const [profile, setProfile] = useState({
    full_name: "",
    stream: "",
    year_of_study: "",
    semester: "",
    email: "",
    contact: "",
    dob: "",
  });

  // Draft profile for editing (only exists when isEditing is true)
  const [draftProfile, setDraftProfile] = useState(null);

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

  // Normalize DOB input helper (accepts yyyy-mm-dd or dd-mm-yyyy)
  function normalizeDobInput(input) {
    if (!input) return null;
    const s = String(input).trim();
    if (s === "") return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
      const [d, m, y] = s.split("-");
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
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

  // Fetch profile once on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchProfile() {
      setLoading(true);
      try {
        const token = await getAccessToken();
        if (!token) {
          if (!cancelled) setLoading(false);
          return;
        }
        const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
        const res = await fetch(`${API_BASE}/user/me/profile`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
        if (!res.ok) {
          console.warn("Failed to fetch profile:", res.status);
          if (!cancelled) setLoading(false);
          return;
        }
        const payload = await res.json();
        const p = payload?.profile || {};
        const normalized = {
          full_name: p.full_name || "",
          stream: p.stream || "",
          year_of_study: p.year_of_study || "",
          semester: p.semester || "",
          email: p.email || "",
          contact: p.contact || "",
          dob: p.dob || "",
        };
        if (!cancelled) {
          setProfile(normalized);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // controlled inputs for draftProfile
  const handleChange = (e) => {
    const { id, value } = e.target;
    if (!id || !draftProfile) return;
    setDraftProfile((prev) => ({ ...prev, [id]: value }));
  };

  const enableEditing = () => {
    setDraftProfile({ ...profile });
    setIsEditing(true);
    setTimeout(() => {
      if (firstEditableRef.current) firstEditableRef.current.focus();
    }, 50);
  };

  const disableEditing = () => {
    setIsEditing(false);
    setDraftProfile(null);
  };

  const cancelChanges = (e) => {
    if (e?.preventDefault) e.preventDefault();
    disableEditing();
  };

  // Validation + prepare update object (compares against 'profile' and validates 'draftProfile')
  function validateAndBuildUpdate() {
    if (!draftProfile) return { ok: false };

    const updatePayload = {};
    let changed = false;

    // Stream
    const streamPrev = (profile.stream || "").toString().trim();
    const streamCur = (draftProfile.stream || "").toString().trim();
    if (streamCur === "" && streamPrev !== "") {
      window.alert("Stream Cannot Be Left Blank!");
      const el = document.getElementById("stream");
      if (el) el.focus();
      return { ok: false };
    }
    if (streamPrev.localeCompare(streamCur, undefined, { sensitivity: "accent" }) !== 0) {
      updatePayload.stream = streamCur;
      changed = true;
    }

    // Year of study
    const prevYear = (profile.year_of_study || "").toString().trim();
    const curYear = (draftProfile.year_of_study || "").toString().trim();
    if (curYear === "" && prevYear !== "") {
      window.alert("Academic Year Cannot Be Left Blank!");
      const el = document.getElementById("academicYear");
      if (el) el.focus();
      return { ok: false };
    }
    if (prevYear.localeCompare(curYear, undefined, { sensitivity: "accent" }) !== 0) {
      updatePayload.year_of_study = curYear;
      changed = true;
    }

    // Semester
    const prevSem = (profile.semester || "").toString().trim();
    const curSem = (draftProfile.semester || "").toString().trim();
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
    if (prevSem.localeCompare(curSem, undefined, { sensitivity: "accent" }) !== 0) {
      updatePayload.semester = curSem;
      changed = true;
    }

    // DOB
    const prevDob = profile.dob ? profile.dob.toString() : "";
    const curDobRaw = (draftProfile.dob || "").toString().trim();
    let normalizedCurDob = prevDob;

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
      normalizedCurDob = normalized;
    }

    if (normalizedCurDob !== prevDob) {
      updatePayload.dob = normalizedCurDob;
      changed = true;
    }


    if (!changed) {
      window.alert("No Changes Detected!");
      return { ok: false, noChanges: true };
    }

    // Ensure payload fields are null if empty string as per backend expectation
    const finalPayload = {
      stream: updatePayload.stream ?? null,
      year_of_study: updatePayload.year_of_study ?? null,
      semester: updatePayload.semester ?? null,
      dob: updatePayload.dob ?? null,
    };

    return { ok: true, payload: finalPayload, newProfileState: { ...profile, ...updatePayload } };
  }

  // Submit update to backend and update local state immediately after success
  const updateProfile = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!isEditing || !draftProfile) {
      window.alert("Nothing To Update!");
      return;
    }

    const res = validateAndBuildUpdate();
    if (!res.ok) {
      if (res.noChanges) {
        disableEditing();
      }
      return;
    }

    const { payload, newProfileState } = res;
    setUpdating(true);

    try {
      const token = await getAccessToken();
      if (!token) {
        window.alert("You are not signed in.");
        setUpdating(false);
        return;
      }

      const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
      const resp = await fetch(`${API_BASE}/user/me/profile`, {
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
        window.alert(errMsg);
        // On error, revert draftProfile to original (or simply disable editing)
        disableEditing();
        setUpdating(false);
        return;
      }

      const body = await resp.json();
      const updatedFromServer = body?.profile || null;

      let finalUpdatedProfile;
      if (updatedFromServer) {
        // If server returns an updated profile, use it as authoritative
        finalUpdatedProfile = {
          full_name: updatedFromServer.full_name || profile.full_name,
          stream: updatedFromServer.stream ?? profile.stream,
          year_of_study: updatedFromServer.year_of_study ?? profile.year_of_study,
          semester: updatedFromServer.semester ?? profile.semester,
          email: updatedFromServer.email || profile.email,
          contact: updatedFromServer.contact || profile.contact,
          dob: updatedFromServer.dob ?? profile.dob,
        };
      } else {
        // Fallback to our optimistically built state if server doesn't return full profile
        finalUpdatedProfile = newProfileState;
      }

      setProfile(finalUpdatedProfile);
      disableEditing();

      // optionally notify other parts (if they listen)
      try {
        window.dispatchEvent(new CustomEvent("qnit:profile-updated", { detail: finalUpdatedProfile }));
      } catch (e) {}

      window.alert("Profile Updated Successfully!");

    } catch (err) {
      console.error("Failed to update profile:", err);
      window.alert("Failed to update profile! Please try again");
      disableEditing();
    } finally {
      setUpdating(false);
    }
  };

  // Determine which profile object to use for rendering
  // If editing, use draftProfile for inputs, else use the authoritative 'profile'
  const currentProfileData = isEditing ? draftProfile : profile;

  if (!currentProfileData) {
    return <p>Loading Profile Data...</p>;
  }

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
                    value={currentProfileData.full_name || ""}
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
                    value={currentProfileData.stream || ""}
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
                    value={currentProfileData.year_of_study || ""}
                    onChange={(e) => {
                      if (isEditing) {
                        setDraftProfile((prev) => ({ ...prev, year_of_study: e.target.value }));
                      }
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
                    value={currentProfileData.semester || ""}
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
                    value={currentProfileData.email || ""}
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
                    value={`+91 ${currentProfileData.contact}` || ""}
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
                    value={currentProfileData.dob || ""}
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
              className={styles.submitButton}
              onClick={updateProfile}
              disabled={!isEditing || updating}
            >
              {updating ? "Updating" : "Update"}
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