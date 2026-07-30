"use client";

import { InfoIcon } from "@/components/ui/icons";

interface SafeLeaveNoticeProps {
  show?: boolean;
}

export function SafeLeaveNotice({ show = true }: SafeLeaveNoticeProps) {
  if (!show) return null;

  return (
    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
      <div className="flex items-start gap-3">
        <InfoIcon className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm font-bold text-blue-800">
          You can safely leave this page. Processing will continue in the background.
        </p>
      </div>
    </div>
  );
}
