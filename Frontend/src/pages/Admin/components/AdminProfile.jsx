// src/.../components/AdminProfile.jsx
import { useEffect, useRef, useState } from "react";
import styles from "./AdminProfile.module.css";
import { supabase } from "@/lib/supabaseClient";

export default function AdminProfile() {
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [updating, setUpdating] = useState(false);

  // authoritative profile state
  const [profile, setProfile] = useState({
    full_name: "",
    email: "",
    contact: "",
    dob: "",
  });

  // draft while editing
  const [draftProfile, setDraftProfile] = useState(null);

  const firstEditableRef = useRef(null);

  // helper to get client JWT access token (works with v2 and fallback)
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

  // Normalize DOB helper (accepts yyyy-mm-dd or dd-mm-yyyy or browser formats)
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

  // fetch profile function (callable after updates too)
  async function fetchProfile() {
    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        setLoading(false);
        return null;
      }
      const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
      const res = await fetch(`${API_BASE}/user/me/profile`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (!res.ok) {
        console.warn("Failed to fetch profile:", res.status);
        setLoading(false);
        return null;
      }
      const payload = await res.json();
      const p = payload?.profile || {};
      const normalized = {
        full_name: p.full_name || "",
        email: p.email || "",
        contact: p.contact || "",
        dob: p.dob || "",
      };
      setProfile(normalized);
      return normalized;
    } catch (err) {
      console.error("Error fetching profile:", err);
      return null;
    } finally {
      setLoading(false);
    }
  }

  // initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await fetchProfile();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // render source (if editing use draft, else authoritative profile)
  const currentProfileData = isEditing ? draftProfile : profile;

  // controlled input handler (works only when editing)
  const handleChange = (e) => {
    const { id, value } = e.target;
    if (!id) return;
    setDraftProfile((prev) => (prev ? { ...prev, [id]: value } : prev));
  };

  const enableEditing = () => {
    setDraftProfile({ ...profile });
    setIsEditing(true);
    setTimeout(() => {
      if (firstEditableRef.current) firstEditableRef.current.focus();
    }, 40);
  };

  const disableEditing = () => {
    setIsEditing(false);
    setDraftProfile(null);
  };

  const cancelChanges = (e) => {
    if (e?.preventDefault) e.preventDefault();
    disableEditing();
  };

  // validate and build payload only containing changed fields
  function validateAndBuildUpdate() {
    if (!draftProfile) return { ok: false };

    const updatePayload = {};
    let changed = false;

    // dob
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
      updatePayload.dob = normalizedCurDob || null;
      changed = true;
    }

    if (!changed) {
      window.alert("No Changes Detected!");
      return { ok: false, noChanges: true };
    }
    return { ok: true, payload: updatePayload, optimistic: { ...profile, ...updatePayload } };
  }

  // update profile: optimistic UI + call server + re-fetch authoritative profile
  const updateProfile = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!isEditing || !draftProfile) {
      window.alert("Nothing to update!");
      return;
    }

    const res = validateAndBuildUpdate();
    if (!res.ok) {
      if (res.noChanges) disableEditing();
      return;
    }

    const { payload, optimistic } = res;
    setUpdating(true);

    const prevProfile = { ...profile };

    try {
      // optimistic local update (instant feedback)
      setProfile(optimistic);
      setDraftProfile((d) => (d ? { ...d, ...payload } : d));

      const token = await getAccessToken();
      if (!token) {
        window.alert("You are not signed in!");
        // rollback
        setProfile(prevProfile);
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
        // rollback
        setProfile(prevProfile);
        window.alert(errMsg);
        disableEditing();
        setUpdating(false);
        return;
      }

      // success: re-fetch authoritative profile
      const refreshed = await fetchProfile();
      if (!refreshed) {
        // if fetch failed, fallback to optimistic state
        setProfile(optimistic);
      }

      disableEditing();

      try {
        window.dispatchEvent(new CustomEvent("qnit:profile-updated", { detail: refreshed || optimistic }));
      } catch (e) {}

      window.alert("Profile updated successfully!");
    } catch (err) {
      console.error("Failed to update profile:", err);
      // rollback
      setProfile(prevProfile);
      window.alert("Failed to update profile! Please try again.");
      disableEditing();
    } finally {
      setUpdating(false);
    }
  };

  const renderData = currentProfileData || profile || {};

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
        <div className={styles.skeletonWrapper}>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className={styles.skeletonRow}>
            <div className={styles.skeletonLabel}></div>
            <div className={styles.skeletonInput}></div>
          </div>
        ))}
      </div>
      ) : (
        <>
          <table aria-describedby="profile-section">
            <tbody>
              <tr>
                <th scope="row">
                  <label htmlFor="full_name">Name</label>
                </th>
                <td>
                  <input type="text" id="full_name" disabled value={renderData.full_name || ""} />
                </td>
              </tr>

              <tr>
                <th scope="row">
                  <label htmlFor="email">Email</label>
                </th>
                <td>
                  <input type="email" id="email" disabled value={renderData.email || ""} maxLength={50} />
                </td>
              </tr>

              <tr>
                <th scope="row">
                  <label htmlFor="contact">Phone Number</label>
                </th>
                <td>
                  <input type="tel" id="contact" disabled value={`+91 ${renderData.contact}` || ""} maxLength={15} />
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
                    disabled={!isEditing || updating}
                    value={renderData.dob || ""}
                    onChange={handleChange}
                  />
                </td>
              </tr>
            </tbody>
          </table>

          <div className={styles.profileSectionButtons}>
            <button type="button" id="updateBtn" className={styles.updateButton} onClick={updateProfile} disabled={!isEditing || updating}>
              {updating ? "Updating..." : "Update"}
            </button>

            <button type="button" id="cancelBtn" className={styles.cancelButton} onClick={cancelChanges} disabled={!isEditing || updating}>
              Cancel
            </button>
          </div>
        </>
      )}
    </section>
  );
}