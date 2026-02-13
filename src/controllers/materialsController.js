// src/controllers/materialsController.js
import { supabaseAdmin } from "../config/supabaseClient.js";
import { buildPublicUrl, normalizeMaterialPayload, deleteStorageObjectsFromGroup } from "../services/materialsService.js";

export async function publishMaterials(req, res) {
  try {
    const adminUser = req.user || null; // set by requireAuth
    const { materialType, sectionType, heading, isLatestTag = false, data } = req.body || {};

    if (!materialType || !sectionType || !heading || !Array.isArray(data)) {
      return res.status(400).json({ ok: false, message: "Invalid payload" });
    }

    // Normalize/validate incoming data shape (ensure bucket/path present)
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

    const { data: inserted, error } = await supabaseAdmin
      .from("materials")
      .insert([insertPayload])
      .select("*")
      .maybeSingle();

    if (error || !inserted) {
      console.error("publishMaterials: DB insert error:", error);
      return res.status(500).json({ ok: false, message: "Failed to persist materials" });
    }

    // Add derived public URLs for convenience (not stored)
    const withUrls = {
      ...inserted,
      data: await Promise.all(
        (inserted.data || []).map(async (item) => {
          // item can be either flat file item or subject with pdfs
          if (item.pdfs && Array.isArray(item.pdfs)) {
            return {
              ...item,
              pdfs: item.pdfs.map((p) => ({ ...p, public_url: buildPublicUrl(p.bucket, p.path) })),
            };
          } else {
            // flat item
            return { ...item, public_url: buildPublicUrl(item.bucket, item.path) };
          }
        })
      ),
    };

    return res.json({ ok: true, material: withUrls });
  } catch (err) {
    console.error("publishMaterials:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
}

/**
 * GET /api/materials/live
 * - if Authorization header with valid admin token provided -> return all groups
 * - otherwise only return is_visible = true groups
 */
export async function getLiveMaterials(req, res) {
  try {
    // detect admin token optionally
    let showAll = false;
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

    if (token) {
      try {
        const { data, error } = await supabaseAdmin.auth.getUser(token);
        if (!error && data?.user) {
          const role = data.user.role || data.user.user_metadata?.role || null;
          if (String(role).toLowerCase() === "admin") showAll = true;
        }
      } catch (e) {
        // ignore token introspect errors and treat as public
      }
    }

    const query = supabaseAdmin.from("materials").select("*").order("created_at", { ascending: false });
    if (!showAll) query.eq("is_visible", true);

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
    console.error("getLiveMaterials:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
}

/**
 * PATCH /api/materials/visibility/:id
 * Body: { isVisible: boolean }  (frontend toggles, but we flip as default behaviour)
 */
export async function updateVisibility(req, res) {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ ok: false, message: "Missing id" });

    const { isVisible } = req.body ?? {};
    // If the frontend sends nothing, flip existing value
    const { data: existing, error: selErr } = await supabaseAdmin.from("materials").select("is_visible").eq("id", id).maybeSingle();
    if (selErr) {
      console.error("updateVisibility: select error:", selErr);
      return res.status(500).json({ ok: false, message: "DB error" });
    }
    const newVal = typeof isVisible === "boolean" ? isVisible : !existing?.is_visible;

    const { error } = await supabaseAdmin.from("materials").update({ is_visible: newVal, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("updateVisibility: update error:", error);
      return res.status(500).json({ ok: false, message: "Update failed" });
    }
    return res.json({ ok: true, is_visible: newVal });
  } catch (err) {
    console.error("updateVisibility:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
}

/**
 * PATCH /api/materials/switch-section/:id
 * Body: { sectionType: 'latest'|'archive' }  (frontend supplies but we can flip)
 */
export async function switchSection(req, res) {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ ok: false, message: "Missing id" });

    const { sectionType } = req.body || {};
    const allowed = ["latest", "archive"];
    const target = allowed.includes(sectionType) ? sectionType : null;

    if (!target) return res.status(400).json({ ok: false, message: "Invalid sectionType" });

    const { error } = await supabaseAdmin.from("materials").update({ section_type: target, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("switchSection: update error:", error);
      return res.status(500).json({ ok: false, message: "Update failed" });
    }

    return res.json({ ok: true, section_type: target });
  } catch (err) {
    console.error("switchSection:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
}

/**
 * PATCH /api/materials/update-heading/:id
 * Body: { heading }
 */
export async function updateHeading(req, res) {
  try {
    const id = req.params.id;
    const { heading } = req.body || {};
    if (!id || !heading) return res.status(400).json({ ok: false, message: "Missing id or heading" });

    const { error } = await supabaseAdmin.from("materials").update({ heading, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("updateHeading: update error:", error);
      return res.status(500).json({ ok: false, message: "Update failed" });
    }
    return res.json({ ok: true, heading });
  } catch (err) {
    console.error("updateHeading:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
}

/**
 * DELETE /api/materials/group/:id
 * Deletes DB row and attempts to remove referenced storage objects (best-effort).
 */
export async function deleteGroup(req, res) {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ ok: false, message: "Missing id" });

    // fetch group
    const { data: group, error: selErr } = await supabaseAdmin.from("materials").select("*").eq("id", id).maybeSingle();
    if (selErr) {
      console.error("deleteGroup: select error:", selErr);
      return res.status(500).json({ ok: false, message: "DB error" });
    }
    if (!group) return res.status(404).json({ ok: false, message: "Group not found" });

    // attempt to delete storage objects
    try {
      await deleteStorageObjectsFromGroup(group);
    } catch (e) {
      console.warn("deleteGroup: storage deletion failed/partial:", e);
    }

    // delete DB row
    const { error } = await supabaseAdmin.from("materials").delete().eq("id", id);
    if (error) {
      console.error("deleteGroup: delete row error:", error);
      return res.status(500).json({ ok: false, message: "Failed to delete group" });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("deleteGroup:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
}

/**
 * PUT /api/materials/file-update/:id
 * Body: { fileIndex, subjectIndex, newCaption, newIndex }
 * - Updates caption or reorders file within group.data (JSON).
 */
export async function fileUpdate(req, res) {
  try {
    const id = req.params.id;
    const { fileIndex, subjectIndex = null, newCaption = null, newIndex = null } = req.body || {};
    if (!id || typeof fileIndex === "undefined") return res.status(400).json({ ok: false, message: "Missing id or fileIndex" });

    // fetch group
    const { data: group, error: selErr } = await supabaseAdmin.from("materials").select("*").eq("id", id).maybeSingle();
    if (selErr) {
      console.error("fileUpdate: select error:", selErr);
      return res.status(500).json({ ok: false, message: "DB error" });
    }
    if (!group) return res.status(404).json({ ok: false, message: "Group not found" });

    const data = JSON.parse(JSON.stringify(group.data || []));

    if (subjectIndex !== null && typeof subjectIndex !== "undefined") {
      // nested subject -> pdfs
      if (!data[subjectIndex] || !Array.isArray(data[subjectIndex].pdfs)) {
        return res.status(400).json({ ok: false, message: "Invalid subjectIndex" });
      }
      const file = data[subjectIndex].pdfs[fileIndex];
      if (!file) return res.status(404).json({ ok: false, message: "File not found" });

      if (newCaption !== null) file.caption = newCaption;
      if (typeof newIndex === "number" && newIndex >= 0) {
        // reorder within pdfs array
        const pdfs = data[subjectIndex].pdfs;
        const moved = pdfs.splice(fileIndex, 1)[0];
        pdfs.splice(newIndex, 0, moved);
        data[subjectIndex].pdfs = pdfs;
      } else {
        data[subjectIndex].pdfs[fileIndex] = file;
      }
    } else {
      // flat file list (group.data is array of files)
      if (!Array.isArray(data)) return res.status(400).json({ ok: false, message: "Group data is not flat list" });
      const file = data[fileIndex];
      if (!file) return res.status(404).json({ ok: false, message: "File not found" });

      if (newCaption !== null) file.caption = newCaption;
      if (typeof newIndex === "number" && newIndex >= 0) {
        const arr = data;
        const moved = arr.splice(fileIndex, 1)[0];
        arr.splice(newIndex, 0, moved);
        // assign arr back
      } else {
        data[fileIndex] = file;
      }
    }

    const { error: updErr } = await supabaseAdmin.from("materials").update({ data, updated_at: new Date().toISOString() }).eq("id", id);
    if (updErr) {
      console.error("fileUpdate: update error:", updErr);
      return res.status(500).json({ ok: false, message: "Failed to update file" });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("fileUpdate:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
}

/**
 * DELETE /api/materials/file-delete/:id
 * Body: { fileIndex, subjectIndex }
 * - Removes a file entry from the group's JSON and attempts to delete the storage object.
 */
export async function fileDelete(req, res) {
  try {
    const id = req.params.id;
    const { fileIndex, subjectIndex = null } = req.body || {};
    if (!id || typeof fileIndex === "undefined") return res.status(400).json({ ok: false, message: "Missing id or fileIndex" });

    // fetch group
    const { data: group, error: selErr } = await supabaseAdmin.from("materials").select("*").eq("id", id).maybeSingle();
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

    // attempt to remove storage object if bucket+path present
    try {
      if (targetFile && targetFile.bucket && targetFile.path) {
        await supabaseAdmin.storage.from(targetFile.bucket).remove([targetFile.path]);
      }
    } catch (e) {
      console.warn("fileDelete: storage remove failed (continuing):", e);
    }

    // persist updated data
    const { error: updErr } = await supabaseAdmin.from("materials").update({ data, updated_at: new Date().toISOString() }).eq("id", id);
    if (updErr) {
      console.error("fileDelete: update error:", updErr);
      return res.status(500).json({ ok: false, message: "Failed to update group" });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("fileDelete:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
}