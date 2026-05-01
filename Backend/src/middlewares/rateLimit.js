// src/middlewares/rateLimit.js
const map = new Map();
const WINDOW_MS = 10 * 30 * 1000;
const MAX_PER_WINDOW = 10;

export function rateLimitMiddleware(req, res, next) {
  const key = (req.body.email || req.body.contact || req.ip || "").toLowerCase();
  const now = Date.now();
  const timestamps = map.get(key) || [];
  
  // Keep only timestamps within WINDOW_MS
  const recent = timestamps.filter(ts => now - ts < WINDOW_MS);
  recent.push(now);
  map.set(key, recent);

  if (recent.length > MAX_PER_WINDOW) {
    const retryAfter = Math.ceil((WINDOW_MS - (now - recent[0])) / 1000);
    return res.status(429).json({
      error: "Too many requests! Try again later",
      retryAfter,
    });
  }
  next();
}