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
import { UserProfile } from "./pages/UserProfile";
import { TerritoriesAdmin } from "./pages/TerritoriesAdmin";
import { Payments } from "./pages/Payments";
import { AuditLogs } from "./pages/AuditLogs";
import { TemplatesAdmin } from "./pages/TemplatesAdmin";
import { TemplateRender } from "./pages/TemplateRender";
// Per Review 1.5 (2026-05-07): the standalone Installment Plans admin is
// removed. Plans are defined exclusively inside each solution version's
// pricing matrix now. Page file kept on disk for reference but not routed.
import { PriceApprovalsAdmin } from "./pages/PriceApprovalsAdmin";
import { PricingFormulasAdmin } from "./pages/PricingFormulasAdmin";
import { Quote } from "./pages/Quote";
import { CustomerFormAdmin } from "./pages/CustomerFormAdmin";
import { ContractEditRequestsAdmin } from "./pages/ContractEditRequestsAdmin";
import { AdvancePayAuthAdmin } from "./pages/AdvancePayAuthAdmin";
import { ReversalReviewsAdmin } from "./pages/ReversalReviewsAdmin";
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
              <Route path="/templates" element={<TemplatesAdmin />} />
              <Route path="/templates/:id/render" element={<TemplateRender />} />
              <Route path="/quote" element={<Quote />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/admin/payments" element={<Payments />} />
              <Route path="/admin/users" element={<UsersAdmin />} />
              <Route path="/admin/users/:id" element={<UserProfile />} />
              <Route path="/admin/territories" element={<TerritoriesAdmin />} />
              {/* Per Review 1.5 (2026-05-07): /admin/installment-plans
                  removed — plans live inside each version's pricing matrix. */}
              <Route path="/admin/price-approvals" element={<PriceApprovalsAdmin />} />
              <Route path="/admin/pricing-formulas" element={<PricingFormulasAdmin />} />
              <Route path="/admin/customer-form" element={<CustomerFormAdmin />} />
              <Route
                path="/admin/contract-edit-requests"
                element={<ContractEditRequestsAdmin />}
              />
              <Route path="/admin/advance-pay" element={<AdvancePayAuthAdmin />} />
              <Route path="/admin/reversal-reviews" element={<ReversalReviewsAdmin />} />
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
