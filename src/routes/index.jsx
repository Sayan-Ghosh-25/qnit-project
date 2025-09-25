//routes/index.jsx
import { Routes, Route } from "react-router-dom";
import HomeLander from "../pages/Authentication/HomeLander";
import AuthModal from "../pages/Authentication/components/AuthModal";
import UserReg from "../pages/Authentication/components/UserReg";
import PasswordCreation from "../pages/Authentication/components/NewPassword";
import PasswordUpdate from "@/common/ChangePassword"
import UserDashboard from "../pages/User/UserDashboard";
import AdminDashboard from "../pages/Admin/AdminDashboard";
import PrivateRoute from "./PrivateRoute";
import AdminRoute from "./AdminRoute";

export default function AppRoutes() {
  return (
    <Routes>
      {/* Public Route */}
      <Route path="/" element={<HomeLander />} />
      <Route path="/SignIn" element={<AuthModal />} />
      <Route path="/SignUp" element={<UserReg />} />
      <Route path="/NewPassword" element={<PasswordCreation />} />

      {/* Private/User Routes */}
      <Route element={<PrivateRoute />}>
        <Route path="/User/*" element={<UserDashboard />} />
        <Route path="/ChangePassword" element={<PasswordUpdate />} />
      </Route>

      {/* Admin Routes */}
      <Route element={<AdminRoute />}>
        <Route path="/Admin/*" element={<AdminDashboard />} />
      </Route>

      {/* Fallback: 404 page can be added here */}
      <Route path="*" element={<p>404 Not Found</p>} />
    </Routes>
  );
}