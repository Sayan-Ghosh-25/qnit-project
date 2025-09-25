// server.js
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
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || "*"
}));

// Routes
app.use("/auth", authRoutes);
app.use("/user", userRoutes);

// Basic health
app.get("/", (req, res) => res.json({ ok: true }));

// Connection Test
app.get("/test-db", async (req, res) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .limit(1);

  if (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
  res.json({ ok: true, data });
});

app.listen(PORT, () => console.log(`Backend listening on http://localhost:${PORT}`));
