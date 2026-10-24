/**
 * Routes owned by the platform shell. Tool routes live in each tool's own
 * routes.ts and are mounted under TOOLS_BASE_PATH/<toolId>.
 */
export const TOOLS_BASE_PATH = "/apps";

export const PLATFORM_ROUTES = Object.freeze({
  home: "/",
  auth: {
    login: "/auth/login",
    register: "/auth/register",
  },
  settings: {
    root: "/settings",
    appearance: "/settings/appearance",
    account: "/settings/account",
  },
} as const);
