"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useAppContext } from "@/lib/app-context";
import { DollarSignIcon, GaugeIcon } from "@/components/ui/icons";

interface AssumptionSet {
  id: string;
  name: string;
  version: number;
  mspProgramId: string;
  ficaPercent: string;
  futaSutaHourly: string;
  standardWorkersCompHourly: string;
  highRiskWorkersCompHourly: string;
  healthcareWorkersCompHourly: string | null;
  payrollProcessingHourly: string;
  complianceHourly: string;
  insuranceHourly: string;
  recruitingHourly: string;
  overheadHourly: string;
  benefitsHourly: string;
  ptoHourly: string;
  otherHourlyCosts: string;
  isActive: boolean;
}

interface ScoringWeight {
  id: string;
  name: string;
  version: number;
  mspProgramId: string;
  competitionWeight: number;
  profitabilityWeight: number;
  fillabilityWeight: number;
  billRateWeight: number;
  durationWeight: number;
  isActive: boolean;
}

interface Program {
  id: string;
  name: string;
}

export default function AssumptionsPage() {
  const { tenantId } = useAppContext();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [assumptions, setAssumptions] = useState<AssumptionSet[]>([]);
  const [weights, setWeights] = useState<ScoringWeight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        await fetch("/api/setup").catch(() => undefined);
        const res = await fetch(
          `/api/config?tenantId=${encodeURIComponent(tenantId)}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error("Failed to load assumptions");
        const data = await res.json();
        if (!cancelled) {
          setPrograms(data.programs || []);
          setAssumptions(data.assumptions || []);
          setWeights(data.weights || []);
        }
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

  const programName = (id: string) =>
    programs.find((p) => p.id === id)?.name || id.slice(0, 8);

  return (
    <AppShell
      pageTitle="Assumptions"
      breadcrumbs={[
        { label: "Dashboard", href: "/" },
        { label: "Assumptions" },
      ]}
    >
      {loading ? (
        <div className="text-center py-16 text-slate-500">Loading assumptions…</div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
          {error}
        </div>
      ) : (
        <div className="space-y-8">
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <DollarSignIcon className="w-5 h-5 text-emerald-600" />
              <h2 className="text-lg font-semibold text-slate-900">
                Financial assumption sets
              </h2>
            </div>
            {assumptions.length === 0 ? (
              <p className="text-sm text-slate-500">No active assumption sets found.</p>
            ) : (
              assumptions.map((set) => (
                <div
                  key={set.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div>
                      <h3 className="font-semibold text-slate-900">{set.name}</h3>
                      <p className="text-sm text-slate-500">
                        {programName(set.mspProgramId)} · v{set.version}
                      </p>
                    </div>
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {set.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 text-sm">
                    {[
                      ["FICA %", set.ficaPercent],
                      ["FUTA/SUTA $/hr", set.futaSutaHourly],
                      ["Std WC $/hr", set.standardWorkersCompHourly],
                      ["High-risk WC $/hr", set.highRiskWorkersCompHourly],
                      ["Healthcare WC", set.healthcareWorkersCompHourly ?? "—"],
                      ["Payroll $/hr", set.payrollProcessingHourly],
                      ["Compliance $/hr", set.complianceHourly],
                      ["Insurance $/hr", set.insuranceHourly],
                      ["Recruiting $/hr", set.recruitingHourly],
                      ["Overhead $/hr", set.overheadHourly],
                      ["Benefits $/hr", set.benefitsHourly],
                      ["PTO $/hr", set.ptoHourly],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-slate-500">{label}</dt>
                        <dd className="font-medium text-slate-900">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))
            )}
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <GaugeIcon className="w-5 h-5 text-emerald-600" />
              <h2 className="text-lg font-semibold text-slate-900">
                Opportunity score weights
              </h2>
            </div>
            {weights.length === 0 ? (
              <p className="text-sm text-slate-500">No active scoring weights found.</p>
            ) : (
              weights.map((set) => (
                <div
                  key={set.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div>
                      <h3 className="font-semibold text-slate-900">{set.name}</h3>
                      <p className="text-sm text-slate-500">
                        {programName(set.mspProgramId)} · v{set.version}
                      </p>
                    </div>
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Sum{" "}
                      {set.competitionWeight +
                        set.profitabilityWeight +
                        set.fillabilityWeight +
                        set.billRateWeight +
                        set.durationWeight}
                      %
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                    {[
                      ["Competition", set.competitionWeight],
                      ["Profitability", set.profitabilityWeight],
                      ["Fillability", set.fillabilityWeight],
                      ["Bill rate", set.billRateWeight],
                      ["Duration", set.durationWeight],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-slate-500">{label}</dt>
                        <dd className="font-medium text-slate-900">{value}%</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}
