// src/App.jsx
import { useEffect } from "react";
import AppRoutes from "./routes";

function App() {
  useEffect(() => {
    fetch("https://your-backend.onrender.com/test-db")
      .then((res) => res.json())
      .then((data) => {
        console.log("✅ Backend response:", data);
      })
      .catch((err) => {
        console.error("❌ Error connecting to backend:", err);
      });
  }, []);

  return <AppRoutes />;
}

export default App;
