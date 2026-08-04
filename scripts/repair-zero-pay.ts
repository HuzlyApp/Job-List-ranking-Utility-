/**
 * Apply zero-pay repair migration against Neon.
 * Usage: npx tsx scripts/repair-zero-pay.ts
 */
import { repairInvalidZeroPayRecords, countInvalidZeroPayRecords } from "../src/lib/repair-zero-pay";
import { readFileSync } from "fs";
import { join } from "path";
import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function main() {
  const before = await countInvalidZeroPayRecords();
  console.log(`Invalid zero-pay analysis rows before repair: ${before}`);

  // Apply SQL migration constraints after data cleanup
  const migrationPath = join(__dirname, "../drizzle/0005_pay_positive_or_null.sql");
  const migrationSql = readFileSync(migrationPath, "utf8");

  // Split on statement boundaries carefully — run as one script via neon
  await db.execute(sql.raw(migrationSql));

  const after = await countInvalidZeroPayRecords();
  console.log(`Invalid zero-pay analysis rows after migration: ${after}`);

  const result = await repairInvalidZeroPayRecords();
  console.log("Repair result:", result);
}

main()
  .then(() => {
    console.log("Done.");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
