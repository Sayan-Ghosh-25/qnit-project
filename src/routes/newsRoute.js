import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();
const router = express.Router();

const NEWS_API_KEY = process.env.NEWS_API_KEY;

router.get("/", async (req, res) => {
  try {
    const query = "AI Software Engineering";
    const pageSize = 5;

    const response = await fetch(
      `https://gnews.io/api/v4/search?q=${encodeURIComponent(
        query
      )}&lang=en&max=${pageSize}&sortby=publishedAt&token=${NEWS_API_KEY}`
    );
    const data = await response.json();

    if (data.articles) {
      res.json(data.articles);
    } else {
      res.status(500).json({ error: "Failed to fetch news", details: data });
    }
  } catch (err) {
    console.error("News API Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;