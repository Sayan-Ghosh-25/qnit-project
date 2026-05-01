import { useEffect, useState } from "react";
import styles from "./TrendingNews.module.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL;

export default function TrendingNews() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function fetchNews() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/news`);
      if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setArticles(data);
      } else {
        console.error("Unexpected API response:", data);
        setError("Invalid response format");
      }
    } catch (err) {
      console.error("Failed to fetch news:", err);
      setError("Failed to load news! Please try again later");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchNews();
  }, []);

  return (
    <section className={styles.newsSection} aria-label="Software Industry Trending News">
      <div className={styles.news}>
      <h2>Trending Tech News</h2>
      <p>Get updated with the latest news daily</p>
      </div>
      {loading && (
        <div className={styles.skeletonWrapper}>
          {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={styles.skeletonRow}>
            <div className={styles.skeletonLabel}></div>
            <div className={styles.skeletonInput}></div>
         </div>
        ))}
      </div>)}
      {!loading && articles.length === 0 && <p className= {styles.warning}>Sorry, No news available right now!</p>}

      <ul className={styles.newsList}>
        {articles.map((article, idx) => (
          <li key={idx} className={styles.newsItem}>
            <a href={article.url} target="_blank" rel="noopener noreferrer">
              <strong>{article.title}</strong>
            </a>
            {article.description && <p>{article.description}</p>}
            <small>
              {new Date(article.publishedAt).toLocaleDateString("en-IN")}
            </small>
          </li>
        ))}
      </ul>
    </section>
  );
}