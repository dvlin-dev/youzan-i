import { defineConfig } from "drizzle-kit";

// Load env for standalone drizzle-kit runs (Next.js loads these itself at runtime).
const loadEnv = (process as { loadEnvFile?: (p?: string) => void }).loadEnvFile;
try {
  loadEnv?.(".env.local");
} catch {}
try {
  loadEnv?.(".env");
} catch {}

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!,
  },
  strict: true,
});
