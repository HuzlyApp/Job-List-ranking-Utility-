export const CLEAR_SCOPES = [
  "imports",
  "requisitions",
  "audit",
  "aliases",
  "all",
] as const;

export type ClearScope = (typeof CLEAR_SCOPES)[number];

export function resolveEffectiveScopes(scopes: ClearScope[]): ClearScope[] {
  if (scopes.includes("all")) {
    return ["all"];
  }
  return Array.from(new Set(scopes));
}
