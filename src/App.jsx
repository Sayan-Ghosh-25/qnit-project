// src/App.jsx
import AppRoutes from "./routes";
import { Analytics } from "@vercel/analytics/react";

function App() {
  return (
    <>
      <AppRoutes />
      <Analytics />
    </>
  );
}

export default App;