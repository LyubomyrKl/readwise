import type { CreateAssetInput, PositionResponse, Valuation } from "../types";

/**
 * How an asset gets into an account, in plain words: an asset is something you can own units of
 * (an ETF, a share, a bond); you hold it in an investment or bonds account by adding a holding there,
 * either buying it now or recording what you already own.
 */

/** How an asset's value is known, as the forms say it. */
export const VALUATION_LABELS: Record<Valuation, string> = {
  price_feed: "Daily price from the internet",
  manual: "Prices I enter",
  bond_formula: "Bond formula (EDO-style)",
};

/** The asset picker's last option: create one right there. */
export const NEW_ASSET = "__new";

/** A new asset described inside the buy form: just what it takes to hold and value it. */
export interface NewAssetFields {
  code: string;
  name: string;
  /** the currency its price is quoted in */
  currency: string;
  pricing: "feed" | "manual";
  /** the Yahoo Finance symbol, for a daily price */
  symbol: string;
}

export const EMPTY_NEW_ASSET: NewAssetFields = { code: "", name: "", currency: "", pricing: "feed", symbol: "" };

/** What is missing before the asset can be created, or null. */
export function newAssetProblem(f: NewAssetFields): string | null {
  if (!f.code.trim()) return "Give the new asset a short name, e.g. VWCE";
  if (!f.name.trim()) return "Give the new asset its full name";
  if (!f.currency) return "Pick the currency the new asset's price is in";
  if (f.pricing === "feed" && !f.symbol.trim()) return "Enter the symbol its daily price is found by, e.g. VWCE.DE, or enter prices yourself";
  return null;
}

/** The API's create input for it. */
export function newAssetInput(f: NewAssetFields): CreateAssetInput {
  return {
    code: f.code.trim().toUpperCase(),
    name: f.name.trim(),
    quoteCurrency: f.currency,
    ...(f.pricing === "feed"
      ? { valuation: "price_feed" as const, valuationConfig: { provider: "yahoo", symbol: f.symbol.trim() }, ticker: f.symbol.trim() }
      : { valuation: "manual" as const }),
  };
}

/** Where an asset is held: "IBKR 129" per account, for the assets list. */
export function heldIn(assetId: string, positions: PositionResponse[]): { accountId: string; accountName: string; units: string }[] {
  return positions.filter((p) => p.assetId === assetId).map((p) => ({ accountId: p.accountId, accountName: p.accountName, units: p.units }));
}

/** The form that adds a holding: buy with the account (and asset) filled in. */
export function addHoldingHref(base: string, accountId?: string, assetId?: string): string {
  return `${base}${accountId ? `&account=${accountId}` : ""}${assetId ? `&asset=${assetId}` : ""}`;
}
