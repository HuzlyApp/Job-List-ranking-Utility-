"use client";

import { useState } from "react";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { DashboardTopbar } from "@/components/dashboard/DashboardTopbar";

interface AppShellProps {
  pageTitle: string;
  breadcrumbs?: { label: string; href?: string }[];
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export function AppShell({
  pageTitle,
  breadcrumbs,
  children,
  actions,
}: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <DashboardSidebar
        isCollapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <DashboardTopbar
          pageTitle={pageTitle}
          breadcrumbs={breadcrumbs}
          onMenuClick={() => setSidebarCollapsed(false)}
        />
        <main className="flex-1 overflow-y-auto">
          <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">{pageTitle}</h1>
              </div>
              {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
