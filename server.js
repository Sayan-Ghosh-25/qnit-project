// src/server.js
import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

import authRoutes from "./src/routes/authRoutes.js";
import userRoutes from "./src/routes/userRoutes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.use(helmet());
app.use(express.json());

// CORS: allow frontend origin
const allowedOrigins = process.env.FRONTEND_ORIGIN
  ? process.env.FRONTEND_ORIGIN.split(",").map(o => o.trim().replace(/\/$/, ""))
  : [];

app.use(cors({
  origin: function(origin, callback) {
    // allow requests like Postman (no origin)
    if (!origin) return callback(null, true);

    const normalizedOrigin = origin.replace(/\/$/, "");

    if (allowedOrigins.includes(normalizedOrigin)) {
      callback(null, true);
    } else {
      console.error("Blocked by CORS:", origin);
      callback(new Error("Not allowed by CORS"));
    }
  }
}));

// Routes
app.use("/auth", authRoutes);
app.use("/user", userRoutes);

// Basic health
app.get("/", (req, res) => res.json({ ok: true }));