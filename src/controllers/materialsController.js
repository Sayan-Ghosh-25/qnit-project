// src/controllers/materialsController.js
import { supabase, supabaseAdmin } from "../config/supabaseClient.js";
import {
  buildPublicUrl,
  normalizeMaterialPayload,
  deleteStorageObjectsFromGroup,
} from "../services/materialsService.js";

// Helper: extract Bearer token from Authorization header
function extractBearerToken(req) {
  const authHeader = req.headers.authorization || "";
  return authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
}

// Helper: check whether provided token belongs to an admin user.
async function isTokenAdmin(token) {
  if (!token) return false;
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) return false;
    const role = (data.user.role || data.user.user_metadata?.role || "").toString().toLowerCase();
    return role === "admin";
  } catch (e) {
    console.warn("isTokenAdmin: Introspect Failed:", e && (e.message || e));
    return false;
  }
}

//Helper: enforce admin on handler-level (extra protection if route middleware not applied)
async function ensureAdminOrFail(req, res) {
  // First check req.user (if you use requireAuth+requireAdmin middleware)
  if (req.user && (req.user.role || "").toString().toLowerCase() === "admin") return true;

  // Fallback: check token introspection
  const token = extractBearerToken(req);
  const ok = await isTokenAdmin(token);
  if (ok) return true;

  res.status(403).json({ ok: false, message: "Admin Role Required" });
  return false;
}

// POST /api/materials/publish (creates a new materials group (JSON data), inserts via service-role client)
export async function publishMaterials(req, res) {
  try {
    if (!(await ensureAdminOrFail(req, res))) return;

    const { materialType, sectionType, heading, isLatestTag = false, data } = req.body || {};
    if (!materialType || !sectionType || !heading || !Array.isArray(data)) {
      return res.status(400).json({ ok: false, message: "Invalid Payload" });
    }

    // Normalize incoming structure
    const normalized = normalizeMaterialPayload(data);

    const insertPayload = {
      material_type: materialType,
      section_type: sectionType,
      heading,
      is_latest: !!isLatestTag,
      data: normalized,
      is_visible: true,
      created_by: req.user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: inserted, error } = await supabaseAdmin
      .from("materials")
      .insert([insertPayload])
      .select("*")
      .maybeSingle();

    if (error || !inserted) {
      console.error("publishMaterials: DB insert error:", error);
      return res.status(500).json({ ok: false, message: "Failed to Persist Materials", detail: error });
    }

    // Add derived public URLs for convenience (non-persistent)
    const withUrls = {
      ...inserted,
      data: (inserted.data || []).map((item) =>
        item.pdfs && Array.isArray(item.pdfs)
          ? { ...item, pdfs: item.pdfs.map((p) => ({ ...p, public_url: buildPublicUrl(p.bucket, p.path) })) }
          : { ...item, public_url: buildPublicUrl(item.bucket, item.path) }
      ),
    };

    return res.json({ ok: true, material: withUrls });
  } catch (err) {
    console.error("publishMaterials:", err && (err.stack || err.message || err));
    return res.status(500).json({ ok: false, message: "Server Error" });
  }
}

// GET /api/materials/live
export async function getLiveMaterials(req, res) {
  try {
    // detect admin by req.user or token
    let showAll = false;
    if (req.user && (req.user.role || "").toString().toLowerCase() === "admin") showAll = true;
    else {
      const token = extractBearerToken(req);
      if (token) showAll = await isTokenAdmin(token);
    }

    let rows;
    if (showAll) {
      // admin: use service-role to read everything
      const { data, error } = await supabaseAdmin.from("materials").select("*").order("created_at", { ascending: false });
      if (error) {
        console.error("getLiveMaterials DB error (admin):", error);
        return res.status(500).json({ ok: false, message: "Failed to Fetch Materials", detail: error });
      }
      rows = data || [];
    } else {
      // public: use anon client to respect public RLS / or query visible rows directly
      // prefer a view if you created one: view_visible_materials
      const { data, error } = await supabase.from("view_visible_materials").select("*").order("created_at", { ascending: false });
      if (error) {
        // fallback: select from materials but restrict by is_visible
        const fallback = await supabase.from("materials").select("*").eq("is_visible", true).order("created_at", { ascending: false });
        if (fallback.error) {
          console.error("getLiveMaterials DB error (public fallback):", fallback.error);
          return res.status(500).json({ ok: false, message: "Failed to Fetch Materials", detail: fallback.error });
        }
        rows = fallback.data || [];
      } else {
        rows = data || [];
      }
    }

    // enrich with public urls
    const enriched = (rows || []).map((g) => {
      const d = g.data || [];
      const mapped = d.map((item) =>
        item.pdfs && Array.isArray(item.pdfs)
          ? { ...item, pdfs: item.pdfs.map((p) => ({ ...p, public_url: buildPublicUrl(p.bucket, p.path) })) }
          : { ...item, public_url: buildPublicUrl(item.bucket, item.path) }
      );
      return { ...g, data: mapped };
    });

    return res.json({ ok: true, materials: enriched });
  } catch (err) {
    console.error("getLiveMaterials:", err && (err.stack || err.message || err));
    return res.status(500).json({ ok: false, message: "Server Error" });
  }
}

