// src/routes/AdminRoute.jsx
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function AdminRoute() {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (!user) return <Navigate to="/" replace />;

  // check role from user_metadata
  if (user.user_metadata?.role !== "admin") {
    return <Navigate to="/User/Dashboard" replace />;
  }

  return <Outlet />;
}
