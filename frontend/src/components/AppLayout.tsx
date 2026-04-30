import { type ComponentType, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Users as UsersIcon,
  FileSignature,
  Package,
  BarChart3,
  Shield,
  Sun,
  LogOut,
  Settings,
  Map,
  UserCog,
  Sparkles,
  ChevronDown,
  ChevronsLeft,
  Menu,
  History,
  Wallet,
  FileText,
  Calendar,
  ShieldAlert,
  Calculator,
  type LucideIcon,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth, useRole } from "../store/auth";
import { cn } from "../lib/cn";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "./ui/DropdownMenu";
import { Avatar } from "./ui/Avatar";
import { NotificationsBell } from "./NotificationsBell";
import type { User } from "../lib/api-types";

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  roles?: ("ADMIN" | "AREA_MANAGER" | "AGENT")[];
};

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Workspace",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/leads", label: "Leads", icon: Sparkles },
      { to: "/customers", label: "Customers", icon: UsersIcon },
      { to: "/contracts", label: "Contracts", icon: FileSignature },
    ],
  },
  {
    section: "Catalog",
    items: [
      { to: "/solutions", label: "Solutions", icon: Package },
      { to: "/quote", label: "Quote builder", icon: Calculator },
      { to: "/templates", label: "Contract templates", icon: FileText },
    ],
  },
  {
    section: "Insights",
    items: [
      {
        to: "/reports",
        label: "Reports",
        icon: BarChart3,
        roles: ["ADMIN", "AREA_MANAGER"],
      },
    ],
  },
  {
    section: "Administration",
    items: [
      { to: "/admin", label: "Bonuses", icon: Shield, roles: ["ADMIN"] },
      { to: "/admin/payments", label: "Payments", icon: Wallet, roles: ["ADMIN"] },
      {
        to: "/admin/installment-plans",
        label: "Installment plans",
        icon: Calendar,
        roles: ["ADMIN"],
      },
      {
        to: "/admin/price-approvals",
        label: "Price approvals",
        icon: ShieldAlert,
        roles: ["ADMIN", "AREA_MANAGER"],
      },
      {
        to: "/admin/pricing-formulas",
        label: "Pricing formulas",
        icon: Calculator,
        roles: ["ADMIN"],
      },
      { to: "/admin/users", label: "Users", icon: UserCog, roles: ["ADMIN"] },
      { to: "/admin/territories", label: "Territories", icon: Map, roles: ["ADMIN"] },
      {
        to: "/admin/customer-form",
        label: "Customer form",
        icon: UsersIcon,
        roles: ["ADMIN"],
      },
      { to: "/admin/audit-logs", label: "Audit logs", icon: History, roles: ["ADMIN"] },
    ],
  },
];

export function AppLayout() {
  const navigate = useNavigate();
  const clear = useAuth((s) => s.clear);
  const role = useRole();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: me } = useQuery<User>({
    queryKey: ["me"],
    queryFn: async () => (await api.get("/users/me")).data,
  });

  const logout = () => {
    clear();
    navigate("/signin");
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed lg:sticky top-0 z-40 h-screen bg-white border-r border-slate-200 flex flex-col transition-all duration-200",
          // On mobile, the drawer is full-width; on lg+, fixed sidebar width.
          mobileOpen ? "w-full lg:w-64" : collapsed ? "lg:w-16 w-64" : "w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div
          className={cn(
            "h-16 flex items-center border-b border-slate-200 px-4",
            collapsed && "justify-center px-0"
          )}
        >
          <NavLink to="/dashboard" className="flex items-center gap-2 font-semibold text-slate-900">
            <span className="size-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 grid place-items-center text-white shadow-sm shrink-0">
              <Sun className="size-4" />
            </span>
            {!collapsed && <span>PV Sales</span>}
          </NavLink>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-5">
          {NAV.map((section) => {
            const items = section.items.filter(
              (n) => !n.roles || (role && n.roles.includes(role))
            );
            if (items.length === 0) return null;
            return (
              <div key={section.section}>
                {!collapsed && (
                  <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    {section.section}
                  </div>
                )}
                <div className="space-y-0.5">
                  {items.map((item) => (
                    <NavItemLink
                      key={item.to}
                      item={item}
                      collapsed={collapsed && !mobileOpen}
                      onNavigate={() => setMobileOpen(false)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="p-2 border-t border-slate-200">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              "hidden lg:flex w-full items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition",
              collapsed && "justify-center px-0"
            )}
            title={collapsed ? "Expand" : "Collapse"}
          >
            <ChevronsLeft className={cn("size-4 transition", collapsed && "rotate-180")} />
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-slate-200 flex items-center justify-between px-4 sm:px-6">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-2 -ml-2 rounded-md hover:bg-slate-100"
          >
            <Menu className="size-5 text-slate-600" />
          </button>
          <div className="hidden lg:block flex-1" />
          <div className="flex items-center gap-2">
            <NotificationsBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-lg hover:bg-slate-100 transition">
                  <Avatar name={me?.fullName ?? "U"} size="sm" />
                  <div className="hidden sm:flex flex-col items-start leading-tight">
                    <span className="text-sm font-medium text-slate-900">{me?.fullName ?? "—"}</span>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wide">{role ?? ""}</span>
                  </div>
                  <ChevronDown className="hidden sm:block size-4 text-slate-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56">
                <DropdownMenuLabel>
                  <div className="text-sm font-medium text-slate-900">{me?.fullName ?? "—"}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{me?.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/notifications")}>
                  <Settings className="size-4" /> Notifications
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="text-red-600 focus:text-red-700 focus:bg-red-50">
                  <LogOut className="size-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-[1400px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NavItemLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon as ComponentType<{ className?: string }>;
  return (
    <NavLink
      to={item.to}
      end={item.to === "/dashboard"}
      onClick={() => onNavigate?.()}
      className={({ isActive }) =>
        cn(
          "group flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition",
          collapsed && "justify-center px-0",
          isActive
            ? "bg-brand-50 text-brand-700"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        )
      }
      title={collapsed ? item.label : undefined}
    >
      <Icon className="size-4 shrink-0" />
      {!collapsed && <span>{item.label}</span>}
    </NavLink>
  );
}
