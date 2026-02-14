// src/controllers/materialsController.js
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../config/supabaseClient.js";
import {
  buildPublicUrl,
  normalizeMaterialPayload,
  deleteStorageObjectsFromGroup,
} from "../services/materialsService.js";

// Helper: create a user-scoped Supabase client using the anon key, then set the incoming user's JWT
function getUserSupabaseClientFromToken(token) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (token) {
    // setAuth is available in supabase-js v2; if it throws, fail silently (server will treat as anon)
    try {
      client.auth.setAuth(token);
    } catch (e) {
      console.warn("getUserSupabaseClientFromToken: failed to set auth token:", e && e.message);
    }
  }
  return client;
}

// Utility: extract Bearer token from Authorization header
function extractBearerToken(req) {
  const authHeader = req.headers.authorization || "";
  return authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
}

// POST /api/materials/publish
export async function publishMaterials(req, res) {
  try {
    // token forwarded from client (Authorization: Bearer <jwt>)
    const token = extractBearerToken(req);
    const userClient = getUserSupabaseClientFromToken(token);

    // payload
    const { materialType, sectionType, heading, isLatestTag = false, data } = req.body || {};

    if (!materialType || !sectionType || !heading || !Array.isArray(data)) {
      return res.status(400).json({ ok: false, message: "Invalid payload" });
    }

    // normalize
    const normalized = normalizeMaterialPayload(data);

    const insertPayload = {
      material_type: materialType,
      section_type: sectionType,
      heading,
      is_latest: !!isLatestTag,
      data: normalized,
      is_visible: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Insert using user-scoped client so RLS (admin-only insert) can be enforced
    const { data: inserted, error } = await userClient
      .from("materials")
      .insert([insertPayload])
      .select("*")
      .maybeSingle();

    if (error || !inserted) {
      console.error("publishMaterials: DB insert error:", error);
      // If RLS blocks it, error.message often contains "permission denied"
      return res.status(500).json({ ok: false, message: "Failed to persist materials" });
    }

    // Add derived public URLs for convenience (not stored)
    const withUrls = {
      ...inserted,
      data: await Promise.all(
        (inserted.data || []).map(async (item) => {
          if (item.pdfs && Array.isArray(item.pdfs)) {
            return {
              ...item,
              pdfs: item.pdfs.map((p) => ({ ...p, public_url: buildPublicUrl(p.bucket, p.path) })),
            };
          } else {
            return { ...item, public_url: buildPublicUrl(item.bucket, item.path) };
          }
        })
      ),
    };

    return res.json({ ok: true, material: withUrls });
  } catch (err) {
    console.error("publishMaterials:", err && (err.stack || err.message || err));
    return res.status(500).json({ ok: false, message: "Server error" });
  }
}

// GET /api/materials/live
export async function getLiveMaterials(req, res) {
  try {
    const token = extractBearerToken(req);
    const userClient = getUserSupabaseClientFromToken(token);

    const query = userClient.from("materials").select("*").order("created_at", { ascending: false });

    const { data, error } = await query;
    if (error) {
      console.error("getLiveMaterials DB error:", error);
      return res.status(500).json({ ok: false, message: "Failed to fetch materials" });
    }

    // add public urls to returned objects (non-destructive)
    const enriched = (data || []).map((g) => {
      const d = g.data || [];
      const mapped = d.map((item) => {
        if (item.pdfs && Array.isArray(item.pdfs)) {
          return { ...item, pdfs: item.pdfs.map((p) => ({ ...p, public_url: buildPublicUrl(p.bucket, p.path) })) };
        } else {
          return { ...item, public_url: buildPublicUrl(item.bucket, item.path) };
        }
      });
      return { ...g, data: mapped };
    });

    return res.json({ ok: true, materials: enriched });
  } catch (err) {
    console.error("getLiveMaterials:", err && (err.stack || err.message || err));
    return res.status(500).json({ ok: false, message: "Server error" });
  }
}

// PATCH /api/materials/visibility/:id
export async function updateVisibility(req, res) {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ ok: false, message: "Missing id" });

    const token = extractBearerToken(req);
    const userClient = getUserSupabaseClientFromToken(token);

    const { isVisible } = req.body ?? {};

    // If RLS prevents select/update it will return a permission error
    const { data: existing, error: selErr } = await userClient.from("materials").select("is_visible").eq("id", id).maybeSingle();
    if (selErr) {
      console.error("updateVisibility: select error:", selErr);
      return res.status(500).json({ ok: false, message: "DB error" });
    }

    const newVal = typeof isVisible === "boolean" ? isVisible : !existing?.is_visible;

    const { error } = await userClient.from("materials").update({ is_visible: newVal, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("updateVisibility: update error:", error);
      return res.status(500).json({ ok: false, message: "Update failed" });
    }
    return res.json({ ok: true, is_visible: newVal });
  } catch (err) {
    console.error("updateVisibility:", err && (err.stack || err.message || err));
    return res.status(500).json({ ok: false, message: "Server error" });
  }
}

