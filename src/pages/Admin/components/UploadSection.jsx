// src/components/UploadSection.jsx
import { useState, useCallback, useEffect, useRef } from "react";
import styles from "./UploadSection.module.css";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase (Using standard environment variables)
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const API_URL = import.meta.env.VITE_API_BASE_URL;

export default function UploadSection() {
  // --- 1. CORE FORM STATE ---
  const [materialType, setMaterialType] = useState("");
  const [sectionType, setSectionType] = useState("latest");
  const [heading, setHeading] = useState("");
  const [isLatestTag, setIsLatestTag] = useState(true);
  const [questionCount, setQuestionCount] = useState("");
  const [flatCount, setFlatCount] = useState("");
  const [accessToken, setAccessToken] = useState(null);

  // --- 2. UPLOAD QUEUE STATE (Dynamic Structure) ---
  const [subjects, setSubjects] = useState([]);
  const [flatMaterials, setFlatMaterials] = useState([]);
  const fileFingerprintsRef = useRef(new Set());

  // --- 3. MANAGEMENT & LIVE STATE ---
  const [liveGroups, setLiveGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchingLive, setFetchingLive] = useState(false);
  const [toasts, setToasts] = useState([]);

  // --- 4. MODAL & EDITING STATE ---
  const [editingHeadingText, setEditingHeadingText] = useState(""); 
  const [editGroupModal, setEditGroupModal] = useState({
    show: false,
    data: null,
  });
  const [editFileModal, setEditFileModal] = useState({
    show: false,
    groupId: null,
    fileIndex: null,
    subjectIndex: null,
    data: { caption: "", index: 0 },
  });

  // subject-edit modal state
  const [editSubjectModal, setEditSubjectModal] = useState({
    show: false,
    groupId: null,
    subjectIndex: null,
    name: "",
  });

  // --- ADD CONTENT MODAL STATE ---
  const [addContentModal, setAddContentModal] = useState({
    show: false,
    group: null,
    mode: null,
    subjectIndex: null,
  });
  const [modalNewSubjects, setModalNewSubjects] = useState([]); 
  const [modalNewFiles, setModalNewFiles] = useState([]);       
  const modalFingerprintsRef = useRef(new Set());

  // --- 5. Refs for file inputs ---
  const flatInputRef = useRef(null);
  const questionInputRefs = useRef({});
  
  // Refs for the new modal inputs
  const modalFlatInputRef = useRef(null);
  const modalQuestionInputRefs = useRef({});

  // ==========================================
  // A. UTILITIES & DATA INTEGRITY
  // ==========================================
  
  // Unique ID Generator for Keys
  const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  };

  const showToast = useCallback((message, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(
      () => setToasts((prev) => prev.filter((t) => t.id !== id)),
      4000
    );
  }, []);

  const updateSubjectName = (index, name) => {
    setSubjects((prev) => {
      const copy = [...prev];
      // ID is preserved via spread
      copy[index] = { ...copy[index], name };
      return copy;
    });
  };

  // Get auth session robustly
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAccessToken(data?.session?.access_token || null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setAccessToken(session?.access_token || null);
      }
    );
    return () => listener.subscription.unsubscribe();
  }, []);

  // hasJsonBody = false for GET / DELETE without body
  const authHeaders = ({ json = true, requireAuth = false } = {}) => {
    if (requireAuth && !accessToken) {
      throw new Error("Authentication Required");
    }
    const headers = {};
    if (json) headers["Content-Type"] = "application/json";
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }
    return headers;
  };

  // Helper for fetching json structure
  const fetchJson = async (url, opts = {}) => {
    const res = await fetch(url, opts);
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {}

    if (!res.ok) {
      throw new Error(
        (json && (json.message || json.error)) ||
          text ||
          res.statusText ||
          "Network Error"
      );
    }
    return json ?? { ok: true };
  };

  // Helper for clearing form fields after upload
  const clearUploadForm = () => {
    setHeading("");
    setIsLatestTag(true);
    setQuestionCount("");
    setFlatCount("");
    setSubjects([]);
    setFlatMaterials([]);
    fileFingerprintsRef.current.clear();
  };

  // Helper for blocking duplicate uploads
  const getFileFingerprint = (file) =>
    `${file.name}_${file.size}_${file.lastModified}`;

  // ==========================================
  // B. DYNAMIC SKELETON & REORDERING LOGIC
  // ==========================================
  const createQuestionSkeleton = (total) => {
    const count = Math.max(0, parseInt(total) || 0);
    // Clear fingerprints as we are resetting
    fileFingerprintsRef.current.clear();
    
    setSubjects(
      Array.from({ length: count }, () => ({
        id: generateId(),
        name: "",
        materials: [],
      }))
    );
    setQuestionCount(String(count));
  };

  const createFlatSkeleton = (total) => {
    const count = Math.max(0, parseInt(total) || 0);
    fileFingerprintsRef.current.clear();
    setFlatMaterials(
      Array.from({ length: count }, () => ({
        id: generateId(),
        file: null,
        fileName: "",
        caption: "",
      }))
    );
    setFlatCount(String(count));
  };

  const moveItem = (list, setList, index, direction) => {
    const newList = [...list];
    const target = index + direction;
    if (target < 0 || target >= newList.length) return;
    [newList[index], newList[target]] = [newList[target], newList[index]];
    setList(newList);
  };

  const moveNestedItem = (sIdx, mIdx, direction) => {
    setSubjects((prev) => {
      const up = [...prev];
      // Create a shallow copy of the materials array to avoid mutating state directly
      const list = [...up[sIdx].materials];
      const target = mIdx + direction;
      if (target < 0 || target >= list.length) return prev;
      
      [list[mIdx], list[target]] = [list[target], list[mIdx]];
      
      up[sIdx] = { ...up[sIdx], materials: list };
      return up;
    });
  };

  // ==========================================
  // C. FILE SELECTION & VALIDATION ENGINE
  // ==========================================
  const handleFileProcessing = (e, type, sIdx = null, fIdx = 0) => {
    const rawFiles = Array.from(e.target.files || []);
    const validFiles = [];

    for (const file of rawFiles) {
      if (file.type !== "application/pdf") {
        showToast("Only PDF Documents Are Supported", "error");
        continue;
      }

      const fp = getFileFingerprint(file);
      if (fileFingerprintsRef.current.has(fp)) {
        showToast(`Duplicate File Blocked: ${file.name}`, "error");
        continue;
      }
      validFiles.push(file);
    }

    if (!validFiles.length) {
      try { e.target.value = null; } catch {}
      return;
    }

    if (type === "flat") {
      const updated = [...flatMaterials];
      let start = fIdx;
      // Find first empty slot starting from click position
      while (start < updated.length && updated[start]?.file) {
        start += 1;
      }
      
      validFiles.forEach((file, i) => {
        const idx = start + i;
        if (idx >= updated.length) {
          showToast("No Empty Slot Available For Additional File", "error");
          return;
        }
        // Cleanup old file fingerprint if we are overwriting
        if (updated[idx] && updated[idx].file) {
          fileFingerprintsRef.current.delete(getFileFingerprint(updated[idx].file));
        }
        
        fileFingerprintsRef.current.add(getFileFingerprint(file));
        
        // Preserve ID
        if (updated[idx]) {
          updated[idx] = { ...updated[idx], file, fileName: file.name };
        } else {
          // Fallback if array expanded unexpectedly
          updated[idx] = { id: generateId(), file, fileName: file.name, caption: "" };
        }
      });
      setFlatMaterials(updated);
    } else {
      const updatedSubs = [...subjects];
      if (!updatedSubs[sIdx]) {
        showToast("Subject Index Mismatch", "error");
        try { e.target.value = null; } catch {}
        validFiles.forEach((f) => fileFingerprintsRef.current.delete(getFileFingerprint(f)));
        return;
      }
      
      if (!Array.isArray(updatedSubs[sIdx].materials)) {
        updatedSubs[sIdx] = { ...updatedSubs[sIdx], materials: [] };
      }

      const matList = [...updatedSubs[sIdx].materials];
      let start = fIdx;
      while (start < matList.length && matList[start]?.file) {
        start += 1;
      }

      validFiles.forEach((file, i) => {
        const idx = start + i;
        if (idx >= matList.length) {
          showToast("No Empty Slot Available For Additional File", "error");
          return;
        }
        
        if (matList[idx] && matList[idx].file) {
          fileFingerprintsRef.current.delete(getFileFingerprint(matList[idx].file));
        }
        
        fileFingerprintsRef.current.add(getFileFingerprint(file));
        
        // Preserve ID
        if (matList[idx]) {
          matList[idx] = { ...matList[idx], file, fileName: file.name };
        } else {
          matList[idx] = { id: generateId(), file, fileName: file.name, caption: "" };
        }
      });
      
      updatedSubs[sIdx] = { ...updatedSubs[sIdx], materials: matList };
      setSubjects(updatedSubs);
    }
    
    try { e.target.value = null; } catch {}
  };

  // ==========================================
  // D. THE PUBLISHING ENGINE (Storage -> DB)
  // ==========================================
  const handleFinalPublish = async () => {
    if (!accessToken) {
      showToast("Authentication Required - Please wait or refresh", "error");
      return;
    }

    if (loading) {
      showToast("Please Wait...");
      return;
    }

    if (!heading || !materialType) {
      return showToast("Required: Heading & Material Type", "error");
    }
    setLoading(true);

    try {
      const payloadBlueprint = {
        materialType,
        sectionType,
        heading,
        isLatestTag: sectionType === "latest" ? isLatestTag : false,
        data: [],
      };

      const form = new FormData();

      // Helper to append file into form and return its key
      const appendFile = (file, groupIdx, subjectIdx, fileIdx) => {
        const key = `f_${groupIdx}_${subjectIdx === null ? "x" : subjectIdx}_${fileIdx}`;
        form.append(key, file, file.name);
        return key;
      };

      if (materialType === "Question") {
        for (let s = 0; s < subjects.length; s++) {
          const sub = subjects[s];
          if (!sub.name) throw new Error(`Subject #${s + 1} is missing a name`);

          const pdfs = [];
          if (!Array.isArray(sub.materials) || sub.materials.length === 0) {
            // Technically allow subject with no files? No, better to force removal.
            throw new Error(`Subject "${sub.name}" has no allocated material slots`);
          }

          // Filter out empty slots
          let validFileCount = 0;
          for (let f = 0; f < sub.materials.length; f++) {
            const mat = sub.materials[f];
            if (!mat || !mat.file) continue; // Skip empty slots

            const key = appendFile(mat.file, s, s, validFileCount);
            pdfs.push({
              fileKey: key,
              caption: mat.caption || mat.fileName || mat.file.name,
              originalName: mat.file.name,
            });
            validFileCount++;
          }

          if (validFileCount === 0) {
            throw new Error(`Subject "${sub.name}" has no files uploaded`);
          }

          payloadBlueprint.data.push({
            subject: sub.name,
            pdfs,
          });
        }
      } else {
        // Flat Types (Syllabus/Others)
        let validFileCount = 0;
        for (let g = 0; g < flatMaterials.length; g++) {
          const mat = flatMaterials[g];
          if (!mat || !mat.file) continue; // Skip empty slots

          const key = appendFile(mat.file, g, null, 0);
          payloadBlueprint.data.push({
            bucket: null,
            path: null,
            fileKey: key,
            caption: mat.caption || mat.fileName || mat.file.name,
            originalName: mat.file.name,
          });
          validFileCount++;
        }
        
        if (validFileCount === 0) {
            throw new Error("No files selected for upload");
        }
      }

      // append payload JSON (server will parse)
      form.append("payload", JSON.stringify(payloadBlueprint));

      const headers = await authHeaders({ json: false, requireAuth: true });

      const res = await fetch(`${API_URL}/api/materials/publish`, {
        method: "POST",
        headers,
        body: form,
      });

      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {}
      
      if (!res.ok) {
        throw new Error(
          (json && (json.message || json.error)) ||
            text ||
            res.statusText ||
            "Network Error"
        );
      }

      showToast("Materials Published Successfully!");
      clearUploadForm();
      await fetchLiveMaterials();
    } catch (err) {
      showToast(err.message || "Publication Failed", "error");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // E. LIVE AUDIT & MANAGEMENT LOGIC
  // ==========================================
  const fetchLiveMaterials = useCallback(async () => {
    if (!accessToken) return;
    setFetchingLive(true);
    try {
      const headers = authHeaders({ json: false, requireAuth: true });
      const data = await fetchJson(`${API_URL}/api/materials/live`, {
        headers,
      });
      if (data.ok && data.materials) {
        setLiveGroups(data.materials);
      } else {
        setLiveGroups([]);
      }
    } catch (e) {
      showToast("Failed to sync live data", "error");
      console.error(e);
      setLiveGroups([]);
    } finally {
      setFetchingLive(false);
    }
  }, [accessToken, showToast]);

  useEffect(() => {
    if (!accessToken) return;
    fetchLiveMaterials();
  }, [accessToken, fetchLiveMaterials]);

  const updateVisibility = async (id, status) => {
    try {
      const res = await fetchJson(`${API_URL}/api/materials/visibility/${id}`, {
        method: "PATCH",
        headers: await authHeaders({ json: true, requireAuth: true }),
        body: JSON.stringify({ isVisible: !status }),
      });

      if (!res?.ok) throw new Error("Update Failed");
      showToast("Visibility Updated");
      await fetchLiveMaterials();
    } catch (err) {
      showToast(err.message || "Visibility Update Failed", "error");
    }
  };

  const switchSection = async (id, current) => {
    const target = current === "latest" ? "archive" : "latest";
    try {
      await fetchJson(`${API_URL}/api/materials/switch-section/${id}`, {
        method: "PATCH",
        headers: await authHeaders({ json: true, requireAuth: true }),
        body: JSON.stringify({ sectionType: target }),
      });
      showToast(`Group Moved to ${target.toUpperCase()}`);
      await fetchLiveMaterials();
    } catch (err) {
      showToast(err.message || "Section Switch Failed", "error");
    }
  };

  const deleteGroup = async (id) => {
    if (!window.confirm("Permanently delete this group and all its files?"))
      return;
    try {
      await fetchJson(`${API_URL}/api/materials/group/${id}`, {
        method: "DELETE",
        headers: await authHeaders({ json: false, requireAuth: true }),
      });
      showToast("Group Deleted Successfully!", "error");
      await fetchLiveMaterials();
    } catch (err) {
      showToast(err.message || "Delete Failed", "error");
    }
  };

  // ==========================================
  // F. FILE-LEVEL MODIFICATION ENGINE
  // ==========================================
  const openFileEditModal = (group, fIdx, sIdx = null) => {
    let file = null;
    try {
      file = sIdx !== null ? group.data[sIdx].pdfs[fIdx] : group.data[fIdx];
    } catch {
      file = null;
    }
    if (!file) return showToast("File not found", "error");
    setEditFileModal({
      show: true,
      groupId: group.id,
      fileIndex: fIdx,
      subjectIndex: sIdx,
      data: { caption: file.caption || "", index: fIdx },
    });
  };

  const saveFileEdits = async () => {
    const { groupId, fileIndex, subjectIndex, data } = editFileModal;
    if (!groupId) return showToast("No Group Selected", "error");
    setLoading(true);
    try {
      const res = await fetch(
        `${API_URL}/api/materials/file-update/${groupId}`,
        {
          method: "PUT",
          headers: await authHeaders({ json: true, requireAuth: true }),
          body: JSON.stringify({
            fileIndex,
            subjectIndex,
            newCaption: data.caption,
            newIndex: data.index,
          }),
        },
      );
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Update Failed");
      }
      showToast("File Updated Successfully");
      setEditFileModal({
        show: false,
        groupId: null,
        fileIndex: null,
        subjectIndex: null,
        data: { caption: "", index: 0 },
      });
      await fetchLiveMaterials();
    } catch (e) {
      showToast(e.message || "Update Failed", "error");
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const deleteSpecificFile = async (groupId, fIdx, sIdx = null) => {
    if (!window.confirm("Remove this specific file from the group?")) return;
    try {
      const res = await fetch(
        `${API_URL}/api/materials/file-delete/${groupId}`,
        {
          method: "DELETE",
          headers: await authHeaders({ json: true, requireAuth: true }),
          body: JSON.stringify({ fileIndex: fIdx, subjectIndex: sIdx }),
        },
      );
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Delete Failed");
      }
      showToast("File Removed From Group");
      await fetchLiveMaterials();
    } catch (e) {
      showToast(e.message || "Delete Failed", "error");
      console.error(e);
    }
  };

  // --- SUBJECT GROUP EDITING/DELETING ---
  const handleEditSubjectName = (groupId, subjectIndex, currentName) => {
    setEditSubjectModal({
      show: true,
      groupId,
      subjectIndex,
      name: currentName || "",
    });
  };

  const handleDeleteSubject = async (groupId, subjectIndex) => {
    if (!window.confirm("Are you sure you want to delete this Subject Group and all its files? This cannot be undone")) 
      return;
    
    setLoading(true);
    try {
      await fetchJson(`${API_URL}/api/materials/subject-delete/${groupId}`, {
        method: "DELETE",
        headers: await authHeaders({ json: true, requireAuth: true }),
        body: JSON.stringify({ subjectIndex }),
      });
      showToast("Subject Group Deleted Successfully!");
      await fetchLiveMaterials();
    } catch (err) {
      showToast(err.message || "Failed to Delete Subject Group", "error");
    } finally {
      setLoading(false);
    }
  };

  // called when the user submits the edit-subject modal
  const saveSubjectEdits = async () => {
    const { groupId, subjectIndex, name } = editSubjectModal;
    if (!groupId) return showToast("No group selected", "error");
    if (!name || !name.trim()) return showToast("Subject name cannot be empty", "error");

    setLoading(true);
    try {
      await fetchJson(`${API_URL}/api/materials/subject-update/${groupId}`, {
        method: "PUT",
        headers: await authHeaders({ json: true, requireAuth: true }),
        body: JSON.stringify({ subjectIndex, newSubjectName: name }),
      });
      showToast("Subject Name Updated Successfully!");
      setEditSubjectModal({ show: false, groupId: null, subjectIndex: null, name: "" });
      await fetchLiveMaterials();
    } catch (err) {
      showToast(err.message || "Failed to Update Subject Name", "error");
    } finally {
      setLoading(false);
    }
  };

  const isQuestionGroup = (group) => {
    if (!group || !Array.isArray(group.data)) return false;
    return (
      group.data.length > 0 &&
      typeof group.data[0] === "object" &&
      "subject" in group.data[0] &&
      "pdfs" in group.data[0]
    );
  };

  // ==========================================
  // APPEND CONTENT LOGIC
  // ==========================================

  // Open Modal & Initialize State
  const openAddModal = (group, mode, sIdx = null) => {
    setAddContentModal({ show: true, group, mode, subjectIndex: sIdx });
    setModalNewSubjects([]);
    setModalNewFiles([]);
    modalFingerprintsRef.current.clear();

    // Pre-fill skeleton based on mode
    if (mode === "new-subject") {
      setModalNewSubjects([{ id: generateId(), name: "", materials: [] }]);
    } else if (mode.startsWith("append-files")) {
      setModalNewFiles([{ id: generateId(), file: null, fileName: "", caption: "" }]);
    }
  };

  // Handle File Processing inside Modal
  const handleModalFileProcessing = (e, contextType, sIdx = null, fIdx = 0) => {
    const rawFiles = Array.from(e.target.files || []);
    const validFiles = [];

    for (const file of rawFiles) {
      if (file.type !== "application/pdf") { showToast("Only PDF Supported", "error"); continue; }
      const fp = getFileFingerprint(file);
      if (modalFingerprintsRef.current.has(fp)) { showToast(`Duplicate: ${file.name}`, "error"); continue; }
      validFiles.push(file);
    }
    if (!validFiles.length) { try { e.target.value = null; } catch {} return; }

    if (contextType === "subject-files") {
       setModalNewSubjects(prev => {
         const up = [...prev];
         const matList = [...up[sIdx].materials];
         let start = fIdx;
         while(start < matList.length && matList[start]?.file) start++;
         validFiles.forEach((file, i) => {
            const idx = start + i;
            if(idx >= matList.length) return;
            if(matList[idx]?.file) modalFingerprintsRef.current.delete(getFileFingerprint(matList[idx].file));
            modalFingerprintsRef.current.add(getFileFingerprint(file));
            matList[idx] = { ...matList[idx], file, fileName: file.name };
         });
         up[sIdx] = { ...up[sIdx], materials: matList };
         return up;
       });
    } else {
       setModalNewFiles(prev => {
         const updated = [...prev];
         let start = fIdx;
         while(start < updated.length && updated[start]?.file) start++;
         validFiles.forEach((file, i) => {
            const idx = start + i;
            if(idx >= updated.length) {
              updated.push({ id: generateId(), file, fileName: file.name, caption: "" });
              modalFingerprintsRef.current.add(getFileFingerprint(file));
            } else {
              if(updated[idx]?.file) modalFingerprintsRef.current.delete(getFileFingerprint(updated[idx].file));
              modalFingerprintsRef.current.add(getFileFingerprint(file));
              updated[idx] = { ...updated[idx], file, fileName: file.name };
            }
         });
         return updated;
       });
    }
    try { e.target.value = null; } catch {}
  };

  // Submit Append Request
  const handleAppendSubmit = async () => {
    const { group, mode, subjectIndex } = addContentModal;
    if (!group) return;
    setLoading(true);

    try {
      const form = new FormData();
      const payload = { mode: mode === "new-subject" ? "new-subject" : "append-files", subjectIndex, data: [] };

      const appendFile = (file, keyPrefix) => {
        form.append(keyPrefix, file, file.name);
        return keyPrefix;
      };

      if (mode === "new-subject") {
        modalNewSubjects.forEach((sub, sIdx) => {
          if (!sub.name) throw new Error("Subject name required");
          const pdfs = [];
          sub.materials.forEach((m, mIdx) => {
            if (m && m.file) {
              const key = appendFile(m.file, `new_s${sIdx}_f${mIdx}`);
              pdfs.push({ fileKey: key, caption: m.caption || m.fileName || m.file.name });
            }
          });
          if (pdfs.length === 0) throw new Error(`Subject ${sub.name} empty`);
          payload.data.push({ subject: sub.name, pdfs });
        });
      } else {
        modalNewFiles.forEach((m, i) => {
          if (m && m.file) {
            const key = appendFile(m.file, `new_f${i}`);
            payload.data.push({ fileKey: key, caption: m.caption || m.fileName, originalName: m.file.name });
          }
        });
        if (payload.data.length === 0) throw new Error("No files selected");
      }

      form.append("payload", JSON.stringify(payload));
      
      const headers = await authHeaders({ json: false, requireAuth: true });
      const res = await fetch(`${API_URL}/api/materials/append/${group.id}`, { method: "POST", headers, body: form });
      if (!res.ok) {
         const txt = await res.text();
         throw new Error(txt || "Append Failed");
      }

      showToast("Added Successfully!");
      setAddContentModal({ show: false, group: null, mode: null, subjectIndex: null });
      await fetchLiveMaterials();
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // Render Helpers
  // ==========================================

  // Render file list for a FLAT group (live view)
  const renderFlatFileList = (group) => {
    if (!group || !Array.isArray(group.data)) return null;
    return (
      <div className={styles.fileList}>
        {group.data.map((file, fIdx) => (
          <div key={fIdx} className={styles.fileRow}>
            <div className={styles.fileMeta}>
              <div className={styles.fileCaption}>
                {file.caption || file.originalName || file.path || "Untitled"}
              </div>
              <div className={styles.fileHint}>
                {file.bucket ? `/${file.bucket}/${file.path || file.path}` : ""}
              </div>
            </div>

            <div className={styles.fileActions}>
              <button
                className={styles.editBtn}
                onClick={() => openFileEditModal(group, fIdx)}
              >
                <i className="fas fa-pen" title="Edit file"></i>
              </button>
              <button
                className={styles.deleteBtn}
                onClick={() => deleteSpecificFile(group.id, fIdx)}
              >
                <i className="fas fa-trash" title="Delete file"></i>
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Render nested question group (subjects -> pdfs) (live view)
  const renderQuestionFileList = (group) => {
    if (!group || !Array.isArray(group.data)) return null;
    return (
      <div className={styles.questionGroupList}>
        {group.data.map((sub, sIdx) => (
          <div key={sIdx} className={styles.subjectBlock}>
            <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "8px" }}>
              <h4 className={styles.subjectTitle}>
                {sub.subject || sub.name || `Subject ${sIdx + 1}`}
              </h4>
              <div className={styles.fileActions}>
                <button 
                  className={styles.editBtn}
                  onClick={() => openAddModal(group, "append-files-subject", sIdx)}>
                  <i className="fas fa-plus" title="Add new files"></i>
                </button>
                <button
                  className={styles.editBtn}
                  onClick={() => handleEditSubjectName(group.id, sIdx, sub.subject || sub.name)}>
                  <i className="fas fa-pen" title="Edit Subject Name"></i>
                </button>
                <button
                  className={styles.deleteBtn}
                  onClick={() => handleDeleteSubject(group.id, sIdx)}>
                  <i className="fas fa-trash" title="Delete Entire Subject"></i>
                </button>
              </div>
            </div>

            <div className={styles.fileList}>
              {Array.isArray(sub.pdfs) && sub.pdfs.length > 0 ? (
                sub.pdfs.map((pdf, fIdx) => (
                  <div key={fIdx} className={styles.fileRow}>
                    <div className={styles.fileMeta}>
                      <div className={styles.fileCaption}>
                        {pdf.caption || pdf.originalName || "Untitled"}
                      </div>
                      <div className={styles.fileHint}>
                        {pdf.bucket ? `/${pdf.bucket}/${pdf.path}` : ""}
                      </div>
                    </div>
                    <div className={styles.fileActions}>
                      <button
                        className={styles.editBtn}
                        onClick={() => openFileEditModal(group, fIdx, sIdx)}
                      >
                        <i className="fas fa-pen" title="Edit file"></i>
                      </button>
                      <button
                        className={styles.deleteBtn}
                        onClick={() => deleteSpecificFile(group.id, fIdx, sIdx)}
                      >
                        <i className="fas fa-trash" title="Delete file"></i>
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className={styles.emptyHint}>No files in this subject</div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ==========================================
  // JSX
  // ==========================================

  return (
    <div className={styles.uploadSectionWrapper}>
      {/* ==========================================
          1. UPLOAD NEW DOCUMENT SECTION
          ========================================== */}
      <section className={styles.adminPanelSection}>
        <div className={styles.panelHeader}>
          <h2>Upload New Document</h2>
          <p className={styles.panelSubtitle}>
            Configure & New Deploy Study Materials
          </p>
        </div>

        {/* Basic Configuration Grid */}
        <div className={styles.formGrid}>
          <div className={styles.inputGroup}>
            <label>Material Type</label>
            <select
              value={materialType}
              onChange={(e) => {
                setMaterialType(e.target.value);
                clearUploadForm();
                setQuestionCount("");
                setFlatCount("");
              }}
            >
              <option value="">-- Select Type --</option>
              <option value="Question">Question (PYQ)</option>
              <option value="Syllabus">Syllabus</option>
              <option value="Others">Others (Lab/Notes)</option>
            </select>
          </div>

          <div className={styles.inputGroup}>
            <label>Section Type</label>
            <select
              value={sectionType}
              onChange={(e) => setSectionType(e.target.value)}
            >
              <option value="latest">Latest</option>
              <option value="archive">Archive</option>
            </select>
          </div>

          <div className={styles.inputGroup}>
            <label>Heading</label>
            <input
              type="text"
              placeholder="e.g. Syllabus For 5th Sem"
              value={heading}
              onChange={(e) => setHeading(e.target.value)}
            />
          </div>

          {sectionType === "latest" && (
            <div className={styles.inputGroupToggle}>
              <label>Mark As Latest</label>
              <div className={styles.toggleRow}>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={isLatestTag}
                    onChange={() => setIsLatestTag(!isLatestTag)}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* --- BRANCH: QUESTION (Subject Grouping) --- */}
        {materialType === "Question" && (
          <div className={styles.dynamicFormArea}>
            <div
              className={styles.inputGroup}
              style={{ maxWidth: "280px", marginTop: "1.5rem" }}
            >
              <label>Total Subjects</label>
              <input
                type="text"
                placeholder="Enter Number of Subjects"
                value={questionCount}
                onChange={(e) => {
                  createQuestionSkeleton(e.target.value);
                  setQuestionCount(e.target.value);
                }}
              />
            </div>

            {subjects.map((sub, sIdx) => (
              <div key={sub.id} className={styles.uploadFormPlate}>
                <div className={styles.plateHeader}>
                  <span className={styles.plateNumber}>
                    SUBJECT #{sIdx + 1}
                  </span>
                  <div className={styles.reorderBtns}>
                    <button
                      onClick={() => moveItem(subjects, setSubjects, sIdx, -1)}
                      disabled={sIdx === 0}>▲
                    </button>
                    <button
                      onClick={() => moveItem(subjects, setSubjects, sIdx, 1)}
                      disabled={sIdx === subjects.length - 1}>▼
                    </button>
                    <button
                      className={styles.removeBtn}
                      onClick={() =>
                        setSubjects((prev) => {
                          const updated = [...prev];
                          const removed = updated.splice(sIdx, 1)[0];
                          // Clean fingerprints
                          if (removed && Array.isArray(removed.materials)) {
                            removed.materials.forEach((m) => {
                              if (m && m.file) {
                                fileFingerprintsRef.current.delete(getFileFingerprint(m.file));
                              }});
                          }
                          setQuestionCount(String(updated.length));
                          return updated;
                        })}>
                      &times;
                    </button>
                  </div>
                </div>

                <div className={styles.formGrid}>
                  <div className={styles.inputGroup}>
                    <label>Subject Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Software Engineering"
                      value={sub.name}
                      onChange={(e) => updateSubjectName(sIdx, e.target.value)}
                    />
                  </div>
                  <div className={styles.inputGroup}>
                    <label>Total Materials</label>
                    <input
                      type="text"
                      placeholder="Enter Number of Files"
                      value={sub.materials?.length || 0}
                      onChange={(e) => {
                        const count = Math.max(0, parseInt(e.target.value, 10) || 0);
                        setSubjects((prev) => {
                          const up = [...prev];
                          const current = up[sIdx] || { materials: [] };
                          const oldMaterials = current.materials || [];
                          
                          // If reducing, clean fingerprints
                          if (oldMaterials.length > count) {
                            oldMaterials.slice(count).forEach((m) => {
                              if (m && m.file) {
                                fileFingerprintsRef.current.delete(
                                  getFileFingerprint(m.file));
                              }});
                          } 
                          
                          // Resize logic: preserve existing, add new with IDs
                          const newMaterials = [...oldMaterials];
                          if (count < newMaterials.length) {
                             newMaterials.length = count;
                          } else {
                             while (newMaterials.length < count) {
                               newMaterials.push({
                                 id: generateId(),
                                 file: null,
                                 fileName: "",
                                 caption: ""
                               });
                             }
                          }
                          
                          up[sIdx] = { ...up[sIdx], materials: newMaterials };
                          return up;
                        });
                      }}
                    />
                  </div>
                </div>

                {sub.materials && sub.materials.length > 0 && (
                  <>
                    <div
                      className={styles.dropzoneContainer}
                      onClick={() => {
                        const input =
                          questionInputRefs.current[sIdx] ||
                          document.getElementById(`q-input-${sIdx}`);
                        input?.click();
                      }}
                    >
                      {/* Clicking will trigger the hidden input */}
                      <div className={styles.uploadPlaceholder}>
                        <i className="fas fa-file-pdf"></i>
                        <span>
                          Select {sub.materials.length} PDF(s) For{" "}
                          {sub.name || `Subject ${sIdx + 1}`}
                        </span>
                      </div>
                      <input
                        id={`q-input-${sIdx}`}
                        ref={(el) => {
                          if (el) questionInputRefs.current[sIdx] = el;
                          else delete questionInputRefs.current[sIdx];
                        }}
                        type="file"
                        multiple
                        accept=".pdf"
                        hidden
                        onChange={(e) =>
                          handleFileProcessing(e, "question", sIdx, 0)
                        }
                      />
                    </div>

                    {sub.materials.map((m, mIdx) => (
                      <div key={m.id} className={styles.uploadFormPlate}>
                        <div className={styles.plateHeader}>
                          <span className={styles.plateNumber}>
                            FILE #{mIdx + 1}
                          </span>
                          <div className={styles.reorderBtns}>
                            <button onClick={() => moveNestedItem(sIdx, mIdx, -1)}
                              disabled={mIdx === 0}>▲
                            </button>
                            <button
                              onClick={() => moveNestedItem(sIdx, mIdx, 1)}
                              disabled={mIdx === sub.materials.length - 1}>▼
                            </button>
                            <button
                              className={styles.removeBtn}
                              onClick={() =>
                                setSubjects((prev) => {
                                  const updated = [...prev];
                                  const file = updated[sIdx]?.materials[mIdx]?.file;
                                  if (file) {
                                    fileFingerprintsRef.current.delete(getFileFingerprint(file)); 
                                  }
                                  
                                  const newMats = updated[sIdx].materials.filter((_, i) => i !== mIdx);
                                  updated[sIdx] = { ...updated[sIdx], materials: newMats };
                                  return updated;
                                })}>
                              &times;
                            </button>
                          </div>
                        </div>
                        <div className={styles.formGrid}>
                          <div className={styles.inputGroup}>
                            <label>Filename</label>
                            <input
                              className={styles.disabledInput}
                              value={m.fileName || ""}
                              disabled
                            />
                          </div>
                          <div className={styles.inputGroup}>
                            <label>Display Caption</label>
                            <input
                              type="text"
                              placeholder="e.g. IT402-2025"
                              value={m.caption}
                              onChange={(e) => {
                                setSubjects(prev => {
                                  const up = [...prev];
                                  const mats = [...up[sIdx].materials];
                                  mats[mIdx] = { ...mats[mIdx], caption: e.target.value };
                                  up[sIdx] = { ...up[sIdx], materials: mats };
                                  return up;
                                });
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* --- BRANCH: SYLLABUS / OTHERS (Flat List) --- */}
        {(materialType === "Syllabus" || materialType === "Others") && (
          <div className={styles.dynamicFormArea}>
            <div
              className={styles.inputGroup}
              style={{ maxWidth: "280px", marginTop: "1.5rem" }}
            >
              <label>Total Materials</label>
              <input
                type="text"
                placeholder="Enter Number of Files"
                value={flatCount}
                onChange={(e) => {
                  createFlatSkeleton(e.target.value);
                  setFlatCount(e.target.value);
                }}
              />
            </div>

            {flatMaterials.length > 0 && (
              <>
                <div
                  className={styles.dropzoneContainer}
                  onClick={() => flatInputRef.current?.click()}
                >
                  <div className={styles.uploadPlaceholder}>
                    <i className="fas fa-cloud-upload-alt"></i>
                    <span>Select {flatMaterials.length} PDF(s) To Upload</span>
                  </div>
                  <input
                    id="flat-input"
                    ref={flatInputRef}
                    type="file"
                    multiple
                    accept=".pdf"
                    hidden
                    onChange={(e) => handleFileProcessing(e, "flat", null, 0)}
                  />
                </div>

                {flatMaterials.map((m, fIdx) => (
                  <div key={m.id} className={styles.uploadFormPlate}>
                    <div className={styles.plateHeader}>
                      <span className={styles.plateNumber}>
                        FILE #{fIdx + 1}
                      </span>
                      <div className={styles.reorderBtns}>
                        <button
                          onClick={() =>
                            moveItem(flatMaterials, setFlatMaterials, fIdx, -1)}
                          disabled={fIdx === 0}>▲
                        </button>
                        <button
                          onClick={() =>
                            moveItem(flatMaterials, setFlatMaterials, fIdx, 1)}
                          disabled={fIdx === flatMaterials.length - 1}>▼
                        </button>
                        <button
                          className={styles.removeBtn}
                          onClick={() =>
                            setFlatMaterials((prev) => {
                              const file = prev[fIdx]?.file;
                              const updated = prev.filter((_, i) => i !== fIdx);
                              if (file) {
                                fileFingerprintsRef.current.delete(getFileFingerprint(file));
                              }
                              setFlatCount(String(updated.length));
                              return updated;
                            })}>
                          &times;
                        </button>
                      </div>
                    </div>
                    <div className={styles.formGrid}>
                      <div className={styles.inputGroup}>
                        <label>Filename</label>
                        <input
                          className={styles.disabledInput}
                          value={m.fileName || ""}
                          disabled
                        />
                      </div>
                      <div className={styles.inputGroup}>
                        <label>Display Caption</label>
                        <input
                          type="text"
                          placeholder="e.g. IT402 Syllabus"
                          value={m.caption}
                          onChange={(e) => {
                            setFlatMaterials(prev => {
                                const up = [...prev];
                                up[fIdx] = { ...up[fIdx], caption: e.target.value };
                                return up;
                            });
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* Primary Action Button */}
        {((materialType === "Question" && subjects.length > 0) ||
          (materialType !== "Question" && flatMaterials.length > 0)) && (
          <button
            className={styles.primaryUploadBtn}
            disabled={loading}
            onClick={handleFinalPublish}
          >
            {loading
              ? "Uploading..."
              : `Upload ${materialType}(s) To Database`}
          </button>
        )}
      </section>

      {/* ==========================================
          2. VIEW LIVE DOCUMENTS SECTION
          ========================================== */}
      <section className={styles.adminPanelSection}>
        <div className={styles.panelHeader}>
          <h2>View Live Documents</h2>
          <p className={styles.panelSubtitle}>
            Monitor & Control Visibility of The Published Materials
          </p>
        </div>
        {fetchingLive && liveGroups.length === 0 ? (
          <div className={styles.emptyState}>
            <p>Syncing Live Documents...</p>
          </div>
        ) : liveGroups.length === 0 ? (
          <div className={styles.emptyState}>
            <p>⚠️ No Materials Are Currently Live!</p>
          </div>
        ) : (
          <div className={styles.liveMaterialsContainer}>
            {liveGroups.map((group) => (
              <div key={group.id} className={styles.liveCard}>
                <div className={styles.liveCardHeader}>
                  <span className={styles.sectionBadge}>
                    {group.material_type || group.materialType}
                  </span>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <div
                      className={styles.toggleRow}
                      style={{ display: "none" }}
                    >
                      <span style={{ fontSize: "0.8rem", marginRight: "-8px" }}>
                        Visibility
                      </span>
                      <label className={styles.switch}>
                        <input
                          type="checkbox"
                          checked={group.is_visible}
                          onChange={() =>
                            updateVisibility(group.id, group.is_visible)
                          }
                        />
                        <span className={styles.slider}></span>
                      </label>
                    </div>
                    <button 
                       className={styles.editBtn}
                       onClick={() => {
                          if (isQuestionGroup(group)) openAddModal(group, "new-subject");
                          else openAddModal(group, "append-files-flat");
                       }}
                    >
                       <i className="fas fa-plus" title="Add new subjects"></i>
                    </button>
                    <button
                      className={styles.editBtn}
                      onClick={() => {
                        setEditingHeadingText(group.heading || "");
                        setEditGroupModal({ show: true, data: group });
                      }}
                    >
                      <i className="fas fa-pen"></i>
                    </button>
                    <button
                      className={styles.deleteBtn}
                      onClick={() => deleteGroup(group.id)}
                    >
                      <i className="fas fa-trash"></i>
                    </button>
                  </div>
                </div>

                <div className={styles.liveCardBody}>
                  <h3>{group.heading}</h3>
                  <div className={styles.metadataList}>
                    <span>
                      <strong>Section:</strong>{" "}
                      {group.section_type === "latest"
                        ? "Top Section"
                        : "Archive"}
                    </span>
                    <span>
                      <strong>Items:</strong>{" "}
                      {Array.isArray(group.data) ? group.data.length : 0}{" "}
                      Subjects/Files
                    </span>
                  </div>

                  {/* Render the file-level */}
                  <div className={styles.liveFilesArea}>
                    {isQuestionGroup(group)
                      ? renderQuestionFileList(group)
                      : renderFlatFileList(group)}
                  </div>

                  <div className={styles.cardFooter}>
                    <div className={styles.toggleRow}>
                      <span style={{ fontSize: "0.8rem", marginRight: "-8px" }}>
                        Archive
                      </span>
                      <label className={styles.switch}>
                        <input
                          type="checkbox"
                          checked={group.section_type === "latest"}
                          onChange={() =>
                            switchSection(group.id, group.section_type)
                          }
                        />
                        <span className={styles.slider}></span>
                      </label>
                      <span style={{ fontSize: "0.8rem", marginLeft: "-8px" }}>
                        Latest
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ==========================================
          3. MODAL & TOAST LAYERS
          ========================================== */}

      {/* Group Edit Modal */}
      {editGroupModal.show && editGroupModal.data && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.plateHeader}>
              <span className={styles.plateNumber}>EDIT GROUP HEADING</span>
            </div>
            <div className={styles.inputGroup} style={{ marginTop: "1rem" }}>
              <label>Heading</label>
              <input
                type="text"
                value={editingHeadingText}
                onChange={(e) => setEditingHeadingText(e.target.value)}
              />
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                className={styles.cancelBtn}
                onClick={() => setEditGroupModal({ show: false, data: null })}
              >
                Cancel
              </button>
              <button
                className={styles.primaryUploadBtn}
                onClick={async () => {
                  try {
                    await fetchJson(
                      `${API_URL}/api/materials/update-heading/${editGroupModal.data.id}`,
                      {
                        method: "PATCH",
                        headers: await authHeaders({
                          json: true,
                          requireAuth: true,
                        }),
                        body: JSON.stringify({ heading: editingHeadingText }),
                      },
                    );
                    setEditGroupModal({ show: false, data: null });
                    await fetchLiveMaterials();
                    showToast("Group Heading Updated");
                  } catch (e) {
                    showToast(e.message || "Update Failed", "error");
                  }
                }}
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subject Edit Modal */}
      {editSubjectModal.show && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.plateHeader}>
              <span className={styles.plateNumber}>EDIT SUBJECT NAME</span>
            </div>
            <div className={styles.inputGroup} style={{ marginTop: "1rem" }}>
              <label>Subject Name</label>
              <input type="text"
                value={editSubjectModal.name}
                onChange={e =>
                  setEditSubjectModal(p => ({ ...p, name: e.target.value }))}/>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button className={styles.cancelBtn}
                onClick={() => setEditSubjectModal({
                    show: false,
                    groupId: null,
                    subjectIndex: null,
                    name: "",
                  })}>
                  Cancel
              </button>
              <button className={styles.primaryUploadBtn}
                onClick={saveSubjectEdits}
                disabled={loading}>
                {loading ? "Updating..." : "Update"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Edit Modal */}
      {editFileModal.show && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.plateHeader}>
              <span className={styles.plateNumber}>EDIT FILE INFO</span>
            </div>

            <div className={styles.inputGroup} style={{ marginTop: "1rem" }}>
              <label>Caption</label>
              <input
                type="text"
                value={editFileModal.data.caption}
                onChange={(e) =>
                  setEditFileModal((p) => ({
                    ...p,
                    data: { ...p.data, caption: e.target.value },
                  }))
                }
              />
            </div>

            <div className={styles.inputGroup} style={{ marginTop: "1rem" }}>
              <label>Index</label>
              <input
                type="text"
                value={editFileModal.data.index}
                onChange={(e) =>
                  setEditFileModal((p) => ({
                    ...p,
                    data: {
                      ...p.data,
                      index: Math.max(0, parseInt(e.target.value, 10) || 0),
                    },
                  }))
                }
              />
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                className={styles.cancelBtn}
                onClick={() =>
                  setEditFileModal({
                    show: false,
                    groupId: null,
                    fileIndex: null,
                    subjectIndex: null,
                    data: { caption: "", index: 0 },
                  })
                }
              >
                Cancel
              </button>
              <button
                className={styles.primaryUploadBtn}
                onClick={saveFileEdits}
                disabled={loading}
              >
                {loading ? "Updating..." : "Update"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NEW: ADD CONTENT MODAL */}
      {addContentModal.show && (
        <div className={styles.modalOverlay}>
          <style>{`.hide-scrollbar::-webkit-scrollbar { display: none; }
            .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}</style>

          <div className={styles.modalContent} style={{ maxWidth: "600px" }}>
            <div className={styles.plateHeader}>
              <span className={styles.plateNumber}>
                {addContentModal.mode === "new-subject" ? "ADD NEW SUBJECT GROUP" : "ADD NEW FILES"}
              </span>
            </div>

            <div className={`${styles.dynamicFormArea} hide-scrollbar`}
              style={{ maxHeight: "60vh", overflowY: "auto", padding: "4px" }}>
              {/* =================================================
                  MODE: NEW SUBJECT (Single Subject Enforced)
                  ================================================= */}
              {addContentModal.mode === "new-subject" &&
                modalNewSubjects.length > 0 && (
                  <div className={styles.uploadFormPlate}
                    style={{ marginTop: "0", boxShadow: "none" }}>
                    {/* Subject Header */}
                    <div className={styles.plateHeader}>
                      <span className={styles.plateNumber}>
                        NEW SUBJECT DETAILS
                      </span>
                    </div>

                    {/* Subject Metadata Inputs */}
                    <div className={styles.formGrid}>
                      <div className={styles.inputGroup}>
                        <label>Subject Name</label>
                        <input type="text"
                          placeholder="e.g. Operating System"
                          value={modalNewSubjects[0].name}
                          onChange={(e) =>
                            setModalNewSubjects((prev) => [{ ...prev[0], name: e.target.value }] )} />
                      </div>
                      <div className={styles.inputGroup}>
                        <label>Total Materials</label>
                        <input type="text"
                          placeholder="Count"
                          value={modalNewSubjects[0].materials.length || 0}
                          onChange={(e) => {
                            const count = Math.max(0, parseInt(e.target.value, 10) || 0);
                            setModalNewSubjects((prev) => {
                              const sub = { ...prev[0] };
                              const currentMats = [...sub.materials];
                              if (currentMats.length < count) {
                                while (currentMats.length < count) {
                                  currentMats.push({
                                    id: generateId(),
                                    file: null,
                                    fileName: "",
                                    caption: "",
                                  });
                                }} else if (currentMats.length > count) {
                                currentMats.slice(count).forEach((m) => {
                                  if (m.file)
                                    modalFingerprintsRef.current.delete(getFileFingerprint(m.file));
                                });
                                currentMats.length = count; }
                              return [{ ...sub, materials: currentMats }];
                            });
                          }}
                        />
                      </div>
                    </div>

                    {/* Dropzone & File List */}
                    {modalNewSubjects[0].materials.length > 0 && (
                      <>
                        <div className={styles.dropzoneContainer}
                          onClick={() => modalQuestionInputRefs.current[0]?.click()}>
                          <div className={styles.uploadPlaceholder}>
                            <i className="fas fa-file-pdf"></i>
                            <span>
                              Select {modalNewSubjects[0].materials.length} PDF(s)
                              For {modalNewSubjects[0].name || "New Subject"}
                            </span>
                          </div>
                          <input ref={(el) => (modalQuestionInputRefs.current[0] = el)}
                            type="file"
                            multiple
                            accept=".pdf"
                            hidden
                            onChange={(e) => handleModalFileProcessing(e, "subject-files", 0)}
                          />
                        </div>

                        {/* Individual File Plates */}
                        {modalNewSubjects[0].materials.map((m, mIdx) => (
                          <div key={m.id} className={styles.uploadFormPlate}>
                            <div className={styles.plateHeader}>
                              <span className={styles.plateNumber}>
                                FILE #{mIdx + 1}
                              </span>
                              <div className={styles.reorderBtns}>
                                <button
                                  onClick={() =>
                                    setModalNewSubjects((prev) => {
                                      const sub = { ...prev[0] };
                                      const list = [...sub.materials];
                                      if (mIdx === 0) return prev;
                                      [list[mIdx], list[mIdx - 1]] = [list[mIdx - 1], list[mIdx]];
                                      return [{ ...sub, materials: list }];
                                    })} disabled={mIdx === 0}>▲
                                </button>
                                <button
                                  onClick={() =>
                                    setModalNewSubjects((prev) => {
                                      const sub = { ...prev[0] };
                                      const list = [...sub.materials];
                                      if (mIdx === list.length - 1) return prev;
                                      [list[mIdx], list[mIdx + 1]] = [list[mIdx + 1], list[mIdx]];
                                      return [{ ...sub, materials: list }];
                                    })} disabled={mIdx ===modalNewSubjects[0].materials.length - 1}>▼
                                </button>
                                <button
                                  className={styles.removeBtn}
                                  onClick={() =>
                                    setModalNewSubjects((prev) => {
                                      const sub = { ...prev[0] };
                                      const mats = [...sub.materials];
                                      const removed = mats.splice(mIdx, 1)[0];
                                      if (removed?.file) {
                                        modalFingerprintsRef.current.delete(getFileFingerprint(removed.file));
                                      } return [{ ...sub, materials: mats }];
                                    })}>
                                  &times;
                                </button>
                              </div>
                            </div>
                            <div className={styles.formGrid}>
                              <div className={styles.inputGroup}>
                                <label>Filename</label>
                                <input className={styles.disabledInput}
                                  value={m.fileName || ""}
                                  disabled />
                              </div>
                              <div className={styles.inputGroup}>
                                <label>Display Caption</label>
                                <input type="text"
                                  placeholder="e.g. IT402-2025"
                                  value={m.caption}
                                  onChange={(e) =>
                                    setModalNewSubjects((prev) => {
                                      const sub = { ...prev[0] };
                                      const mats = [...sub.materials];
                                      mats[mIdx] = {...mats[mIdx], caption: e.target.value };
                                      return [{ ...sub, materials: mats }];
                                    })}/>
                              </div>
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}

              {/* =================================================
                  MODE: APPEND FILES (Flat or Existing Subject)
                  ================================================= */}
              {addContentModal.mode &&
                addContentModal.mode.startsWith("append-files") && (
                  <div className={styles.uploadFormPlate}
                    style={{ marginTop: "0", boxShadow: "none" }}>
                    {/* Control Header */}
                    <div className={styles.formGrid}
                      style={{ marginBottom: "1rem" }}>
                      <div className={styles.inputGroup}>
                        <label>Total New Files</label>
                        <input type="text"
                          placeholder="Count"
                          value={modalNewFiles.length}
                          onChange={(e) => {
                            const count =
                              Math.max(0, parseInt(e.target.value, 10) || 0);
                            setModalNewFiles((prev) => {
                              const updated = [...prev];
                              if (updated.length < count) {
                                while (updated.length < count) {
                                  updated.push({
                                    id: generateId(),
                                    file: null,
                                    fileName: "",
                                    caption: "",
                                  });
                                }} else {
                                updated.slice(count).forEach((m) => {
                                  if (m.file)
                                    modalFingerprintsRef.current.delete(getFileFingerprint(m.file));
                                }); updated.length = count;
                              } return updated;
                            });
                          }}
                        />
                      </div>
                    </div>

                    {/* Dropzone */}
                    {modalNewFiles.length > 0 && (
                      <div className={styles.dropzoneContainer}
                        onClick={() => modalFlatInputRef.current?.click()} >
                        <div className={styles.uploadPlaceholder}>
                          <i className="fas fa-cloud-upload-alt"></i>
                          <span>Select {modalNewFiles.length} PDF(s) To Upload</span>
                        </div>
                        <input ref={modalFlatInputRef}
                          type="file"
                          multiple
                          accept=".pdf"
                          hidden
                          onChange={(e) => handleModalFileProcessing(e, "flat-append")}/>
                      </div>
                    )}

                    {/* Individual File Plates */}
                    {modalNewFiles.map((m, i) => (
                      <div key={m.id} className={styles.uploadFormPlate}>
                        <div className={styles.plateHeader}>
                          <span className={styles.plateNumber}>
                            FILE #{i + 1}
                          </span>
                          <div className={styles.reorderBtns}>
                            <button
                              onClick={() =>
                                setModalNewFiles((prev) => {
                                  const list = [...prev];
                                  if (i === 0) return prev;
                                  [list[i], list[i - 1]] = [list[i - 1], list[i]];
                                  return list;
                                })} disabled={i === 0}>▲
                            </button>
                            <button
                              onClick={() =>
                                setModalNewFiles((prev) => {
                                  const list = [...prev];
                                  if (i === list.length - 1) return prev;
                                  [list[i], list[i + 1]] = [list[i + 1], list[i]];
                                  return list;
                                })} disabled={i === modalNewFiles.length - 1}>▼
                            </button>
                            <button
                              className={styles.removeBtn}
                              onClick={() =>
                                setModalNewFiles((prev) => {
                                  const file = prev[i]?.file;
                                  if (file) {
                                    modalFingerprintsRef.current.delete(getFileFingerprint(file));
                                  } return prev.filter((_, idx) => idx !== i);
                                })} >
                              &times;
                            </button>
                          </div>
                        </div>
                        <div className={styles.formGrid}>
                          <div className={styles.inputGroup}>
                            <label>Filename</label>
                            <input className={styles.disabledInput}
                              value={m.fileName || ""}
                              disabled />
                          </div>
                          <div className={styles.inputGroup}>
                            <label>Display Caption</label>
                            <input type="text"
                              placeholder="e.g. IT402-2025"
                              value={m.caption}
                              onChange={(e) =>
                                setModalNewFiles((prev) => {
                                  const c = [...prev];
                                  c[i] = { ...c[i], caption: e.target.value };
                                  return c; })}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </div>

            {/* Footer Actions */}
            <div style={{ display: "flex", gap: "8px", marginTop: "1rem" }}>
              <button className={styles.cancelBtn}
                onClick={() => setAddContentModal({ show: false, group: null, mode: null })}>
                Cancel
              </button>
              <button
                className={styles.primaryUploadBtn}
                onClick={handleAppendSubmit}
                disabled={loading}>
                {loading ? "Uploading..." : "Add Content"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification Container */}
      <div className={styles.syToastContainer}>
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`${styles.syToast} ${styles.show} ${styles[t.type]}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}