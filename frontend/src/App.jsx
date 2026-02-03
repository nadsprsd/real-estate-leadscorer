import { Routes, Route } from "react-router-dom";

import Login from "./pages/Login";
import Register from "./pages/Register";

import DashboardLayout from "./layout/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import Score from "./pages/Score";
import History from "./pages/History";
import Billing from "./pages/Billing";
import Settings from "./pages/Settings";
import TestApi from "./TestAPI";

import ProtectedRoute from "./layout/ProtectedRoute";

function App() {
  // 🔹 TEMP: enable to test API
  // return <TestApi />;

  // 🔹 NORMAL APP
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Protected Routes */}
      <Route
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/score" element={<Score />} />
        <Route path="/history" element={<History />} />
        <Route path="/billing" element={<Billing />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

export default App;
