"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SearchIcon,
  BellIcon,
  UserIcon,
  ChevronDownIcon,
  MenuIcon,
} from "@/components/ui/icons";

interface DashboardTopbarProps {
  pageTitle: string;
  breadcrumbs?: { label: string; href?: string }[];
  onMenuClick?: () => void;
}

export function DashboardTopbar({ pageTitle, breadcrumbs, onMenuClick }: DashboardTopbarProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
      <div className="flex items-center justify-between h-14 px-4 lg:px-6">
        {/* Left: Breadcrumb & Title */}
        <div className="flex items-center gap-4">
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 -ml-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
            aria-label="Toggle menu"
          >
            <MenuIcon className="w-5 h-5" />
          </button>

          <div className="hidden sm:block">
            {breadcrumbs && breadcrumbs.length > 0 ? (
              <nav aria-label="Breadcrumb">
                <ol className="flex items-center gap-2 text-sm">
                  {breadcrumbs.map((crumb, index) => (
                    <li key={index} className="flex items-center gap-2">
                      {index > 0 && (
                        <span className="text-slate-500">/</span>
                      )}
                      {crumb.href ? (
                        <Link 
                          href={crumb.href}
                          className="text-slate-700 hover:text-slate-900 font-bold"
                        >
                          {crumb.label}
                        </Link>
                      ) : (
                        <span className="text-slate-900 font-bold">
                          {crumb.label}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </nav>
            ) : (
              <h1 className="text-lg font-bold text-slate-900">{pageTitle}</h1>
            )}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Search Shortcut */}
          <button 
            className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            aria-label="Search"
          >
            <SearchIcon className="w-4 h-4" />
            <span className="text-xs">Search</span>
            <kbd className="hidden lg:inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded">
              ⌘K
            </kbd>
          </button>

          {/* Notifications */}
          <button 
            className="relative p-2 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Notifications"
          >
            <BellIcon className="w-5 h-5" />
            {/* Notification Badge */}
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-600 rounded-full ring-2 ring-white" />
          </button>

          {/* User Menu */}
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              aria-expanded={userMenuOpen}
              aria-haspopup="true"
            >
              <div className="w-7 h-7 bg-emerald-100 rounded-full flex items-center justify-center">
                <UserIcon className="w-4 h-4 text-emerald-600" />
              </div>
              <ChevronDownIcon className="w-4 h-4 hidden sm:block" />
            </button>

            {/* Dropdown */}
            {userMenuOpen && (
              <>
                <div 
                  className="fixed inset-0 z-40"
                  onClick={() => setUserMenuOpen(false)}
                />
                <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-slate-300 rounded-lg shadow-lg z-50 py-1">
                  <div className="px-4 py-2 border-b border-slate-200">
                    <p className="text-sm font-bold text-slate-900">Recruiter User</p>
                    <p className="text-xs font-medium text-slate-600">recruiter@zipstaff.com</p>
                  </div>
                  <Link
                    href="/profile"
                    className="block px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-100"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    Profile
                  </Link>
                  <Link
                    href="/settings"
                    className="block px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-100"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    Settings
                  </Link>
                  <div className="h-px bg-slate-200 my-1" />
                  <button
                    className="w-full text-left px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
