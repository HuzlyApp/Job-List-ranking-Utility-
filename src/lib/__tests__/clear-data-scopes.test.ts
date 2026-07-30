import { describe, expect, it } from "vitest";
import { resolveEffectiveScopes } from "@/lib/clear-data-scopes";

describe("resolveEffectiveScopes", () => {
  it("collapses to all when all is selected", () => {
    expect(resolveEffectiveScopes(["imports", "all", "audit"])).toEqual(["all"]);
  });

  it("dedupes discrete scopes", () => {
    expect(resolveEffectiveScopes(["imports", "imports", "requisitions"])).toEqual([
      "imports",
      "requisitions",
    ]);
  });
});