// PATCH /api/materials/switch-section/:id
export async function switchSection(req, res) {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ ok: false, message: "Missing id" });

    const { sectionType } = req.body || {};
    const allowed = ["latest", "archive"];
    const target = allowed.includes(sectionType) ? sectionType : null;

    if (!target) return res.status(400).json({ ok: false, message: "Invalid sectionType" });

    const token = extractBearerToken(req);
    const userClient = getUserSupabaseClientFromToken(token);

    const { error } = await userClient.from("materials").update({ section_type: target, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("switchSection: update error:", error);
      return res.status(500).json({ ok: false, message: "Update failed" });
    }

    return res.json({ ok: true, section_type: target });
  } catch (err) {
    console.error("switchSection:", err && (err.stack || err.message || err));
    return res.status(500).json({ ok: false, message: "Server error" });
  }
}

// PATCH /api/materials/update-heading/:id
export async function updateHeading(req, res) {
  try {
    const id = req.params.id;
    const { heading } = req.body || {};
    if (!id || !heading) return res.status(400).json({ ok: false, message: "Missing id or heading" });

    const token = extractBearerToken(req);
    const userClient = getUserSupabaseClientFromToken(token);

    const { error } = await userClient.from("materials").update({ heading, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("updateHeading: update error:", error);
      return res.status(500).json({ ok: false, message: "Update failed" });
    }
    return res.json({ ok: true, heading });
  } catch (err) {
    console.error("updateHeading:", err && (err.stack || err.message || err));
    return res.status(500).json({ ok: false, message: "Server error" });
  }
}

//* DELETE /api/materials/group/:id
export async function deleteGroup(req, res) {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ ok: false, message: "Missing id" });

    const token = extractBearerToken(req);
    const userClient = getUserSupabaseClientFromToken(token);

    // fetch group (subject to RLS)
    const { data: group, error: selErr } = await userClient.from("materials").select("*").eq("id", id).maybeSingle();
    if (selErr) {
      console.error("deleteGroup: select error:", selErr);
      return res.status(500).json({ ok: false, message: "DB error" });
    }
    if (!group) return res.status(404).json({ ok: false, message: "Group not found" });

    // attempt to delete storage objects (using service role)
    try {
      await deleteStorageObjectsFromGroup(group);
    } catch (e) {
      console.warn("deleteGroup: storage deletion failed/partial:", e);
    }

    // delete DB row (using user-scoped client so RLS rules apply)
    const { error } = await userClient.from("materials").delete().eq("id", id);
    if (error) {
      console.error("deleteGroup: delete row error:", error);
      return res.status(500).json({ ok: false, message: "Failed to delete group" });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("deleteGroup:", err && (err.stack || err.message || err));
    return res.status(500).json({ ok: false, message: "Server error" });
  }
}

