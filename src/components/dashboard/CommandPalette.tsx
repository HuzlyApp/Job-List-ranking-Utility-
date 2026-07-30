"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  SearchIcon,
  HomeIcon,
  UploadIcon,
  FileTextIcon,
  HistoryIcon,
  BuildingIcon,
  DollarSignIcon,
  SettingsIcon,
  BriefcaseIcon,
} from "@/components/ui/icons";
import { useAppContext } from "@/lib/app-context";
import { DetailDrawer } from "./DetailDrawer";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

interface NavItem {
  id: string;
  label: string;
  href: string;
  description: string;
  icon: ReactNode;
}

interface SearchRequisition {
  requisition: {
    id: string;
    requisitionId: string | null;
    status: string | null;
    sourceCustomerName: string | null;
    normalizedCustomerName: string | null;
    jobTitle: string | null;
    location: string | null;
    remoteOrOnsite: string | null;
    sourceDuration: string | null;
    numberOfPositions: number | null;
    submissionCount: number | null;
    activeSubmissionCount: number | null;
    displayedVendorRate: string | null;
    sourceConfidence: string;
    isNewToday: boolean;
    isNoLongerVisible: boolean;
    firstSeenAt: string;
    lastSeenAt: string;
  };
  analysis: {
    rank: number | null;
    opportunityScore: number | null;
    finalRecommendation: string | null;
    estimatedProfitPerHour: string | null;
    netMarginPercent: string | null;
    weeklyProfit: string | null;
    assignmentProfit: string | null;
    effectiveVendorRate: string | null;
    recommendedPayMin: string | null;
    recommendedPayMax: string | null;
    selectedPayRate: string | null;
    fillabilityScore: number | null;
    fillabilityLabel: string | null;
    requiresManualReview: boolean;
  } | null;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: "nav-overview",
    label: "Overview",
    href: "/",
    description: "Dashboard and ranked requisitions",
    icon: <HomeIcon className="w-4 h-4" />,
  },
  {
    id: "nav-import",
    label: "Import",
    href: "/requisitions/import",
    description: "Upload MSP requisition files",
    icon: <UploadIcon className="w-4 h-4" />,
  },
  {
    id: "nav-requisitions",
    label: "Requisitions",
    href: "/requisitions",
    description: "Browse analyzed requisitions",
    icon: <FileTextIcon className="w-4 h-4" />,
  },
  {
    id: "nav-history",
    label: "History",
    href: "/history",
    description: "Import and analysis history",
    icon: <HistoryIcon className="w-4 h-4" />,
  },
  {
    id: "nav-programs",
    label: "MSP Programs",
    href: "/programs",
    description: "Program configuration",
    icon: <BuildingIcon className="w-4 h-4" />,
  },
  {
    id: "nav-assumptions",
    label: "Assumptions",
    href: "/assumptions",
    description: "Financial assumptions",
    icon: <DollarSignIcon className="w-4 h-4" />,
  },
  {
    id: "nav-settings",
    label: "Settings",
    href: "/settings",
    description: "App settings",
    icon: <SettingsIcon className="w-4 h-4" />,
  },
];

type ResultItem =
  | { type: "nav"; item: NavItem }
  | { type: "requisition"; item: SearchRequisition };

