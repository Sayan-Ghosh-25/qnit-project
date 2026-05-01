// src/middlewares/requireAdmin.js
export default function requireAdmin(req, res, next) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ ok: false, error: "Not authenticated" });
    }
    const role = (user.role || "").toString().toLowerCase();
    if (role !== "admin") {
      return res.status(403).json({ ok: false, error: "Admin role required" });
    }
    return next();
  } catch (err) {
    console.error("requireAdmin:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}