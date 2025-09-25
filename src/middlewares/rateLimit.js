const map = new Map();
// config
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_PER_WINDOW = 8;

export function rateLimitMiddleware(req, res, next) {
  try {
    const { email = "", contact = "" } = req.body || {};
    const key = (email || contact || req.ip).toLowerCase();
    const entry = map.get(key) || { count: 0, firstTs: Date.now() };
    const now = Date.now();

    if (now - entry.firstTs > WINDOW_MS) {
      // reset window
      entry.count = 0;
      entry.firstTs = now;
    }

    entry.count += 1;
    map.set(key, entry);

    if (entry.count > MAX_PER_WINDOW) {
      return res.status(429).json({ error: "Too many requests. Try again later." });
    }
    next();
  } catch (err) {
    console.error("rateLimit:", err);
    next(); // fail open (safer to allow than block unexpectedly)
  }
}
