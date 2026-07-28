"use client";

import {
  DEFAULT_TENANT_ID,
  DEFAULT_USER_ID,
  DEFAULT_MSP_PROGRAM_ID,
  DEFAULT_ASSUMPTIONS,
  DEFAULT_WEIGHTS,
} from "@/lib/constants";

export function useAppContext() {
  return {
    tenantId: process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || DEFAULT_TENANT_ID,
    userId: process.env.NEXT_PUBLIC_DEFAULT_USER_ID || DEFAULT_USER_ID,
    defaultMspProgramId:
      process.env.NEXT_PUBLIC_DEFAULT_MSP_PROGRAM_ID || DEFAULT_MSP_PROGRAM_ID,
    assumptions: DEFAULT_ASSUMPTIONS,
    weights: DEFAULT_WEIGHTS,
  };
}

export { DEFAULT_ASSUMPTIONS, DEFAULT_WEIGHTS };
