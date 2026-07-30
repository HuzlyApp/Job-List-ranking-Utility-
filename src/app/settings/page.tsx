"use client";

import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { ClearDataButton } from "@/components/dashboard/ClearDataButton";
import { useAppContext } from "@/lib/app-context";

export default function SettingsPage() {
  const { tenantId, userId, defaultMspProgramId } = useAppContext();

  return (
    <AppShell
      pageTitle="Settings"
      breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Settings" }]}
    >
      <div className="space-y-6 max-w-3xl">
        <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Workspace</h2>
          <dl className="grid gap-3 text-sm">
            <div>
              <dt className="text-slate-500">Tenant ID</dt>
              <dd className="font-mono text-slate-900 break-all">{tenantId}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Default user ID</dt>
              <dd className="font-mono text-slate-900 break-all">{userId}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Default MSP program ID</dt>
              <dd className="font-mono text-slate-900 break-all">
                {defaultMspProgramId}
              </dd>
            </div>
          </dl>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Quick links</h2>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href="/programs" className="text-emerald-600 hover:text-emerald-700 font-medium">
              MSP Programs
            </Link>
            <Link
              href="/assumptions"
              className="text-emerald-600 hover:text-emerald-700 font-medium"
            >
              Assumptions
            </Link>
            <Link
              href="/requisitions/import"
              className="text-emerald-600 hover:text-emerald-700 font-medium"
            >
              Import
            </Link>
            <Link href="/history" className="text-emerald-600 hover:text-emerald-700 font-medium">
              Import history
            </Link>
          </div>
        </section>

        <section className="bg-white border border-red-100 rounded-xl p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Danger zone</h2>
          <p className="text-sm text-slate-500 mb-4">
            Delete imported and analyzed data for this tenant. Seed configuration is preserved.
          </p>
          <ClearDataButton tenantId={tenantId} />
        </section>
      </div>
    </AppShell>
  );
}
