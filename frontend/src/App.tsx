import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Welcome } from "./pages/Welcome";
import { Login } from "./pages/Login";
import { Signup } from "./pages/Signup";
import { Dashboard } from "./pages/Dashboard";
import { Leads } from "./pages/Leads";
import { Customers } from "./pages/Customers";
import { CustomerNew } from "./pages/CustomerNew";
import { CustomerDetail } from "./pages/CustomerDetail";
import { Contracts } from "./pages/Contracts";
import { ContractNew } from "./pages/ContractNew";
import { ContractDetail } from "./pages/ContractDetail";
import { Solutions } from "./pages/Solutions";
import { SolutionDetail } from "./pages/SolutionDetail";
import { Reports } from "./pages/Reports";
import { Admin } from "./pages/Admin";
import { UsersAdmin } from "./pages/UsersAdmin";
import { TerritoriesAdmin } from "./pages/TerritoriesAdmin";
import { Payments } from "./pages/Payments";
import { AuditLogs } from "./pages/AuditLogs";
import { NotificationsPage } from "./pages/Notifications";
import { RequireAuth } from "./components/RequireAuth";
import { AppLayout } from "./components/AppLayout";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Welcome />} />
          <Route path="/signin" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/login" element={<Navigate to="/signin" replace />} />
          <Route element={<RequireAuth />}>
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/leads" element={<Leads />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/customers/new" element={<CustomerNew />} />
              <Route path="/customers/:id" element={<CustomerDetail />} />
              <Route path="/contracts" element={<Contracts />} />
              <Route path="/contracts/new" element={<ContractNew />} />
              <Route path="/contracts/:id" element={<ContractDetail />} />
              <Route path="/solutions" element={<Solutions />} />
              <Route path="/solutions/:id" element={<SolutionDetail />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/admin/payments" element={<Payments />} />
              <Route path="/admin/users" element={<UsersAdmin />} />
              <Route path="/admin/territories" element={<TerritoriesAdmin />} />
              <Route path="/admin/audit-logs" element={<AuditLogs />} />
              <Route path="/notifications" element={<NotificationsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
