import { Suspense } from "react";
import { Dashboard } from "@/components/dashboard/Dashboard";

// Loading fallback for the dashboard
function DashboardLoading() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="animate-pulse flex flex-col items-center">
        <div className="w-12 h-12 bg-slate-200 rounded-full mb-4" />
        <div className="h-4 w-32 bg-slate-200 rounded" />
      </div>
    </div>
  );
}

// This is the main requisitions listing page
export default function RequisitionsPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <Dashboard />
    </Suspense>
  );
}
