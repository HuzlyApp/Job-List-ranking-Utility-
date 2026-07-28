/** Stable IDs for default tenant — shared by client and server */
export const DEFAULT_TENANT_ID = "00000000-0000-4000-8000-000000000001";
export const DEFAULT_USER_ID = "00000000-0000-4000-8000-000000000002";
export const DEFAULT_MSP_PROGRAM_ID = "00000000-0000-4000-8000-000000000003";

export const DEFAULT_ASSUMPTIONS = {
  ficaPercent: 7.65,
  futaSutaHourly: 0.45,
  standardWorkersCompHourly: 0.3,
  highRiskWorkersCompHourly: 0.6,
  healthcareWorkersCompHourly: null as number | null,
  payrollProcessingHourly: 0.25,
  complianceHourly: 0.2,
  insuranceHourly: 0.25,
  recruitingHourly: 1.25,
  overheadHourly: 0.75,
  benefitsHourly: 0,
  ptoHourly: 0,
  otherHourlyCosts: 0,
};

export const DEFAULT_WEIGHTS = {
  competitionWeight: 30,
  profitabilityWeight: 25,
  fillabilityWeight: 20,
  billRateWeight: 15,
  durationWeight: 10,
};
