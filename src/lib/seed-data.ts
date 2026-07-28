import { db } from "@/db";
import {
  tenants,
  users,
  mspPrograms,
  financialAssumptionSets,
  scoringWeights,
} from "@/db/schema";
import { eq } from "drizzle-orm";

import {
  DEFAULT_TENANT_ID,
  DEFAULT_USER_ID,
  DEFAULT_MSP_PROGRAM_ID,
} from "@/lib/constants";

export { DEFAULT_TENANT_ID, DEFAULT_USER_ID, DEFAULT_MSP_PROGRAM_ID };

export async function ensureSeedData() {
  const [existingTenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, DEFAULT_TENANT_ID));

  if (!existingTenant) {
    await db.insert(tenants).values({
      id: DEFAULT_TENANT_ID,
      name: "Zip Staff",
      slug: "zip-staff",
    });
  }

  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, DEFAULT_USER_ID));

  if (!existingUser) {
    await db.insert(users).values({
      id: DEFAULT_USER_ID,
      tenantId: DEFAULT_TENANT_ID,
      email: "recruiter@zipstaff.com",
      name: "Default Recruiter",
      role: "recruiter",
    });
  }

  const [existingProgram] = await db
    .select()
    .from(mspPrograms)
    .where(eq(mspPrograms.id, DEFAULT_MSP_PROGRAM_ID));

  if (!existingProgram) {
    await db.insert(mspPrograms).values({
      id: DEFAULT_MSP_PROGRAM_ID,
      tenantId: DEFAULT_TENANT_ID,
      name: "Randstad iLabor",
      platformName: "iLabor",
      vendorFeeType: "percentage",
      vendorFeeValue: "2.00",
      defaultWeeklyHours: 40,
    });
  }

  const [existingAssumptions] = await db
    .select()
    .from(financialAssumptionSets)
    .where(eq(financialAssumptionSets.mspProgramId, DEFAULT_MSP_PROGRAM_ID));

  if (!existingAssumptions) {
    await db.insert(financialAssumptionSets).values({
      tenantId: DEFAULT_TENANT_ID,
      mspProgramId: DEFAULT_MSP_PROGRAM_ID,
      version: 1,
      name: "Default Assumptions",
      createdBy: DEFAULT_USER_ID,
    });
  }

  const [existingWeights] = await db
    .select()
    .from(scoringWeights)
    .where(eq(scoringWeights.mspProgramId, DEFAULT_MSP_PROGRAM_ID));

  if (!existingWeights) {
    await db.insert(scoringWeights).values({
      tenantId: DEFAULT_TENANT_ID,
      mspProgramId: DEFAULT_MSP_PROGRAM_ID,
      name: "Default Weights",
      createdBy: DEFAULT_USER_ID,
    });
  }

  return {
    tenantId: DEFAULT_TENANT_ID,
    userId: DEFAULT_USER_ID,
    mspProgramId: DEFAULT_MSP_PROGRAM_ID,
  };
}
