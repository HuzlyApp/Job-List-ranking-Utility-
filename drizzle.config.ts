import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Prefer direct (unpooled) connection for migrations
    url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!,
  },
});
