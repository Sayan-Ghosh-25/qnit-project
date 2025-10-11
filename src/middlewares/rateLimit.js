// src/middlewares/rateLimit.js
const map = new Map();

// Config
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_PER_WINDOW = 5;

// Auto-cleanup interval (once per window)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of map.entries()) {
    if (now - entry.firstTs > WINDOW_MS) {
      map.delete(key);
    }
  }
}, WINDOW_MS);

export function rateLimitMiddleware(req, res, next) {
  try {
    const { email = "", contact = "" } = req.body || {};
    const rawKey = email || contact || req.ip || "";
    const key = String(rawKey).toLowerCase();
    const now = Date.now();

    let entry = map.get(key);

    if (!entry) {
      entry = { count: 0, firstTs: now };
      map.set(key, entry);
    }

    // Reset if window expired
    if (now - entry.firstTs > WINDOW_MS) {
      entry.count = 0;
      entry.firstTs = now;
    }

    entry.count += 1;
    map.set(key, entry);

    if (entry.count > MAX_PER_WINDOW) {
      const retryAfter = Math.ceil(
        (WINDOW_MS - (now - entry.firstTs)) / 1000
      ); // in seconds

      return res.status(429).json({
        error: "Too many requests! Please try again later",
        retryAfter,
      });
    }

    next();
  } catch (err) {
    console.error("rateLimit error:", err);
    next(); // fail open (don't block legit users)
  }
}