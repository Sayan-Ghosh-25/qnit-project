// src/components/TrendingNews.jsx
import { useEffect, useState } from "react";
import styles from "./TrendingNews.module.css";

const NEWS_API_KEY = import.meta.env.VITE_NEWS_API_KEY;
const QUERY = "AI Software Engineering";
const PAGE_SIZE = 5;

export default function TrendingNews() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchNews() {
      setLoading(true);
      try {
        const res = await fetch(
          `https://gnews.io/api/v4/search?q=${encodeURIComponent(
            QUERY
          )}&lang=en&max=${PAGE_SIZE}&sortby=publishedAt&token=${NEWS_API_KEY}`
        );
        const data = await res.json();
        if (data.articles && Array.isArray(data.articles)) {
          setArticles(data.articles);
        } else {
          console.error("GNews API error:", data);
        }
      } catch (err) {
        console.error("Failed to fetch news:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchNews();
  }, []);

  return (
    <section className={styles.newsSection} aria-label="Software Industry Trending News">
      <h2>Trending Software Industry News</h2>
      {loading && <p style={{ textAlign: "center" }}>Loading News...</p>}
      {!loading && articles.length === 0 && <p style={{ textAlign: "center" }}>No news available right now!</p>}
      <ul className={styles.newsList}>
        {articles.map((article, idx) => (
          <li key={idx} className={styles.newsItem}>
            <a href={article.url} target="_blank" rel="noopener noreferrer">
              <strong>{article.title}</strong>
            </a>
            {article.description && <p>{article.description}</p>}
            <small>{new Date(article.publishedAt).toLocaleDateString()}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}