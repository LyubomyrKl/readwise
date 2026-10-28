import { TOOLS_BASE_PATH } from "@platform/routes";

const BASE = `${TOOLS_BASE_PATH}/money`;

/** Every URL the money tool owns. */
export const MONEY_ROUTES = Object.freeze({
  base: BASE,
  home: BASE,
} as const);
