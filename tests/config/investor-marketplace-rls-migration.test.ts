import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "@jest/globals";

describe("investor marketplace RLS migration", () => {
  const migrationPath = resolve(
    process.cwd(),
    "../supabase/migrations/202606070001_phase1_investor_marketplace_rls.sql"
  );

  it("allows active investors to read open marketplace offers and joined display data", () => {
    expect(existsSync(migrationPath)).toBe(true);

    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("create or replace function public.is_active_investor()");
    expect(sql).toContain("create or replace function public.is_open_marketplace_invoice(p_invoice_id uuid)");
    expect(sql).toContain("create or replace function public.is_open_marketplace_organization(p_org_id uuid)");
    expect(sql).toContain("create policy funding_offers_investor_marketplace_select");
    expect(sql).toContain("create policy financeability_investor_marketplace_select");
    expect(sql).toContain("create policy invoices_investor_marketplace_select");
    expect(sql).toContain("create policy organizations_investor_marketplace_select");
    expect(sql).toContain("fo.status = 'OPEN'");
    expect(sql).toContain("public.is_active_investor()");
    expect(sql).toContain("public.is_open_marketplace_invoice(invoice_id)");
    expect(sql).toContain("public.is_open_marketplace_organization(id)");
  });
});
