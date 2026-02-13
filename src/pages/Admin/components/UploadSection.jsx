// src/components/UploadSection.jsx
import { useState, useCallback, useEffect, useRef } from "react";
import styles from "./UploadSection.module.css";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase (Using standard environment variables)
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

const API_URL = import.meta.env.VITE_API_BASE_URL;

export default function UploadSection() {
  // --- 1. CORE FORM STATE ---
  const [materialType, setMaterialType] = useState(""); // Question, Syllabus, Others
  const [sectionType, setSectionType] = useState("latest");
  const [heading, setHeading] = useState("");
  const [isLatestTag, setIsLatestTag] = useState(true);

  // --- 2. UPLOAD QUEUE STATE (Dynamic Structure) ---
  // For 'Question': Nested Subjects -> Files
  // For 'Syllabus/Others': Flat Files
  const [subjects, setSubjects] = useState([]);
  const [flatMaterials, setFlatMaterials] = useState([]);

  // --- 3. MANAGEMENT & LIVE STATE ---
  const [liveGroups, setLiveGroups] = useState([]); // All data fetched from DB
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState([]);

  // --- 4. MODAL & EDITING STATE ---
  const [editGroupModal, setEditGroupModal] = useState({
    show: false,
    data: null,
  });
  const [editFileModal, setEditFileModal] = useState({
    show: false,
    groupId: null,
    fileIndex: null,
    subjectIndex: null, // For Questions
    data: { caption: "", index: 0 },
  });

  // --- 5. Upload Progress (simple) ---
  // map key -> progress (0..100)
  const [uploadProgress, setUploadProgress] = useState({});

  // --- 6. Refs for file inputs (avoid document.getElementById) ---
  const flatInputRef = useRef(null);
  const questionInputRefs = useRef({}); // keyed by subject index

  // ==========================================
  // A. UTILITIES & DATA INTEGRITY
  // ==========================================

  const showToast = useCallback((message, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(
      () => setToasts((prev) => prev.filter((t) => t.id !== id)),
      4000,
    );
  }, []);

  const getBucket = (type) => {
    const mapping = {
      Question: "PYQs",
      Syllabus: "Syllabus",
      Others: "Others",
    };
    return mapping[type] || "Others";
  };

  // Redundancy Check: Prevents uploading two files with same name in one batch
  const checkDuplicateInQueue = (files, currentList) => {
    const existingNames = new Set(
      (currentList || [])
        .map((item) => (item?.fileName || "").toLowerCase())
        .filter(Boolean),
    );
    return files.filter((f) => !existingNames.has(f.name.toLowerCase()));
  };

  // Safe Filename: Timestamp + Sanitize
  const generateSafePath = (fileName) => {
    const cleanName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    return `${Date.now()}_${cleanName}`;
  };

  // updateSubjectName (was missing previously)
  const updateSubjectName = (index, name) => {
    setSubjects((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], name };
      return copy;
    });
  };

  // small helper to build auth headers
  const authHeaders = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${sessionStorage.getItem("token")}`,
  });

  // fetch helper that returns JSON or throws with meaningful message
  const fetchJson = async (url, opts) => {
    const res = await fetch(url, opts);
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // ignore parse error
    }
    if (!res.ok) {
      const errMsg =
        (json && (json.message || json.error)) || text || res.statusText;
      throw new Error(errMsg || "Network error");
    }
    return json ?? { ok: true };
  };

  // ==========================================
  // B. DYNAMIC SKELETON & REORDERING LOGIC
  // ==========================================

  const createQuestionSkeleton = (total) => {
    const count = Math.max(0, parseInt(total) || 0);
    setSubjects(
      Array.from({ length: count }, () => ({
        name: "",
        materials: [],
      })),
    );
  };

  const createFlatSkeleton = (total) => {
    const count = Math.max(0, parseInt(total) || 0);
    setFlatMaterials(
      Array.from({ length: count }, () => ({
        file: null,
        fileName: "",
        caption: "",
      })),
    );
  };

  const moveItem = (list, setList, index, direction) => {
    const newList = [...list];
    const target = index + direction;
    if (target < 0 || target >= newList.length) return;
    [newList[index], newList[target]] = [newList[target], newList[index]];
    setList(newList);
  };

  // ==========================================
  // C. FILE SELECTION & VALIDATION ENGINE
  // ==========================================

  const handleFileProcessing = (e, type, sIdx = null, fIdx = 0) => {
    const rawFiles = Array.from(e.target.files || []);
    if (!rawFiles.length) return;
    const pdfs = rawFiles.filter((f) => f.type === "application/pdf");

    if (pdfs.length !== rawFiles.length) {
      showToast("Only PDF documents are supported", "error");
    }

    if (type === "flat") {
      const filtered = checkDuplicateInQueue(pdfs, flatMaterials);
      const updated = [...flatMaterials];
      filtered.forEach((file, i) => {
        const idx = fIdx + i;
        if (updated[idx]) {
          updated[idx] = { ...updated[idx], file, fileName: file.name };
        } else {
          // if slot doesn't exist, push new placeholder
          updated.push({ file, fileName: file.name, caption: "" });
        }
      });
      setFlatMaterials(updated);
    } else {
      const updatedSubs = [...subjects];
      if (!updatedSubs[sIdx]) {
        showToast("Subject index mismatch", "error");
        e.target.value = null;
        return;
      }
      if (!Array.isArray(updatedSubs[sIdx].materials)) {
        updatedSubs[sIdx].materials = [];
      }
      const filtered = checkDuplicateInQueue(pdfs, updatedSubs[sIdx].materials);
      filtered.forEach((file, i) => {
        const idx = fIdx + i;
        if (updatedSubs[sIdx].materials[idx]) {
          updatedSubs[sIdx].materials[idx] = {
            ...updatedSubs[sIdx].materials[idx],
            file,
            fileName: file.name,
          };
        } else {
          // add if missing
          updatedSubs[sIdx].materials[idx] = {
            file,
            fileName: file.name,
            caption: "",
          };
        }
      });
      setSubjects(updatedSubs);
    }
    // reset input
    try {
      e.target.value = null;
    } catch {}
  };

  // ==========================================
  // D. THE PUBLISHING ENGINE (Storage -> DB)
  // ==========================================

  const handleFinalPublish = async () => {
    if (!heading || !materialType)
      return showToast("Required: Heading & Material Type", "error");
    const token = sessionStorage.getItem("token");
    if (!token)
      return showToast("You must be logged in as admin to publish", "error");

    setLoading(true);
    const bucket = getBucket(materialType);

    try {
      let submissionData = [];

      // helper upload function
      const uploadFile = async (file) => {
        const path = generateSafePath(file.name);
        // simple progress: set 0 then set 100 after upload (Supabase JS doesn't expose progress)
        setUploadProgress((p) => ({ ...p, [path]: 0 }));
        const { data, error } = await supabase.storage
          .from(bucket)
          .upload(path, file);
        if (error) throw error;
        setUploadProgress((p) => ({ ...p, [path]: 100 }));
        return { bucket, path, caption: "", originalName: file.name };
      };

      if (materialType === "Question") {
        for (const sub of subjects) {
          if (!sub.name) throw new Error("All subjects must have a name");
          const pdfList = [];
          for (const mat of sub.materials) {
            if (!mat || !mat.file)
              throw new Error(`File missing for subject: ${sub.name}`);
            const uploaded = await uploadFile(mat.file);
            pdfList.push({ ...uploaded, caption: mat.caption || mat.fileName });
          }
          submissionData.push({ subject: sub.name, pdfs: pdfList });
        }
      } else {
        for (const mat of flatMaterials) {
          if (!mat || !mat.file) throw new Error("No files are selected");
          const uploaded = await uploadFile(mat.file);
          submissionData.push({
            ...uploaded,
            caption: mat.caption || mat.fileName,
          });
        }
      }

      // send to backend
      const payload = {
        materialType,
        sectionType,
        heading,
        isLatestTag: sectionType === "latest" ? isLatestTag : false,
        data: submissionData,
      };

      await fetchJson(`${API_URL}/api/materials/publish`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });

      showToast("Materials Published Successfully!");
      clearUploadForm();
      await fetchLiveMaterials();
    } catch (err) {
      showToast(err.message || "Publication failed", "error");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const clearUploadForm = () => {
    setHeading("");
    setSubjects([]);
    setFlatMaterials([]);
    setUploadProgress({});
  };

  // ==========================================
  // E. LIVE AUDIT & MANAGEMENT LOGIC
  // ==========================================

  const fetchLiveMaterials = useCallback(async () => {
    try {
      const data = await fetchJson(`${API_URL}/api/materials/live`, {
        headers: { Authorization: `Bearer ${sessionStorage.getItem("token")}` },
      });
      if (data.ok && data.materials) {
        setLiveGroups(data.materials);
      } else {
        setLiveGroups([]);
      }
    } catch (e) {
      showToast("Failed to sync live data", "error");
      console.error(e);
    }
  }, [showToast]);

  useEffect(() => {
    fetchLiveMaterials();
  }, [fetchLiveMaterials]);

  // Visibility Toggler
  const updateVisibility = async (id, status) => {
    try {
      await fetchJson(`${API_URL}/api/materials/visibility/${id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ isVisible: !status }),
      });
      showToast("Visibility updated");
      await fetchLiveMaterials();
    } catch (err) {
      showToast(err.message || "Visibility update failed", "error");
    }
  };

  // Section Switcher (Latest <-> Archive)
  const switchSection = async (id, current) => {
    const target = current === "latest" ? "archive" : "latest";
    try {
      await fetchJson(`${API_URL}/api/materials/switch-section/${id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ sectionType: target }),
      });
      showToast(`Group moved to ${target.toUpperCase()}`);
      await fetchLiveMaterials();
    } catch (err) {
      showToast(err.message || "Section switch failed", "error");
    }
  };

  // Delete Entire Group
  const deleteGroup = async (id) => {
    if (!window.confirm("Permanently delete this group and all its files?"))
      return;
    try {
      await fetchJson(`${API_URL}/api/materials/group/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${sessionStorage.getItem("token")}` },
      });
      showToast("Group Deleted Successfully!", "error");
      await fetchLiveMaterials();
    } catch (err) {
      showToast(err.message || "Delete failed", "error");
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
    if (!groupId) return showToast("No group selected", "error");
    setLoading(true);
    try {
      const res = await fetch(
        `${API_URL}/api/materials/file-update/${groupId}`,
        {
          method: "PUT",
          headers: authHeaders(),
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
        throw new Error(txt || "Update failed");
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
      showToast(e.message || "Update failed", "error");
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
          headers: authHeaders(),
          body: JSON.stringify({ fileIndex: fIdx, subjectIndex: sIdx }),
        },
      );
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Delete failed");
      }
      showToast("File removed from group");
      await fetchLiveMaterials();
    } catch (e) {
      showToast(e.message || "Delete failed", "error");
      console.error(e);
    }
  };

  // Helper to detect if group.data is 'question-shaped' (subject -> pdfs)
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
  // Render Helpers
  // ==========================================

  // Render file list for a group (flat)
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
                className={styles.iconBtn}
                onClick={() => openFileEditModal(group, fIdx)}
              >
                <i className="fas fa-edit" title="Edit file"></i>
              </button>
              <button
                className={styles.iconBtn}
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

  // Render nested question group (subjects -> pdfs)
  const renderQuestionFileList = (group) => {
    if (!group || !Array.isArray(group.data)) return null;
    return (
      <div className={styles.questionGroupList}>
        {group.data.map((sub, sIdx) => (
          <div key={sIdx} className={styles.subjectBlock}>
            <h4 className={styles.subjectTitle}>
              {sub.subject || sub.name || `Subject ${sIdx + 1}`}
            </h4>
            <div>
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
                        className={styles.iconBtn}
                        onClick={() => openFileEditModal(group, fIdx, sIdx)}
                      >
                        <i className="fas fa-edit" title="Edit file"></i>
                      </button>
                      <button
                        className={styles.iconBtn}
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
            Configure and deploy study materials to the student dashboard
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
              placeholder="e.g. Syllabus for 5th Sem"
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
                placeholder="Number of subjects"
                onChange={(e) => createQuestionSkeleton(e.target.value)}
              />
            </div>

            {subjects.map((sub, sIdx) => (
              <div key={sIdx} className={styles.uploadFormPlate}>
                <div className={styles.plateHeader}>
                  <span className={styles.plateNumber}>
                    SUBJECT #{sIdx + 1}
                  </span>
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
                      placeholder="Number of files"
                      onChange={(e) => {
                        const count = parseInt(e.target.value) || 0;
                        const up = [...subjects];
                        up[sIdx].materials = Array.from(
                          { length: count },
                          () => ({ file: null, fileName: "", caption: "" }),
                        );
                        setSubjects(up);
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
                          Select {sub.materials.length} PDF(s) for{" "}
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
                      <div key={mIdx} className={styles.uploadFormPlate}>
                        <div className={styles.formGrid}>
                          <div className={styles.inputGroup}>
                            <label>Filename</label>
                            <input
                              className={styles.disabledInput}
                              value={m.fileName || "Pending..."}
                              disabled
                            />
                          </div>
                          <div className={styles.inputGroup}>
                            <label>Display Caption</label>
                            <input
                              type="text"
                              placeholder="e.g. IT501-2025"
                              value={m.caption}
                              onChange={(e) => {
                                const up = [...subjects];
                                up[sIdx].materials[mIdx].caption =
                                  e.target.value;
                                setSubjects(up);
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
                type="number"
                placeholder="Number of files"
                onChange={(e) => createFlatSkeleton(e.target.value)}
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
                    <span>Select {flatMaterials.length} PDF(s) to Upload</span>
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
                  <div key={fIdx} className={styles.uploadFormPlate}>
                    <div className={styles.plateHeader}>
                      <span className={styles.plateNumber}>
                        FILE #{fIdx + 1}
                      </span>
                      <div className={styles.reorderBtns}>
                        <button
                          onClick={() =>
                            moveItem(flatMaterials, setFlatMaterials, fIdx, -1)
                          }
                          disabled={fIdx === 0}
                        >
                          ▲
                        </button>
                        <button
                          onClick={() =>
                            moveItem(flatMaterials, setFlatMaterials, fIdx, 1)
                          }
                          disabled={fIdx === flatMaterials.length - 1}
                        >
                          ▼
                        </button>
                        <button
                          className={styles.removeBtn}
                          onClick={() =>
                            setFlatMaterials((prev) =>
                              prev.filter((_, i) => i !== fIdx),
                            )
                          }
                        >
                          &times;
                        </button>
                      </div>
                    </div>
                    <div className={styles.formGrid}>
                      <div className={styles.inputGroup}>
                        <label>Filename</label>
                        <input
                          className={styles.disabledInput}
                          value={m.fileName || "Pending..."}
                          disabled
                        />
                      </div>
                      <div className={styles.inputGroup}>
                        <label>Display Caption</label>
                        <input
                          type="text"
                          placeholder="e.g. Lab Cover Page"
                          value={m.caption}
                          onChange={(e) => {
                            const up = [...flatMaterials];
                            up[fIdx].caption = e.target.value;
                            setFlatMaterials(up);
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
              ? "INITIALIZING PUBLICATION..."
              : `PUBLISH ${materialType.toUpperCase()} TO DASHBOARD`}
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
            Monitor, reorder, and control visibility of the published assets
          </p>
        </div>

        <div className={styles.liveMaterialsContainer}>
          {liveGroups.map((group) => (
            <div key={group.id} className={styles.liveCard}>
              <div className={styles.liveCardHeader}>
                <span className={styles.sectionBadge}>
                  {group.material_type || group.materialType}
                </span>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    className={styles.deleteBtn}
                    onClick={() =>
                      setEditGroupModal({ show: true, data: group })
                    }
                  >
                    <i className="fas fa-edit"></i>
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

                {/* Render the file-level UI (flat or question style) */}
                <div className={styles.liveFilesArea}>
                  {isQuestionGroup(group)
                    ? renderQuestionFileList(group)
                    : renderFlatFileList(group)}
                </div>

                <div className={styles.cardFooter}>
                  <div className={styles.toggleRow}>
                    <span style={{ fontSize: "0.7rem" }}>ARCHIVE</span>
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
                    <span style={{ fontSize: "0.7rem" }}>LATEST</span>
                  </div>

                  <div className={styles.toggleRow}>
                    <span style={{ fontSize: "0.7rem", marginRight: "8px" }}>
                      VISIBLE
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
                </div>
              </div>
            </div>
          ))}

          {liveGroups.length === 0 && (
            <p className={styles.emptyState}>No documents are currently live</p>
          )}
        </div>
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
              <button
                className={styles.removeBtn}
                onClick={() => setEditGroupModal({ show: false, data: null })}
              >
                &times;
              </button>
            </div>
            <div className={styles.inputGroup} style={{ marginTop: "1rem" }}>
              <label>Heading</label>
              <input
                type="text"
                defaultValue={editGroupModal.data.heading}
                id="edit-group-heading"
              />
            </div>
            <button
              className={styles.primaryUploadBtn}
              onClick={async () => {
                try {
                  const newHeading =
                    document.getElementById("edit-group-heading").value;
                  await fetchJson(
                    `${API_URL}/api/materials/update-heading/${editGroupModal.data.id}`,
                    {
                      method: "PATCH",
                      headers: authHeaders(),
                      body: JSON.stringify({ heading: newHeading }),
                    },
                  );
                  setEditGroupModal({ show: false, data: null });
                  await fetchLiveMaterials();
                  showToast("Group heading updated");
                } catch (e) {
                  showToast(e.message || "Update failed", "error");
                }
              }}
            >
              Update Heading
            </button>
          </div>
        </div>
      )}

      {/* File Edit Modal */}
      {editFileModal.show && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.plateHeader}>
              <span className={styles.plateNumber}>EDIT FILE</span>
              <button
                className={styles.removeBtn}
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
                &times;
              </button>
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

            <div className={styles.inputGroup} style={{ marginTop: "0.5rem" }}>
              <label>Index</label>
              <input
                type="number"
                value={editFileModal.data.index}
                onChange={(e) =>
                  setEditFileModal((p) => ({
                    ...p,
                    data: {
                      ...p.data,
                      index: parseInt(e.target.value || "0", 10),
                    },
                  }))
                }
              />
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                className={styles.primaryUploadBtn}
                onClick={saveFileEdits}
                disabled={loading}
              >
                {loading ? "Updating..." : "Save Changes"}
              </button>
              <button
                className={styles.removeBtn}
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