//* PUT /api/materials/file-update/:id
export async function fileUpdate(req, res) {
  try {
    const id = req.params.id;
    const { fileIndex, subjectIndex = null, newCaption = null, newIndex = null } = req.body || {};
    if (!id || typeof fileIndex === "undefined") return res.status(400).json({ ok: false, message: "Missing id or fileIndex" });

    const token = extractBearerToken(req);
    const userClient = getUserSupabaseClientFromToken(token);

    // fetch group
    const { data: group, error: selErr } = await userClient.from("materials").select("*").eq("id", id).maybeSingle();
    if (selErr) {
      console.error("fileUpdate: select error:", selErr);
      return res.status(500).json({ ok: false, message: "DB error" });
    }
    if (!group) return res.status(404).json({ ok: false, message: "Group not found" });

    const data = JSON.parse(JSON.stringify(group.data || []));

    if (subjectIndex !== null && typeof subjectIndex !== "undefined") {
      if (!data[subjectIndex] || !Array.isArray(data[subjectIndex].pdfs)) {
        return res.status(400).json({ ok: false, message: "Invalid subjectIndex" });
      }
      const file = data[subjectIndex].pdfs[fileIndex];
      if (!file) return res.status(404).json({ ok: false, message: "File not found" });

      if (newCaption !== null) file.caption = newCaption;
      if (typeof newIndex === "number" && newIndex >= 0) {
        const pdfs = data[subjectIndex].pdfs;
        const moved = pdfs.splice(fileIndex, 1)[0];
        pdfs.splice(newIndex, 0, moved);
        data[subjectIndex].pdfs = pdfs;
      } else {
        data[subjectIndex].pdfs[fileIndex] = file;
      }
    } else {
      if (!Array.isArray(data)) return res.status(400).json({ ok: false, message: "Group data is not flat list" });
      const file = data[fileIndex];
      if (!file) return res.status(404).json({ ok: false, message: "File not found" });

      if (newCaption !== null) file.caption = newCaption;
      if (typeof newIndex === "number" && newIndex >= 0) {
        const arr = data;
        const moved = arr.splice(fileIndex, 1)[0];
        arr.splice(newIndex, 0, moved);
      } else {
        data[fileIndex] = file;
      }
    }

    const { error: updErr } = await userClient.from("materials").update({ data, updated_at: new Date().toISOString() }).eq("id", id);
    if (updErr) {
      console.error("fileUpdate: update error:", updErr);
      return res.status(500).json({ ok: false, message: "Failed to update file" });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("fileUpdate:", err && (err.stack || err.message || err));
    return res.status(500).json({ ok: false, message: "Server error" });
  }
}

// DELETE /api/materials/file-delete/:id
export async function fileDelete(req, res) {
  try {
    const id = req.params.id;
    const { fileIndex, subjectIndex = null } = req.body || {};
    if (!id || typeof fileIndex === "undefined") return res.status(400).json({ ok: false, message: "Missing id or fileIndex" });

    const token = extractBearerToken(req);
    const userClient = getUserSupabaseClientFromToken(token);

    // fetch group
    const { data: group, error: selErr } = await userClient.from("materials").select("*").eq("id", id).maybeSingle();
    if (selErr) {
      console.error("fileDelete: select error:", selErr);
      return res.status(500).json({ ok: false, message: "DB error" });
    }
    if (!group) return res.status(404).json({ ok: false, message: "Group not found" });

    const data = JSON.parse(JSON.stringify(group.data || []));

    let targetFile = null;
    if (subjectIndex !== null && typeof subjectIndex !== "undefined") {
      if (!data[subjectIndex] || !Array.isArray(data[subjectIndex].pdfs)) {
        return res.status(400).json({ ok: false, message: "Invalid subjectIndex" });
      }
      targetFile = data[subjectIndex].pdfs.splice(fileIndex, 1)[0];
      data[subjectIndex].pdfs = data[subjectIndex].pdfs;
    } else {
      targetFile = data.splice(fileIndex, 1)[0];
    }

    // attempt to remove storage object if bucket+path present (use service role)
    try {
      if (targetFile && targetFile.bucket && targetFile.path) {
        await supabaseAdmin.storage.from(targetFile.bucket).remove([targetFile.path]);
      }
    } catch (e) {
      console.warn("fileDelete: storage remove failed (continuing):", e);
    }

    // persist updated data (respect RLS via user client)
    const { error: updErr } = await userClient.from("materials").update({ data, updated_at: new Date().toISOString() }).eq("id", id);
    if (updErr) {
      console.error("fileDelete: update error:", updErr);
      return res.status(500).json({ ok: false, message: "Failed to update group" });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("fileDelete:", err && (err.stack || err.message || err));
    return res.status(500).json({ ok: false, message: "Server error" });
  }
}

export default {
  publishMaterials,
  getLiveMaterials,
  updateVisibility,
  switchSection,
  updateHeading,
  deleteGroup,
  fileUpdate,
  fileDelete,
};