// PATCH /api/materials/visibility/:id
export async function updateVisibility(req, res) {
  try {
    if (!(await ensureAdminOrFail(req, res))) return;

    const id = req.params.id;
    if (!id) return res.status(400).json({ ok: false, message: "Missing Id" });

    const { isVisible } = req.body ?? {};
    const { data: existing, error: selErr } = await supabaseAdmin.from("materials").select("is_visible").eq("id", id).maybeSingle();
    if (selErr) {
      console.error("updateVisibility: select error:", selErr);
      return res.status(500).json({ ok: false, message: "DB Error", detail: selErr });
    }

    const newVal = typeof isVisible === "boolean" ? isVisible : !existing?.is_visible;
    const { error } = await supabaseAdmin.from("materials").update({ is_visible: newVal, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("updateVisibility: update error:", error);
      return res.status(500).json({ ok: false, message: "Update Failed", detail: error });
    }
    return res.json({ ok: true, is_visible: newVal });
  } catch (err) {
    console.error("updateVisibility:", err && (err.stack || err.message || err));
    return res.status(500).json({ ok: false, message: "Server Error" });
  }
}

// PATCH /api/materials/switch-section/:id
export async function switchSection(req, res) {
  try {
    if (!(await ensureAdminOrFail(req, res))) return;

    const id = req.params.id;
    if (!id) return res.status(400).json({ ok: false, message: "Missing Id" });

    const { sectionType } = req.body || {};
    const allowed = ["latest", "archive"];
    const target = allowed.includes(sectionType) ? sectionType : null;
    if (!target) return res.status(400).json({ ok: false, message: "Invalid sectionType" });

    const { error } = await supabaseAdmin.from("materials").update({ section_type: target, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("switchSection: update error:", error);
      return res.status(500).json({ ok: false, message: "Update Failed", detail: error });
    }

    return res.json({ ok: true, section_type: target });
  } catch (err) {
    console.error("switchSection:", err && (err.stack || err.message || err));
    return res.status(500).json({ ok: false, message: "Server Error" });
  }
}

// PATCH /api/materials/update-heading/:id
export async function updateHeading(req, res) {
  try {
    if (!(await ensureAdminOrFail(req, res))) return;

    const id = req.params.id;
    const { heading } = req.body || {};
    if (!id || !heading) return res.status(400).json({ ok: false, message: "Missing Id or Heading" });

    const { error } = await supabaseAdmin.from("materials").update({ heading, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("updateHeading: update error:", error);
      return res.status(500).json({ ok: false, message: "Update Failed", detail: error });
    }
    return res.json({ ok: true, heading });
  } catch (err) {
    console.error("updateHeading:", err && (err.stack || err.message || err));
    return res.status(500).json({ ok: false, message: "Server Error" });
  }
}

// DELETE /api/materials/group/:id
export async function deleteGroup(req, res) {
  try {
    if (!(await ensureAdminOrFail(req, res))) return;

    const id = req.params.id;
    if (!id) return res.status(400).json({ ok: false, message: "Missing Id" });

    // fetch group (service role)
    const { data: group, error: selErr } = await supabaseAdmin.from("materials").select("*").eq("id", id).maybeSingle();
    if (selErr) {
      console.error("deleteGroup: select error:", selErr);
      return res.status(500).json({ ok: false, message: "DB Error", detail: selErr });
    }
    if (!group) return res.status(404).json({ ok: false, message: "Group Not Found" });

    // attempt to delete storage objects (service role)
    try {
      await deleteStorageObjectsFromGroup(group);
    } catch (e) {
      console.warn("deleteGroup: Storage Deletion Failed:", e);
    }

    // delete DB row (service role)
    const { error } = await supabaseAdmin.from("materials").delete().eq("id", id);
    if (error) {
      console.error("deleteGroup: Delete Row Error:", error);
      return res.status(500).json({ ok: false, message: "Failed to Delete Group", detail: error });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("deleteGroup:", err && (err.stack || err.message || err));
    return res.status(500).json({ ok: false, message: "Server Error" });
  }
}

// PUT /api/materials/file-update/:id
export async function fileUpdate(req, res) {
  try {
    if (!(await ensureAdminOrFail(req, res))) return;

    const id = req.params.id;
    const { fileIndex, subjectIndex = null, newCaption = null, newIndex = null } = req.body || {};
    if (!id || typeof fileIndex === "undefined") return res.status(400).json({ ok: false, message: "Missing Id or fileIndex" });

    // fetch group
    const { data: group, error: selErr } = await supabaseAdmin.from("materials").select("*").eq("id", id).maybeSingle();
    if (selErr) {
      console.error("fileUpdate: Select Error:", selErr);
      return res.status(500).json({ ok: false, message: "DB Error", detail: selErr });
    }
    if (!group) return res.status(404).json({ ok: false, message: "Group Not Found" });

    const data = JSON.parse(JSON.stringify(group.data || []));

    if (subjectIndex !== null && typeof subjectIndex !== "undefined") {
      if (!data[subjectIndex] || !Array.isArray(data[subjectIndex].pdfs)) {
        return res.status(400).json({ ok: false, message: "Invalid subjectIndex" });
      }
      const file = data[subjectIndex].pdfs[fileIndex];
      if (!file) return res.status(404).json({ ok: false, message: "File Not Found" });

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
      if (!Array.isArray(data)) return res.status(400).json({ ok: false, message: "Group Data Isn't Flat List" });
      const file = data[fileIndex];
      if (!file) return res.status(404).json({ ok: false, message: "File Not Found" });

      if (newCaption !== null) file.caption = newCaption;
      if (typeof newIndex === "number" && newIndex >= 0) {
        const arr = data;
        const moved = arr.splice(fileIndex, 1)[0];
        arr.splice(newIndex, 0, moved);
      } else {
        data[fileIndex] = file;
      }
    }

    const { error: updErr } = await supabaseAdmin.from("materials").update({ data, updated_at: new Date().toISOString() }).eq("id", id);
    if (updErr) {
      console.error("fileUpdate: Update Error:", updErr);
      return res.status(500).json({ ok: false, message: "Failed to Update File", detail: updErr });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("fileUpdate:", err && (err.stack || err.message || err));
    return res.status(500).json({ ok: false, message: "Server Error" });
  }
}

// DELETE /api/materials/file-delete/:id
export async function fileDelete(req, res) {
  try {
    if (!(await ensureAdminOrFail(req, res))) return;

    const id = req.params.id;
    const { fileIndex, subjectIndex = null } = req.body || {};
    if (!id || typeof fileIndex === "undefined") return res.status(400).json({ ok: false, message: "Missing Id or fileIndex" });

    // fetch group
    const { data: group, error: selErr } = await supabaseAdmin.from("materials").select("*").eq("id", id).maybeSingle();
    if (selErr) {
      console.error("fileDelete: Select Error:", selErr);
      return res.status(500).json({ ok: false, message: "DB Error", detail: selErr });
    }
    if (!group) return res.status(404).json({ ok: false, message: "Group Not Found" });

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

    // attempt to remove storage object if bucket+path present (service role)
    try {
      if (targetFile && targetFile.bucket && targetFile.path) {
        const { error: removeErr } = await supabaseAdmin.storage.from(targetFile.bucket).remove([targetFile.path]);
        if (removeErr) {
          console.warn("fileDelete: Storage Remove Reported Error:", removeErr);
        }
      }
    } catch (e) {
      console.warn("fileDelete: Storage Remove Failed (Continuing):", e);
    }

    // persist updated data (service role)
    const { error: updErr } = await supabaseAdmin.from("materials").update({ data, updated_at: new Date().toISOString() }).eq("id", id);
    if (updErr) {
      console.error("fileDelete: Update Error:", updErr);
      return res.status(500).json({ ok: false, message: "Failed to Update Group", detail: updErr });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("fileDelete:", err && (err.stack || err.message || err));
    return res.status(500).json({ ok: false, message: "Server Error" });
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