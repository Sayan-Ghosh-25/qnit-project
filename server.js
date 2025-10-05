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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Check required env variables
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY!");
  process.exit(1);
}

// Initialize Supabase client
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.use(helmet());
app.use(express.json());

// CORS
const allowedOrigins = process.env.FRONTEND_ORIGIN
  ? process.env.FRONTEND_ORIGIN.split(",").map(o => o.trim().replace(/\/$/, ""))
  : [];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin.replace(/\/$/, ""))) return callback(null, true);
    console.error("Blocked by CORS:", origin);
    callback(new Error("Not allowed by CORS"));
  }
}));

// Routes
app.use("/auth", authRoutes);
app.use("/user", userRoutes);
app.use("/user", feedbackRoutes);
app.use("/api/news", newsRoutes);

// Health check
app.get("/", (req, res) => res.json({ ok: true }));

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
