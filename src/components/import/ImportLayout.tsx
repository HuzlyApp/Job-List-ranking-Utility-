"use client";

import { ReactNode } from "react";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { DashboardTopbar } from "@/components/dashboard/DashboardTopbar";

interface ImportLayoutProps {
  children: ReactNode;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  pageTitle: string;
  breadcrumbs?: { label: string; href?: string }[];
}

export function ImportLayout({
  children,
  sidebarCollapsed,
  onToggleSidebar,
  pageTitle,
  breadcrumbs,
}: ImportLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-50 flex">
      <DashboardSidebar
        isCollapsed={sidebarCollapsed}
        onToggle={onToggleSidebar}
      />

      <div className="flex-1 flex flex-col min-w-0 lg:ml-0">
        <DashboardTopbar
          pageTitle={pageTitle}
          breadcrumbs={breadcrumbs}
        />

        <main className="flex-1 overflow-y-auto">
          <div className="px-4 sm:px-6 lg:px-8 py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
