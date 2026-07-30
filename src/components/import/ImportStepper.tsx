"use client";

import { CheckIcon, AlertCircleIcon, LoaderIcon } from "@/components/ui/icons";

export type ImportStep =
  | "upload"
  | "detect"
  | "preview"
  | "review"
  | "analyze"
  | "complete";

interface ImportStepperProps {
  currentStep: ImportStep;
  failedStep?: ImportStep;
  warningStep?: ImportStep;
}

const steps: { id: ImportStep; label: string; description: string }[] = [
  { id: "upload", label: "Upload", description: "Add files" },
  { id: "detect", label: "Detect & Parse", description: "Read files" },
  { id: "preview", label: "Preview Columns", description: "Map fields" },
  { id: "review", label: "Review", description: "Validate data" },
  { id: "analyze", label: "Analyze", description: "AI processing" },
  { id: "complete", label: "Results", description: "View ranked" },
];

export function ImportStepper({
  currentStep,
  failedStep,
  warningStep,
}: ImportStepperProps) {
  const currentIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <div className="w-full">
      {/* Desktop Stepper */}
      <div className="hidden md:block">
        <div className="flex items-start justify-between">
          {steps.map((step, index) => {
            const isCompleted = index < currentIndex;
            const isCurrent = index === currentIndex;
            const isFailed = failedStep === step.id;
            const isWarning = warningStep === step.id;
            const isUpcoming = index > currentIndex;

            return (
              <div key={step.id} className="flex-1 flex flex-col items-center">
                {/* Step Circle */}
                <div
                  className={`relative flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all
                    ${isFailed
                      ? "bg-red-50 border-red-500 text-red-600"
                      : isWarning
                      ? "bg-amber-50 border-amber-500 text-amber-600"
                      : isCompleted
                      ? "bg-emerald-50 border-emerald-500 text-emerald-600"
                      : isCurrent
                      ? "bg-emerald-600 border-emerald-600 text-white ring-4 ring-emerald-100"
                      : "bg-white border-slate-300 text-slate-400"
                    }
                  `}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {isCompleted ? (
                    <CheckIcon className="w-5 h-5" />
                  ) : isFailed ? (
                    <AlertCircleIcon className="w-5 h-5" />
                  ) : isCurrent ? (
                    <span className="text-sm font-bold">{index + 1}</span>
                  ) : (
                    <span className="text-sm font-medium">{index + 1}</span>
                  )}
                </div>

                {/* Label */}
                <div className="mt-2 text-center">
                  <p
                    className={`text-sm font-bold
                      ${isFailed
                        ? "text-red-700"
                        : isWarning
                        ? "text-amber-700"
                        : isCompleted || isCurrent
                        ? "text-slate-900"
                        : "text-slate-500"
                      }
                    `}
                  >
                    {step.label}
                  </p>
                  <p
                    className={`text-xs mt-0.5
                      ${isFailed
                        ? "text-red-600"
                        : isWarning
                        ? "text-amber-600"
                        : isCompleted || isCurrent
                        ? "text-slate-600"
                        : "text-slate-400"
                      }
                    `}
                  >
                    {step.description}
                  </p>
                </div>

                {/* Connector Line */}
                {index < steps.length - 1 && (
                  <div
                    className={`absolute top-5 left-1/2 w-full h-0.5 -translate-y-1/2
                      ${index < currentIndex ? "bg-emerald-500" : "bg-slate-200"}
                    `}
                    style={{ marginLeft: "20px", width: "calc(100% - 40px)" }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile Stepper */}
      <div className="md:hidden">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-600 text-white font-bold">
            {currentIndex + 1}
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">
              Step {currentIndex + 1} of {steps.length}
            </p>
            <p className="text-base font-bold text-slate-900">
              {steps[currentIndex]?.label}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
