// src/components/SyllabusSection.jsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import styles from "./SyllabusSection.module.css";
import { createPortal } from "react-dom";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.min?url";
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// Environment API Base
const API_URL = import.meta.env.VITE_API_BASE_URL || "";

// Early Sanitization
function encodeIfNeeded(url) {
  if (typeof url !== "string") return "";
  if (/%[0-9A-Fa-f]{2}/.test(url)) return url;
  try {
    return encodeURI(url);
  } catch {
    return url;
  }
}

function scheduleIdle(callback) {
  if (typeof window === "undefined") {
    setTimeout(callback, 50);
    return;
  }
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(callback, { timeout: 500 });
  } else {
    setTimeout(callback, 60);
  }
}

// Pdf render queue (global)
const pdfRenderQueue = [];
let pdfRenderInProgress = 0;
const MAX_CONCURRENT_RENDER = 3;

function enqueuePdfRender(task) {
  pdfRenderQueue.push(task);
  runQueue();
}

async function runQueue() {
  if (pdfRenderInProgress >= MAX_CONCURRENT_RENDER) return;
  const next = pdfRenderQueue.shift();
  if (!next) return;

  pdfRenderInProgress++;
  try {
    await next();
  } catch (err) {
    console.error("PDF Render Queue Error:", err);
  }
  pdfRenderInProgress--;
  if (pdfRenderQueue.length) runQueue();
}

// Thumbnail Error Boundary
class ThumbnailErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error("ThumbnailErrorBoundary caught:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className={styles.syThumbnailError} role="img" aria-label="Preview Unavailable">
          ⚠️ Preview Unavailable
        </div>
      );
    }
    return this.props.children;
  }
}

