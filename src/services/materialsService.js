// src/services/materialsService.js
import { supabaseAdmin } from "../config/supabaseClient.js";

//Helper: Construct a public proxy URL for a storage object
export function buildPublicUrl(bucket, path) {
  try {
    const base = (import.meta.env.FRONTEND_ORIGIN || "").replace(/\/$/, "");
    if (!base || !bucket || !path) return null;
    return `${base}/${encodeURIComponent(bucket)}/${encodeURIComponent(path)}`;
  } catch {
    return null;
  }
}

// Normalize the incoming payload from frontend publish
export function normalizeMaterialPayload(payload) {
  if (!Array.isArray(payload)) return [];

  return payload.map((item) => {
    if (item && Array.isArray(item.pdfs)) {
      return {
        subject: item.subject || item.name || null,
        pdfs: item.pdfs.map((p) => ({
          bucket: p.bucket || p?.bucket || p?.bucketName || null,
          path: p.path || p?.path || p?.url || p?.filePath || null,
          caption: p.caption || p.caption || p.originalName || "",
          originalName: p.originalName || p.originalName || p?.originalName || null,
        })),
      };
    } else {
      // treat as flat file
      return {
        bucket: item.bucket || item?.bucket || null,
        path: item.path || item?.path || item?.url || null,
        caption: item.caption || item?.caption || item?.originalName || "",
        originalName: item.originalName || item?.originalName || null,
      };
    }
  });
}

// Given a materials DB row with data field, attempt to delete objects from storage
export async function deleteStorageObjectsFromGroup(groupRow) {
  if (!groupRow || !Array.isArray(groupRow.data)) return;
  const attempts = [];

  for (const item of groupRow.data) {
    if (item && Array.isArray(item.pdfs)) {
      for (const p of item.pdfs) {
        if (p?.bucket && p?.path) {
          attempts.push({ bucket: p.bucket, path: p.path });
        }
      }
    } else if (item && item.bucket && item.path) {
      attempts.push({ bucket: item.bucket, path: item.path });
    }
  }

  // group by bucket for batch remove calls (supabase storage remove accepts array of paths)
  const byBucket = attempts.reduce((acc, it) => {
    if (!acc[it.bucket]) acc[it.bucket] = [];
    acc[it.bucket].push(it.path);
    return acc;
  }, {});

  for (const bucketName of Object.keys(byBucket)) {
    try {
      // remove returns { data, error } shape
      const { error } = await supabaseAdmin.storage.from(bucketName).remove(byBucket[bucketName]);
      if (error) {
        console.warn("deleteStorageObjectsFromGroup: remove error for bucket", bucketName, error);
      }
    } catch (e) {
      console.warn("deleteStorageObjectsFromGroup: unexpected error:", e);
    }
  }
}