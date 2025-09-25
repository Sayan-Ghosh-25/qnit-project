export async function getProfile(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "not authenticated" });
  
      const { supabaseAdmin } = await import("../config/supabaseClient.js");
      const { data, error } = await supabaseAdmin.from("profiles").select("*").eq("id", userId).maybeSingle();
      if (error) throw error;
      return res.json({ profile: data });
    } catch (err) {
      console.error("getProfile:", err);
      return res.status(500).json({ error: err.message || "Server error" });
    }
  }
  