// PdfThumbnail — robust & fault-tolerant
const PdfThumbnail = React.memo(({ url, id, placeholderText = "Preview Unavailable" }) => {
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const loadingTaskRef = useRef(null);
  const pdfRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const canvas = canvasRef.current;
    if (!canvas || !pdfjsLib) return;

    let canceled = false;

    const drawPlaceholder = (text) => {
      try {
        const ctx = canvas.getContext("2d");
        const DPR = window.devicePixelRatio || 1;
        const width = canvas.clientWidth || 200;
        const height = canvas.clientHeight || 150;
        canvas.width = Math.max(100, width) * DPR;
        canvas.height = Math.max(80, height) * DPR;
        canvas.style.width = `${Math.max(100, width)}px`;
        canvas.style.height = `${Math.max(80, height)}px`;
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = "14px Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#666";
        ctx.fillText(text || placeholderText, Math.max(100, width) / 2, Math.max(80, height) / 2);
      } catch (e) {}
    };

    const renderThumbnail = async () => {
      if (canceled || !mountedRef.current) return;
      if (!canvas) return;

      if (!url) {
        drawPlaceholder("No file");
        return;
      }

      try {
        // Safe cleanup of existing tasks before starting a new one
        if (renderTaskRef.current && typeof renderTaskRef.current.cancel === "function") {
          try {
            const maybe = renderTaskRef.current.cancel();
            if (maybe && typeof maybe.then === "function") maybe.catch(() => {});
          } catch (e) {}
          renderTaskRef.current = null;
        }
        if (loadingTaskRef.current && typeof loadingTaskRef.current.destroy === "function") {
          try {
            loadingTaskRef.current.destroy();
          } catch (e) {}
          loadingTaskRef.current = null;
        }
        if (pdfRef.current) {
          try {
            pdfRef.current.destroy();
          } catch (e) {}
          pdfRef.current = null;
        }

        // Start loading PDF document
        let docUrl = url;
        if (typeof docUrl !== "string") docUrl = String(docUrl);

        loadingTaskRef.current = pdfjsLib.getDocument(encodeIfNeeded(docUrl));
        const pdf = await loadingTaskRef.current.promise;
        if (canceled || !mountedRef.current) {
          try { pdf.destroy(); } catch (e) {}
          return;
        }
        pdfRef.current = pdf;

        // get first page
        const page = await pdf.getPage(1);
        if (canceled || !mountedRef.current) {
          try { pdf.destroy(); } catch (e) {}
          return;
        }

        const MAX_WIDTH = 240;
        const viewportAt1 = page.getViewport({ scale: 1 });
        const ratio = viewportAt1.width && viewportAt1.height ? viewportAt1.width / viewportAt1.height : 1;
        const targetW = Math.min(viewportAt1.width || MAX_WIDTH, MAX_WIDTH);
        const targetH = Math.round(targetW / ratio) || 150;
        const DPR = window.devicePixelRatio || 1;

        canvas.width = targetW * DPR;
        canvas.height = targetH * DPR;
        canvas.style.width = `${targetW}px`;
        canvas.style.height = `${targetH}px`;

        const ctx = canvas.getContext("2d");
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const renderViewport = page.getViewport({ scale: targetW / (viewportAt1.width || targetW) });
        renderTaskRef.current = page.render({ canvasContext: ctx, viewport: renderViewport });

        // await render — support different renderTask shapes
        const renderPromise =
          (renderTaskRef.current && (renderTaskRef.current.promise ?? (typeof renderTaskRef.current.then === "function" ? renderTaskRef.current : null))) ||
          null;

        if (renderPromise) {
          await renderPromise;
        } else {
          await new Promise((r) => setTimeout(r, 60));
        }

        try { page.cleanup?.(); } catch (e) {}
        try { pdf.destroy(); } catch (e) {}
        pdfRef.current = null;
      } catch (err) {
        drawPlaceholder("Preview Unavailable");
        try { loadingTaskRef.current?.destroy?.(); } catch (e) {}
        loadingTaskRef.current = null;
        try { pdfRef.current?.destroy?.(); } catch (e) {}
        pdfRef.current = null;
      } finally {
        if (canceled) {
          try { renderTaskRef.current?.cancel?.(); } catch (e) {}
        }
      }
    };

    // enqueue the render task and catch internal errors
    enqueuePdfRender(() =>
      new Promise((resolve) => {
        scheduleIdle(() => {
          renderThumbnail()
            .then(() => resolve())
            .catch(() => resolve());
        });
      })
    );

    return () => {
      canceled = true;
      const rt = renderTaskRef.current;
      if (rt && typeof rt.cancel === "function") {
        try {
          const maybe = rt.cancel();
          if (maybe && typeof maybe.then === "function") maybe.catch(() => {});
        } catch (e) {}
      }
      renderTaskRef.current = null;
      try { loadingTaskRef.current?.destroy?.(); } catch (e) {}
      loadingTaskRef.current = null;
      try { pdfRef.current?.destroy?.(); } catch (e) {}
      pdfRef.current = null;
    };
  }, [url, id, placeholderText]);

  return <canvas ref={canvasRef} aria-hidden="true" className={styles.syPdfThumbnailCanvas} />;
});

PdfThumbnail.displayName = "PdfThumbnail";

// Pdf Viewer Modal
function PdfModal({ open, url, onClose }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  // sanitize simple cases
  const safeUrl =
    typeof url === "string" && /^https?:\/\//.test(url)
      ? encodeIfNeeded(url)
      : url
      ? encodeIfNeeded(String(url))
      : "";

  return createPortal(
    <div
      className={styles.syPdfModal}
      role="dialog"
      aria-modal="true"
      aria-label="PDF viewer"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}>
      <div className={styles.syPdfModalInner} onClick={(e) => e.stopPropagation()}>
        {safeUrl ? (
          <iframe
            src={safeUrl}
            width="100%"
            height="100%"
            style={{ border: "none" }}
            title="PDF Viewer"
          />
        ) : (
          <div className={styles.syPdfModalError}>No Preview Available</div>
        )}
      </div>
      <button className={styles.syClose} aria-label="Close PDF" onClick={onClose}>&times;</button>
    </div>,
    typeof document !== "undefined" ? document.body : null
  );
}

// Simple toasts hook
function useToasts() {
  const [toasts, setToasts] = useState([]);
  const pushToast = useCallback((text, ms = 1500) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms + 300);
  }, []);
  return [toasts, pushToast];
}

// Helper: normalize server file entry
function fileToPdfEntry(item) {
  if (!item) return null;
  const url = item.public_url || item.publicUrl || (item.bucket && item.path ? `${item.bucket}/${item.path}` : null);
  const caption = item.caption || item.originalName || item.path || "Untitled";
  return { url, caption };
}

