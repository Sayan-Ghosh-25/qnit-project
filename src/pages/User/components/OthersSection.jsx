// src/components/OthersSection.jsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import "./OthersSection.css";
import { createPortal } from "react-dom";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.min?url";
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// ----------------------
// Admin-controlled Dataset (unchanged)
// ----------------------
const othersSectionData = [
  {
    sectionType: "pyq",
    heading: "Previous Year Questions for 5th Semester",
    isLatest: true,
    pdfs: [
      { url: "/ECG-NET Research Paper.pdf", caption: "IT501-2023" },
      { url: "/ECG-NET Research Paper.pdf", caption: "IT502-2023" },
      { url: "/ECG-NET Research Paper.pdf", caption: "IT501-2023" },
      { url: "/ECG-NET Research Paper.pdf", caption: "IT502-2023" },
      { url: "/ECG-NET Research Paper.pdf", caption: "IT501-2023" },
      { url: "/ECG-NET Research Paper.pdf", caption: "IT502-2023" },
    ],
  },
  {
    sectionType: "archive",
    heading: "Previous Year Questions for 4th Semester",
    pdfsByYear: [
      {
        year: 2024,
        pdfs: [
          { url: "/ECG-NET Research Paper.pdf", caption: "Exam Paper 2024" },
          { url: "/ECG-NET Research Paper.pdf", caption: "Exam Paper 2024" },
          { url: "/ECG-NET Research Paper.pdf", caption: "Exam Paper 2024" },
          { url: "/ECG-NET Research Paper.pdf", caption: "Exam Paper 2024" },
          { url: "/ECG-NET Research Paper.pdf", caption: "Exam Paper 2024" },
          { url: "/ECG-NET Research Paper.pdf", caption: "Exam Paper 2024" },
        ],
      },
      {
        year: 2023,
        pdfs: [
          { url: "/ECG-NET Research Paper.pdf", caption: "Exam Paper 2023" },
          { url: "/ECG-NET Research Paper.pdf", caption: "Exam Paper 2023" },
          { url: "/ECG-NET Research Paper.pdf", caption: "Exam Paper 2023" },
          { url: "/ECG-NET Research Paper.pdf", caption: "Exam Paper 2023" },
          { url: "/ECG-NET Research Paper.pdf", caption: "Exam Paper 2023" },
          { url: "/ECG-NET Research Paper.pdf", caption: "Exam Paper 2023" },
        ],
      },
    ],
  },
  {
    sectionType: "archive",
    heading: "Previous Year Questions for 3rd Semester",
    pdfsByYear: [
      {
        year: 2024,
        pdfs: [
          { url: "/ECG-NET Research Paper.pdf", caption: "Exam Paper 2024" },
          { url: "/ECG-NET Research Paper.pdf", caption: "Exam Paper 2024" },
          { url: "/ECG-NET Research Paper.pdf", caption: "Exam Paper 2024" },
          { url: "/ECG-NET Research Paper.pdf", caption: "Exam Paper 2024" },
          { url: "/ECG-NET Research Paper.pdf", caption: "Exam Paper 2024" },
          { url: "/ECG-NET Research Paper.pdf", caption: "Exam Paper 2024" },
        ],
      },
      {
        year: 2023,
        pdfs: [
          { url: "/ECG-NET Research Paper.pdf", caption: "Exam Paper 2023" },
          { url: "/ECG-NET Research Paper.pdf", caption: "Exam Paper 2023" },
          { url: "/ECG-NET Research Paper.pdf", caption: "Exam Paper 2023" },
          { url: "/ECG-NET Research Paper.pdf", caption: "Exam Paper 2023" },
          { url: "/ECG-NET Research Paper.pdf", caption: "Exam Paper 2023" },
          { url: "/ECG-NET Research Paper.pdf", caption: "Exam Paper 2023" },
        ],
      },
    ],
  },
];

// ----------------------
// Utilities
// ----------------------
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

// ----------------------
// Pdf render queue (global)
// ----------------------
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

// ----------------------
// Error Boundary for thumbnails (prevents whole app crash)
// ----------------------
class ThumbnailErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // log for diagnostics (don't expose error details to users)
    console.error("ThumbnailErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="ot-thumbnail-error" role="img" aria-label="Preview unavailable">
          ⚠️ Preview unavailable
        </div>
      );
    }
    return this.props.children;
  }
}

