// src/routes/PrivateRoute.jsx
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function PrivateRoute() {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (!user) return <Navigate to="/" replace />;

  return <Outlet />;
}