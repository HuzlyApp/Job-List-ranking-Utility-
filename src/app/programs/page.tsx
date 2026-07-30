"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useAppContext } from "@/lib/app-context";
import { BuildingIcon } from "@/components/ui/icons";

interface MspProgram {
  id: string;
  name: string;
  platformName: string | null;
  vendorFeeType: string;
  vendorFeeValue: string;
  defaultWeeklyHours: number;
  currency: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function ProgramsPage() {
  const { tenantId } = useAppContext();
  const [programs, setPrograms] = useState<MspProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        await fetch("/api/setup").catch(() => undefined);
        const res = await fetch(
          `/api/msp-programs?tenantId=${encodeURIComponent(tenantId)}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error("Failed to load MSP programs");
        const data = await res.json();
        if (!cancelled) setPrograms(data.programs || []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  return (
    <AppShell
      pageTitle="MSP Programs"
      breadcrumbs={[
        { label: "Dashboard", href: "/" },
        { label: "MSP Programs" },
      ]}
    >
      {loading ? (
        <div className="text-center py-16 text-slate-500">Loading programs…</div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
          {error}
        </div>
      ) : programs.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <BuildingIcon className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-slate-900">No MSP programs yet</h2>
          <p className="text-sm text-slate-500 mt-1">
            Seed data will create Randstad iLabor on first setup.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {programs.map((program) => (
            <article
              key={program.id}
              className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <BuildingIcon className="w-5 h-5 text-emerald-700" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{program.name}</h2>
                    <p className="text-sm text-slate-500">
                      {program.platformName || "MSP portal"} · {program.currency}
                    </p>
                  </div>
                </div>
                <span
                  className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
                    program.isActive
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-slate-50 text-slate-600 border-slate-200"
                  }`}
                >
                  {program.isActive ? "Active" : "Inactive"}
                </span>
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-slate-500">Vendor fee</dt>
                  <dd className="font-medium text-slate-900">
                    {program.vendorFeeType === "percentage"
                      ? `${program.vendorFeeValue}%`
                      : program.vendorFeeType === "flat_hourly"
                        ? `$${program.vendorFeeValue}/hr`
                        : "None"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Weekly hours</dt>
                  <dd className="font-medium text-slate-900">
                    {program.defaultWeeklyHours}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Fee type</dt>
                  <dd className="font-medium text-slate-900 capitalize">
                    {program.vendorFeeType.replace("_", " ")}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Updated</dt>
                  <dd className="font-medium text-slate-900">
                    {new Date(program.updatedAt).toLocaleDateString()}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </AppShell>
  );
}
