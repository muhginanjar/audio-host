import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Icon } from "./icons";
import { ProgressBar, cn } from "./ui";
import { api } from "../lib/api";
import { formatBytes } from "../lib/format";
import type { MeDTO } from "@shared/types";

interface NavItem {
  to: string;
  label: string;
  icon: string;
  admin?: boolean;
}

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Main",
    items: [
      { to: "/", label: "Home", icon: "dashboard" },
      { to: "/dashboard", label: "Dashboard", icon: "logs" },
      { to: "/audio", label: "Audio", icon: "music" },
      { to: "/folders", label: "Folders", icon: "file" },
      { to: "/upload", label: "Upload", icon: "upload" },
      { to: "/docs", label: "API Documentation", icon: "code" },
      { to: "/profile", label: "Profile", icon: "user" },
    ],
  },
  {
    section: "Administration",
    items: [
      { to: "/admin", label: "Admin Dashboard", icon: "shield", admin: true },
      { to: "/admin/users", label: "Users", icon: "users", admin: true },
      { to: "/admin/audio", label: "All Audio", icon: "music", admin: true },
      { to: "/admin/logs", label: "API Logs", icon: "logs", admin: true },
      { to: "/admin/settings", label: "System Settings", icon: "settings", admin: true },
    ],
  },
];

export function Layout({ pathname, me, children }: { pathname: string; me: MeDTO; children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAdmin = me.role === "admin";

  async function logout() {
    await api.logout();
    queryClient.clear();
    navigate({ to: "/login" });
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white">
          <Icon name="music" className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold leading-tight text-slate-900">Audio Host</p>
          <p className="text-[11px] leading-tight text-slate-500">Delivery Platform</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {NAV.map((group) => {
          if (group.section === "Administration" && !isAdmin) return null;
          return (
            <div key={group.section} className="mb-5">
              <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{group.section}</p>
              <div className="space-y-0.5">
                {group.items
                  .filter((item) => !item.admin || isAdmin)
                  .map((item) => {
                    const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                          active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                        )}
                      >
                        <Icon name={item.icon} className="h-4 w-4 shrink-0" />
                        {item.label}
                      </Link>
                    );
                  })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-slate-100 px-4 py-4">
        <div className="mb-2 flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
            {me.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-800">{me.name}</p>
            <p className="truncate text-xs text-slate-500">{me.email}</p>
          </div>
        </div>
        <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
          <span>{formatBytes(me.storage.used_bytes)} used</span>
          <span>{me.storage.percent_used}%</span>
        </div>
        <ProgressBar percent={me.storage.percent_used} />
        <button onClick={logout} className="mt-3 flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-red-600">
          <Icon name="logout" className="h-3.5 w-3.5" /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-full">
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:block">{sidebar}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
          <aside className="fade-in absolute inset-y-0 left-0 w-72 border-r border-slate-200 bg-white">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg border border-slate-200 p-2 text-slate-600"
            aria-label="Open menu"
          >
            <Icon name="logs" className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-slate-800">Audio Host</span>
          <Link to="/upload" className="p-2 text-indigo-600" aria-label="Upload">
            <Icon name="upload" className="h-5 w-5" />
          </Link>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {sub && <p className="mt-1 text-sm text-slate-500">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