// ----------------------
// PdfThumbnail — robust & fault-tolerant
// ----------------------
const PdfThumbnail = React.memo(({ url, id, placeholderText = "Preview unavailable" }) => {
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
      } catch (e) {
        // ignore canvas drawing errors
      }
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
          } catch (e) {
            // ignore
          }
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

        loadingTaskRef.current = pdfjsLib.getDocument(encodeURI(docUrl));
        const pdf = await loadingTaskRef.current.promise;
        if (canceled || !mountedRef.current) {
          try {
            pdf.destroy();
          } catch (e) {}
          return;
        }
        pdfRef.current = pdf;

        // get first page
        const page = await pdf.getPage(1);
        if (canceled || !mountedRef.current) {
          try {
            pdf.destroy();
          } catch (e) {}
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
          // fallback small delay if render API is not promise-based
          await new Promise((r) => setTimeout(r, 60));
        }

        try {
          // try to cleanup page and pdf to free memory
          page.cleanup?.();
        } catch (e) {}
        try {
          pdf.destroy();
        } catch (e) {}
        pdfRef.current = null;
      } catch (err) {
        // render error (could be 404 or corrupted PDF)
        console.error("PDF thumbnail render error for", url, err);
        drawPlaceholder("Preview unavailable");
        try {
          loadingTaskRef.current?.destroy?.();
        } catch (e) {}
        loadingTaskRef.current = null;
        try {
          pdfRef.current?.destroy?.();
        } catch (e) {}
        pdfRef.current = null;
      } finally {
        if (canceled) {
          try {
            renderTaskRef.current?.cancel?.();
          } catch (e) {}
        }
      }
    };

    // enqueue the render task and catch internal errors
    enqueuePdfRender(() =>
      new Promise((resolve) => {
        scheduleIdle(() => {
          renderThumbnail()
            .then(() => resolve())
            .catch((err) => {
              console.error("RenderThumbnail internal error", err);
              resolve();
            });
        });
      })
    );

    // cleanup for effect
    return () => {
      canceled = true;

      // cancel renderTask safely
      const rt = renderTaskRef.current;
      if (rt && typeof rt.cancel === "function") {
        try {
          const maybe = rt.cancel();
          if (maybe && typeof maybe.then === "function") maybe.catch(() => {});
        } catch (e) {}
      }
      renderTaskRef.current = null;

      // destroy loading task safely
      try {
        loadingTaskRef.current?.destroy?.();
      } catch (e) {}
      loadingTaskRef.current = null;

      // destroy pdf if still present
      try {
        pdfRef.current?.destroy?.();
      } catch (e) {}
      pdfRef.current = null;
    };
  }, [url, id, placeholderText]);

  return <canvas ref={canvasRef} aria-hidden="true" className="ot-pdf-thumbnail-canvas" />;
});

PdfThumbnail.displayName = "PdfThumbnail";

// ----------------------
// Modal (PDF Viewer) — with safer fallbacks
// ----------------------
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

  // sanitize simple cases — avoid javascript: or data URIs that you don't intend to allow
  const safeUrl = typeof url === "string" && /^https?:\/\//.test(url) ? encodeURI(url) : url ? encodeURI(String(url)) : "";

  return createPortal(
    <div
      className="ot-pdfModal"
      role="dialog"
      aria-modal="true"
      aria-label="PDF viewer"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}>
      <div className="ot-pdfModal-inner" onClick={(e) => e.stopPropagation()}>
        {/* Use object which gives the browser-inline PDF viewer; also provide an "Open in new tab" link */}
        {safeUrl ? (
          <>
            <object
              data={safeUrl}
              type="application/pdf"
              width="100%"
              height="100%"
              aria-label="PDF preview">
              <p>
                This browser cannot display the PDF file. You can <a href={safeUrl} target="_blank" rel="noopener noreferrer">open it in a new tab</a> or <a href={safeUrl} download>download</a> it.
              </p>
            </object>
          </>
        ) : (
          <div className="ot-pdfModal-error">No preview available</div>
        )}
      </div>
      <button className="ot-close" aria-label="Close PDF" onClick={onClose}>&times;</button>
    </div>,
    typeof document !== "undefined" ? document.body : null
  );
}

// ----------------------
// Toasts
// ----------------------
function useToasts() {
  const [toasts, setToasts] = useState([]);
  const pushToast = useCallback((text, ms = 1500) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms + 300);
  }, []);
  return [toasts, pushToast];
}

