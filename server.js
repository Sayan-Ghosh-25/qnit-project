// server.js
import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

import authRoutes from "./src/routes/authRoutes.js";
import userRoutes from "./src/routes/userRoutes.js";
import feedbackRoutes from "./src/routes/feedbackRoutes.js";
import newsRoutes from "./src/routes/newsRoute.js";
import materialsRoutes from "./src/routes/materialsRoutes.js";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 8080;

// --- Basic safety checks ---
const missingEnvs = [];
if (!process.env.SUPABASE_URL) missingEnvs.push("SUPABASE_URL");
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missingEnvs.push("SUPABASE_SERVICE_ROLE_KEY");

if (missingEnvs.length) {
  console.error(
    `Missing required environment variables: ${missingEnvs.join( ", " )}`
  );
}

// --- Initialize Supabase safely ---
let supabaseAdmin = null;
try {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
} catch (err) {
  console.error("Failed to create Supabase client:", err);
}

// --- Middlewares ---
app.use(helmet());
app.use(express.json());

// CORS: safe origin check that does not throw and crash the server
const allowedOrigins = process.env.FRONTEND_ORIGIN
  ? process.env.FRONTEND_ORIGIN.split(",").map((o) => o.trim().replace(/\/$/, ""))
  : [];

const corsOptions = {
  origin: (origin, callback) => {
    // allow non-browser tools (no origin) like curl, Railway health checks, server-to-server calls
    if (!origin) return callback(null, true);

    const normalized = origin.replace(/\/$/, "");
    if (allowedOrigins.length === 0) {
      // If no allowed origins configured, opt into allowing all
      return callback(null, true);
    }
    if (allowedOrigins.includes(normalized)) {
      return callback(null, true);
    }

    console.warn("Blocked by CORS:", origin);
    return callback(null, false);
  },
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

// --- Routes (wrap to avoid top-level import crashes) ---
try {
  app.use("/auth", authRoutes);
  app.use("/user", userRoutes);
  app.use("/user", feedbackRoutes);
  app.use("/api/news", newsRoutes);
  app.use("/api/materials", materialsRoutes);
} catch (err) {
  console.error("Error mounting routes:", err);
}

// Health check
app.get("/", (req, res) => res.json({ ok: true }));
app.get("/health", (req, res) => res.send("OK"));

// Generic error handler to avoid crashing from a thrown error inside a route
app.use((err, req, res, next) => {
  console.error("Unhandled route error:", err && (err.stack || err.message || err));
  res.status(500).json({ error: "Internal server error" });
});

// --- Start server and expose graceful shutdown ---
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  if (allowedOrigins.length) {
    console.log("Allowed origins:", allowedOrigins.join(", "));
  } else {
    console.log("Allowed origins: ALL");
  }
});

// Graceful shutdown handlers
const shutdown = (signal) => {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log("Closed HTTP server");
    process.exit(0);
  });

  // Force exit if it takes too long
  setTimeout(() => {
    console.warn("Forcing shutdown after timeout");
    process.exit(1);
  }, 10_000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Log unhandled exceptions/rejections so the container doesn't silently die
process.on("uncaughtException", (err) => {
  console.error("uncaughtException:", err && (err.stack || err.message || err));
});

process.on("unhandledRejection", (reason) => {
  console.error("unhandledRejection:", reason);
});