"use client";

interface FiltersProps {
  filters: {
    tenantId: string;
    mspProgramId: string;
    status: string;
    recommendation: string;
    minOpportunityScore: string;
    maxOpportunityScore: string;
    customer: string;
    isNewToday: boolean;
    page: number;
    limit: number;
  };
  onChange: (filters: FiltersProps["filters"]) => void;
}

export function Filters({ filters, onChange }: FiltersProps) {
  const recommendations = [
    { value: "", label: "All" },
    { value: "Recruit Immediately", label: "Recruit Immediately" },
    { value: "High Priority", label: "High Priority" },
    { value: "Good Opportunity", label: "Good Opportunity" },
    { value: "Candidate Driven", label: "Candidate Driven" },
    { value: "Only If Candidate Available", label: "Only If Candidate Available" },
    { value: "Skip or Monitor", label: "Skip or Monitor" },
  ];

  const statuses = [
    { value: "", label: "All" },
    { value: "Open", label: "Open" },
    { value: "Closed", label: "Closed" },
    { value: "Filled", label: "Filled" },
    { value: "On Hold", label: "On Hold" },
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {/* Status Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Status
          </label>
          <select
            value={filters.status}
            onChange={(e) => onChange({ ...filters, status: e.target.value })}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {statuses.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* Recommendation Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Recommendation
          </label>
          <select
            value={filters.recommendation}
            onChange={(e) =>
              onChange({ ...filters, recommendation: e.target.value })
            }
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {recommendations.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        {/* Min Score Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Min Opportunity Score
          </label>
          <input
            type="number"
            min="0"
            max="100"
            value={filters.minOpportunityScore}
            onChange={(e) =>
              onChange({ ...filters, minOpportunityScore: e.target.value })
            }
            placeholder="0"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Max Score Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Max Opportunity Score
          </label>
          <input
            type="number"
            min="0"
            max="100"
            value={filters.maxOpportunityScore}
            onChange={(e) =>
              onChange({ ...filters, maxOpportunityScore: e.target.value })
            }
            placeholder="100"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Customer Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Customer
          </label>
          <input
            type="text"
            value={filters.customer}
            onChange={(e) =>
              onChange({ ...filters, customer: e.target.value })
            }
            placeholder="Search customer..."
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* New Today Filter */}
        <div className="flex items-center pt-6">
          <input
            type="checkbox"
            id="isNewToday"
            checked={filters.isNewToday}
            onChange={(e) =>
              onChange({ ...filters, isNewToday: e.target.checked })
            }
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label
            htmlFor="isNewToday"
            className="ml-2 block text-sm text-gray-700"
          >
            New Today Only
          </label>
        </div>
      </div>

      {/* Clear Filters */}
      <div className="mt-4 flex justify-end">
        <button
          onClick={() =>
            onChange({
              ...filters,
              status: "",
              recommendation: "",
              minOpportunityScore: "",
              maxOpportunityScore: "",
              customer: "",
              isNewToday: false,
            })
          }
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          Clear Filters
        </button>
      </div>
    </div>
  );
}