function matchesQuery(text: string | null | undefined, query: string) {
  if (!text) return false;
  return text.toLowerCase().includes(query);
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const { tenantId } = useAppContext();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [requisitions, setRequisitions] = useState<SearchRequisition[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<SearchRequisition | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
      setRequisitions([]);
      return;
    }
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const q = query.trim().toLowerCase();
    if (q.length < 2) {
      setRequisitions([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          tenantId,
          page: "1",
          limit: "50",
          sortBy: "rank",
          sortOrder: "asc",
        });
        const response = await fetch(`/api/requisitions?${params}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Failed to search");
        const data = await response.json();
        const rows = (data.requisitions || []) as SearchRequisition[];
        const filtered = rows.filter((row) => {
          const r = row.requisition;
          return (
            matchesQuery(r.jobTitle, q) ||
            matchesQuery(r.normalizedCustomerName, q) ||
            matchesQuery(r.sourceCustomerName, q) ||
            matchesQuery(r.requisitionId, q) ||
            matchesQuery(r.location, q)
          );
        });
        if (!cancelled) setRequisitions(filtered.slice(0, 8));
      } catch {
        if (!cancelled) setRequisitions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query, tenantId]);

  const q = query.trim().toLowerCase();
  const navResults = useMemo(
    () =>
      NAV_ITEMS.filter((item) => {
        if (!q) return true;
        return (
          item.label.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q)
        );
      }),
    [q]
  );

  const results: ResultItem[] = useMemo(
    () => [
      ...navResults.map((item) => ({ type: "nav" as const, item })),
      ...requisitions.map((item) => ({ type: "requisition" as const, item })),
    ],
    [navResults, requisitions]
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [query, requisitions.length]);

  const selectResult = useCallback(
    (result: ResultItem) => {
      if (result.type === "nav") {
        onClose();
        router.push(result.item.href);
        return;
      }
      onClose();
      setSelectedDetail(result.item);
    },
    [onClose, router]
  );

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) =>
          results.length === 0 ? 0 : (index + 1) % results.length
        );
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) =>
          results.length === 0
            ? 0
            : (index - 1 + results.length) % results.length
        );
        return;
      }
      if (event.key === "Enter" && results[activeIndex]) {
        event.preventDefault();
        selectResult(results[activeIndex]);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, results, activeIndex, selectResult]);

  if (!open && !selectedDetail) return null;

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-[60]">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <div className="relative mx-auto mt-[12vh] w-full max-w-xl px-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Search"
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
            >
              <div className="flex items-center gap-3 border-b border-slate-200 px-4">
                <SearchIcon className="w-5 h-5 shrink-0 text-slate-500" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search pages and requisitions..."
                  className="w-full bg-transparent py-3.5 text-sm text-slate-900 placeholder:text-slate-500 outline-none"
                  aria-controls={listId}
                  aria-autocomplete="list"
                />
                <kbd className="hidden sm:inline-flex rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                  ESC
                </kbd>
              </div>

              <ul
                id={listId}
                role="listbox"
                className="max-h-[min(60vh,420px)] overflow-y-auto py-2"
              >
                {navResults.length > 0 && (
                  <li className="px-3 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Pages
                  </li>
                )}
                {navResults.map((item, index) => {
                  const resultIndex = index;
                  const active = resultIndex === activeIndex;
                  return (
                    <li key={item.id} role="option" aria-selected={active}>
                      <button
                        type="button"
                        className={`flex w-full items-center gap-3 px-3 py-2.5 text-left ${
                          active ? "bg-emerald-50" : "hover:bg-slate-50"
                        }`}
                        onMouseEnter={() => setActiveIndex(resultIndex)}
                        onClick={() => selectResult({ type: "nav", item })}
                      >
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                          {item.icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-slate-900">
                            {item.label}
                          </span>
                          <span className="block truncate text-xs text-slate-600">
                            {item.description}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}

                {(loading || requisitions.length > 0 || q.length >= 2) && (
                  <li className="px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Requisitions
                  </li>
                )}
                {loading && (
                  <li className="px-4 py-3 text-sm text-slate-600">Searching…</li>
                )}
                {!loading && q.length >= 2 && requisitions.length === 0 && (
                  <li className="px-4 py-3 text-sm text-slate-600">
                    No requisitions match “{query.trim()}”
                  </li>
                )}
                {!loading &&
                  requisitions.map((item, index) => {
                    const resultIndex = navResults.length + index;
                    const active = resultIndex === activeIndex;
                    const title =
                      item.requisition.jobTitle ||
                      item.requisition.requisitionId ||
                      "Untitled requisition";
                    const customer =
                      item.requisition.normalizedCustomerName ||
                      item.requisition.sourceCustomerName ||
                      "Unknown customer";
                    return (
                      <li
                        key={item.requisition.id}
                        role="option"
                        aria-selected={active}
                      >
                        <button
                          type="button"
                          className={`flex w-full items-center gap-3 px-3 py-2.5 text-left ${
                            active ? "bg-emerald-50" : "hover:bg-slate-50"
                          }`}
                          onMouseEnter={() => setActiveIndex(resultIndex)}
                          onClick={() =>
                            selectResult({ type: "requisition", item })
                          }
                        >
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                            <BriefcaseIcon className="w-4 h-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold text-slate-900">
                              {title}
                            </span>
                            <span className="block truncate text-xs text-slate-600">
                              {customer}
                              {item.requisition.requisitionId
                                ? ` · ${item.requisition.requisitionId}`
                                : ""}
                              {item.analysis?.opportunityScore != null
                                ? ` · Score ${item.analysis.opportunityScore}`
                                : ""}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}

                {results.length === 0 && !loading && q.length < 2 && (
                  <li className="px-4 py-6 text-center text-sm text-slate-600">
                    Type to search pages and requisitions
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      <DetailDrawer
        requisition={selectedDetail}
        isOpen={!!selectedDetail}
        onClose={() => setSelectedDetail(null)}
      />
    </>
  );
}