// Main Component
export default function SyllabusSection() {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalUrl, setModalUrl] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [openArchiveKey, setOpenArchiveKey] = useState(null);
  const [toasts, pushToast] = useToasts();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState([]);
  const archiveAnswerRefs = useRef({});
  const rootRef = useRef(null);

  // fetch live materials -> filter Syllabus
  useEffect(() => {
    let canceled = false;
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/materials/live`);
        const text = await res.text();
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch {}
        if (!res.ok) {
          const msg = (json && (json.message || json.error)) || text || res.statusText || "Failed to fetch";
          throw new Error(msg);
        }
        const allMaterials = (json && Array.isArray(json.materials) ? json.materials : []);
        const filtered = allMaterials.filter((m) => ((m.material_type || m.materialType) || "").toString() === "Syllabus");
        if (!canceled) {
          setGroups(filtered);
        }
      } catch (e) {
        console.error("Failed to load syllabus materials:", e);
        pushToast("Failed to load syllabus materials");
        if (!canceled) setGroups([]);
      } finally {
        if (!canceled) setLoading(false);
      }
    };

    fetchData();
    return () => { canceled = true; };
  }, [pushToast]);

  // menu outside click
  useEffect(() => {
    function onPointerDown(e) {
      try {
        if (
          e.target.closest &&
          (e.target.closest(`.${styles.syMenuBtn}`) || e.target.closest(`.${styles.syMenuOptions}`))
        ) {
          return;
        }
      } catch (err) {}
      setOpenMenuId(null);
    }
    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () => document.removeEventListener("pointerdown", onPointerDown, { capture: true });
  }, []);

  // archive height animation
  useEffect(() => {
    Object.keys(archiveAnswerRefs.current).forEach((key) => {
      const el = archiveAnswerRefs.current[key];
      if (!el) return;
      if (openArchiveKey === key) {
        el.style.height = el.scrollHeight + "px";
      } else {
        el.style.height = "0";
      }
    });
  }, [openArchiveKey, groups]);

  // Handlers
  const handleOpenPdf = useCallback((url) => {
    setModalUrl(url);
    setModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setModalOpen(false);
    setModalUrl(null);
  }, []);

  const handleToggleMenu = useCallback((id) => {
    setOpenMenuId((prev) => (prev === id ? null : id));
  }, []);

  const handleShare = useCallback(
    (url) => {
      if (!url) {
        pushToast("No link to share");
        setOpenMenuId(null);
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(
          () => pushToast("Link Copied to Clipboard"),
          () => pushToast("Clipboard Unavailable")
        );
      } else {
        try {
          const textarea = document.createElement("textarea");
          textarea.value = url;
          textarea.setAttribute("readonly", "");
          textarea.style.position = "absolute";
          textarea.style.left = "-9999px";
          document.body.appendChild(textarea);
          textarea.select();
          document.body.removeChild(textarea);
          pushToast("Link Copied to Clipboard");
        } catch (e) {
          pushToast("Clipboard Unavailable");
        }
      }
      setOpenMenuId(null);
    },
    [pushToast]
  );

  const handleToggleArchive = useCallback((key) => {
    setOpenArchiveKey((prev) => (prev === key ? null : key));
  }, []);

  // Render Helper (Pdf Card)
  const renderPdfBox = (pdf, id) => (
    <div key={id} className={styles.syPdfFeatureBox}>
      <button
        type="button"
        className={styles.syMenuBtn}
        aria-haspopup="true"
        aria-expanded={openMenuId === id ? "true" : "false"}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleToggleMenu(id);
        }}>&#x22EE;</button>

      <div
        className={styles.syMenuOptions}
        role="menu"
        style={{ display: openMenuId === id ? "block" : "none" }}>
        <a
          href="#"
          className={styles.syMenuItem}
          onClick={(e) => {
            e.preventDefault();
            handleShare(pdf.url);
          }}
          role="menuitem"
          aria-label="Copy link">
          <i className="fas fa-share" />
        </a>
      </div>

      <figure
        className={styles.syPdfCanvas}
        tabIndex={0}
        role="button"
        aria-label={`Open ${pdf.caption}`}
        onClick={() => handleOpenPdf(pdf.url)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleOpenPdf(pdf.url);
          }
        }}>

        <ThumbnailErrorBoundary>
          <PdfThumbnail url={pdf.url} id={id} />
        </ThumbnailErrorBoundary>

        <figcaption>{pdf.caption}</figcaption>
      </figure>
    </div>
  );

  // Convert group's data -> pdf entries (flat list)
  const groupToPdfEntries = (group) => {
    if (!group || !Array.isArray(group.data)) return [];
    return group.data.map((item) => {      
      if (item && Array.isArray(item.pdfs)) {
        const first = item.pdfs[0];
        return first ? {
          url: first.public_url || first.publicUrl || null,
          caption: first.caption || first.originalName || first.path || "Untitled",
        } : null;
      }
      return fileToPdfEntry(item);
    }).filter(Boolean);
  };
  
  // JSX
  return (
    <section id="syllabus-section" aria-label="Syllabus" ref={rootRef}>
      {loading ? (
        <div className={styles.sySkeletonWrapper}>
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className={styles.sySkeletonRow}>
              <div className={styles.sySkeletonLabel}></div>
              <div className={styles.sySkeletonInput}></div>
            </div> ))}
        </div> ) : (
        <>
          {groups.filter(g => (g.section_type || g.sectionType) === "latest").length === 0 ? (
            <div className={styles.syEmptyState}><p>We Are Sorry! 🙁<br /> No Materials Available Right Now</p>
            </div>
          ) : (
            groups.filter(g => (g.section_type || g.sectionType) === "latest").map((g, sIdx) => {
              const pdfs = groupToPdfEntries(g);
              const heading = g.heading || g.title || "Untitled";
              return (
                <section className={styles.syllabusSection} key={`latest-${g.id || sIdx}`}>
                  <h2>
                    {heading}
                    {(g.is_latest || g.isLatest) ? <span className={styles.syLatestTag}>LATEST</span> : null}
                  </h2>
                  <div className={styles.syllabusContainer}>
                    {pdfs.length === 0 ? <div className={styles.syEmptyState}>No Files Available</div> :
                      pdfs.map((p, pIdx) => {
                        const id = `latest-${g.id || sIdx}-p${pIdx}`;
                        const url = typeof p.url === "string" ? encodeIfNeeded(p.url) : p.url;
                        return renderPdfBox({ url, caption: p.caption }, id);
                      })
                    }
                  </div>
                </section>
              );
            })
          )}

          {/* Archive Area — each archive group becomes a collapsible entry */}
          {groups.some(g => (g.section_type || g.sectionType) === "archive") && (
            <section className={styles.syArchiveSection}>
              <h2>Archives</h2>
              <div className={styles.syArchiveContainer}>
                {groups.filter(g => (g.section_type || g.sectionType) === "archive").map((g, sIdx) => {
                  const key = `archive-${g.id || sIdx}`;
                  const pdfs = groupToPdfEntries(g);
                  const heading = g.heading || "Archive Group";
                  return (
                    <React.Fragment key={key}>
                      <h3
                        className={`${styles.syArchiveQuestion} ${openArchiveKey === key ? styles.active : ""}`}
                        tabIndex={0}
                        onClick={() => handleToggleArchive(key)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleToggleArchive(key);
                          }
                        }}>
                        {heading}
                      </h3>

                      <div
                        className={styles.syArchiveAnswer}
                        ref={(el) => {
                          if (el) archiveAnswerRefs.current[key] = el;
                          else delete archiveAnswerRefs.current[key];
                        }}>

                        <div className={styles.syArchiveAnswerContainer}>
                          <div className={styles.syllabusContainer}>
                            {pdfs.length === 0 ? <div className={styles.syEmptyState}>No Files Available</div> :
                              pdfs.map((p, pIdx) => {
                                const id = `archive-${g.id || sIdx}-p${pIdx}`;
                                const url = typeof p.url === "string" ? encodeIfNeeded(p.url) : p.url;
                                return renderPdfBox({ url, caption: p.caption }, id);
                              })
                            }
                          </div>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}

      {/* Modal Viewer */}
      <PdfModal open={modalOpen} url={modalUrl} onClose={handleCloseModal} />

      {/* Toasts */}
      <div className={styles.syToastContainer} aria-live="polite" aria-atomic="true">
        {toasts.map((t) => (
          <div key={t.id} className={`${styles.syToast} ${styles.show}`}>
            {t.text}
          </div>
        ))}
      </div>
    </section>
  );
}