// ----------------------
// Main Component
// ----------------------
export default function OthersSection() {
  // State + Refs
  const [modalOpen, setModalOpen] = useState(false);
  const [modalUrl, setModalUrl] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [openArchiveKey, setOpenArchiveKey] = useState(null);
  const [toasts, pushToast] = useToasts();
  const archiveAnswerRefs = useRef({});
  const rootRef = useRef(null);

  // Menu outside click
  useEffect(() => {
    function onPointerDown(e) {
      try {
        if (
          e.target.closest &&
          (e.target.closest(".ot-menu-btn") || e.target.closest(".ot-menu-options"))
        ) {
          return;
        }
      } catch (err) {
        // ignore
      }
      setOpenMenuId(null);
    }
    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () => document.removeEventListener("pointerdown", onPointerDown, { capture: true });
  }, []);

  // Archive Height Animation
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
  }, [openArchiveKey]);

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
          () => pushToast("Link copied to Clipboard"),
          () => pushToast("Clipboard unavailable")
        );
      } else {
        // fallback older method
        try {
          const textarea = document.createElement("textarea");
          textarea.value = url;
          textarea.setAttribute("readonly", "");
          textarea.style.position = "absolute";
          textarea.style.left = "-9999px";
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand("copy");
          document.body.removeChild(textarea);
          pushToast("Link copied to Clipboard");
        } catch (e) {
          pushToast("Clipboard unavailable");
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
    <div key={id} className="ot-pdf-feature-box">
      <button
        type="button"
        className="ot-menu-btn"
        aria-haspopup="true"
        aria-expanded={openMenuId === id ? "true" : "false"}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleToggleMenu(id);
        }}>&#x22EE;</button>

      <div
        className="ot-menu-options"
        role="menu"
        style={{ display: openMenuId === id ? "block" : "none" }}>
        <a
          href="#"
          className="ot-menu-item"
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
        className="ot-pdf-canvas"
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

  // Final JSX
  return (
    <section id="others-section" aria-label="PYQs" ref={rootRef}>
      {/* Render Others Section */}
      {othersSectionData
        .filter((sec) => sec.sectionType === "pyq")
        .map((sec, sIdx) => (
          <section className="others-section" key={`pyq-${sIdx}`}>
            <h2>
              {sec.heading}
              {sec.isLatest ? <span className="ot-latest-tag">LATEST</span> : null}
            </h2>
            <div className="other-container">
              {sec.pdfs.map((pdf, pIdx) => {
                const id = `pyq-${sIdx}-p${pIdx}`;
                return renderPdfBox(pdf, id);
              })}
            </div>
          </section>
        ))}

      {/* Render Archive Section */}
      {othersSectionData.some((sec) => sec.sectionType === "archive") && (
        <section className="ot-archive-section">
          <h2>Archives</h2>
          <div className="ot-archive-container">
            {othersSectionData
              .filter((sec) => sec.sectionType === "archive")
              .map((sec, sIdx) => (
                <React.Fragment key={`archive-frag-${sIdx}`}>
                  <h3
                    className={`ot-archive-question ${openArchiveKey === `archive-${sIdx}` ? "active" : ""}`}
                    tabIndex={0}
                    onClick={() => handleToggleArchive(`archive-${sIdx}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleToggleArchive(`archive-${sIdx}`);
                      }
                    }}>
                    {sec.heading}
                  </h3>

                  <div
                    className="ot-archive-answer"
                    ref={(el) => {
                      if (el) archiveAnswerRefs.current[`archive-${sIdx}`] = el;
                      else delete archiveAnswerRefs.current[`archive-${sIdx}`];
                    }}>

                    <div className="ot-archive-answer-container">
                      {sec.pdfsByYear &&
                        sec.pdfsByYear.map((yearGroup, yIdx) => (
                          <div key={`archive-${sIdx}-y-${yIdx}`} className="ot-year-group">
                            <h2>Year {yearGroup.year}</h2>
                            <div className="other-container">
                              {yearGroup.pdfs.map((pdf, pIdx) => {
                                const id = `archive-${sIdx}-y${yIdx}-p${pIdx}`;
                                return renderPdfBox(pdf, id);
                              })}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </React.Fragment>
              ))}
          </div>
        </section>
      )}

      {/* Modal Viewer Portal */}
      <PdfModal open={modalOpen} url={modalUrl} onClose={handleCloseModal} />

      {/* Toasts */}
      <div className="ot-toast-container" aria-live="polite" aria-atomic="true">
        {toasts.map((t) => (
          <div key={t.id} className="ot-toast show">
            {t.text}
          </div>
        ))}
      </div>
    </section>
  );
}