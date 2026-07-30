"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HomeIcon,
  UploadIcon,
  FileTextIcon,
  HistoryIcon,
  BuildingIcon,
  DollarSignIcon,
  SettingsIcon,
  HelpCircleIcon,
  UserIcon,
  LogOutIcon,
  MenuIcon,
  XIcon,
  BriefcaseIcon,
} from "@/components/ui/icons";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const mainNavItems: NavItem[] = [
  { href: "/", label: "Overview", icon: <HomeIcon className="w-5 h-5" /> },
  { href: "/requisitions/import", label: "Import", icon: <UploadIcon className="w-5 h-5" /> },
  { href: "/requisitions", label: "Requisitions", icon: <FileTextIcon className="w-5 h-5" /> },
  { href: "/history", label: "History", icon: <HistoryIcon className="w-5 h-5" /> },
];

const secondaryNavItems: NavItem[] = [
  { href: "/programs", label: "MSP Programs", icon: <BuildingIcon className="w-5 h-5" /> },
  { href: "/assumptions", label: "Assumptions", icon: <DollarSignIcon className="w-5 h-5" /> },
  { href: "/settings", label: "Settings", icon: <SettingsIcon className="w-5 h-5" /> },
];

interface DashboardSidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

export function DashboardSidebar({ isCollapsed, onToggle }: DashboardSidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const NavLink = ({ item }: { item: NavItem }) => {
    const active = isActive(item.href);
    return (
      <Link
        href={item.href}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold transition-colors
          ${active 
            ? "bg-emerald-50 text-emerald-800 border border-emerald-300" 
            : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
          }
          ${isCollapsed ? "justify-center" : ""}
        `}
        title={isCollapsed ? item.label : undefined}
      >
        <span className={active ? "text-emerald-700" : "text-slate-600"}>
          {item.icon}
        </span>
        {!isCollapsed && <span>{item.label}</span>}
      </Link>
    );
  };

  return (
    <>
      {/* Mobile Overlay */}
      {mobileOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile Drawer */}
      <aside 
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 transform transition-transform duration-200 ease-in-out lg:hidden
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b border-slate-200">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
              <BriefcaseIcon className="w-5 h-5 text-white" />
            </div>
            <span className="font-semibold text-slate-900">Zip Staff</span>
          </Link>
          <button
            onClick={() => setMobileOpen(false)}
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
            aria-label="Close menu"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <nav className="p-4 space-y-1">
          {mainNavItems.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </nav>

        <div className="px-4 py-2">
          <div className="h-px bg-slate-200" />
        </div>

        <nav className="p-4 space-y-1">
          {secondaryNavItems.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-200 bg-white">
          <div className="space-y-1">
            <Link
              href="/help"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              <HelpCircleIcon className="w-5 h-5 text-slate-500" />
              <span>Help & Docs</span>
            </Link>
            <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">
              <UserIcon className="w-5 h-5 text-slate-500" />
              <span>Profile</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Desktop Sidebar */}
      <aside 
        className={`hidden lg:flex flex-col h-screen bg-white border-r border-slate-200 transition-all duration-200
          ${isCollapsed ? "w-16" : "w-64"}
        `}
      >
        {/* Logo */}
        <div className={`flex items-center h-16 border-b border-slate-200 ${isCollapsed ? "justify-center px-2" : "px-4"}`}>
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <BriefcaseIcon className="w-5 h-5 text-white" />
            </div>
            {!isCollapsed && (
              <div className="flex flex-col">
                <span className="font-semibold text-slate-900 leading-tight">Zip Staff</span>
                <span className="text-xs text-slate-500 leading-tight">Intelligence</span>
              </div>
            )}
          </Link>
        </div>

        {/* Main Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {mainNavItems.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}

          {!isCollapsed && (
            <div className="my-4 px-3">
              <div className="h-px bg-slate-200" />
              <p className="mt-4 mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Configuration
              </p>
            </div>
          )}
          
          {isCollapsed && <div className="my-4 h-px bg-slate-200 mx-2" />}

          {secondaryNavItems.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </nav>

        {/* Bottom Actions */}
        <div className={`p-3 border-t border-slate-200 ${isCollapsed ? "space-y-2" : "space-y-1"}`}>
          {!isCollapsed && (
          <>
            <Link
              href="/help"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-100 hover:text-slate-900"
            >
              <HelpCircleIcon className="w-5 h-5 text-slate-600" />
              <span>Help</span>
            </Link>
            <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-100 hover:text-slate-900">
              <UserIcon className="w-5 h-5 text-slate-600" />
              <span>Profile</span>
            </button>
            <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-100 hover:text-slate-900">
              <LogOutIcon className="w-5 h-5 text-slate-600" />
              <span>Sign Out</span>
            </button>
          </>
          )}
          {isCollapsed && (
            <>
              <button 
                className="w-full flex justify-center p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
                title="Help"
              >
                <HelpCircleIcon className="w-5 h-5" />
              </button>
              <button 
                className="w-full flex justify-center p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
                title="Profile"
              >
                <UserIcon className="w-5 h-5" />
              </button>
            </>
          )}
        </div>

        {/* Collapse Toggle */}
        <button
          onClick={onToggle}
          className="hidden lg:flex items-center justify-center h-10 border-t border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg 
            className={`w-5 h-5 transition-transform ${isCollapsed ? "rotate-180" : ""}`} 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      </aside>

      {/* Mobile Menu Button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-30 lg:hidden p-2 bg-white border border-slate-200 rounded-lg shadow-sm text-slate-600 hover:text-slate-900"
        aria-label="Open menu"
      >
        <MenuIcon className="w-5 h-5" />
      </button>
    </>
  );
}
