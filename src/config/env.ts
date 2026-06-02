import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

export function parsePort(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function optionalEnv(value: string | undefined): string | undefined {
  if (!value || value.trim().length === 0) return undefined;
  return value.trim();
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  host: process.env.HOST ?? "0.0.0.0",
  port: parsePort(process.env.PORT, 8080),
  apiBasePath: process.env.API_BASE_PATH ?? "/api/v1",
  supabase: {
    url: optionalEnv(process.env.SUPABASE_URL),
    anonKey: optionalEnv(process.env.SUPABASE_ANON_KEY),
    serviceRoleKey: optionalEnv(process.env.SUPABASE_SERVICE_ROLE_KEY)
  }
};
