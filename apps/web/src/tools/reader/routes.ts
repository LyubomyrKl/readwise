import { TOOLS_BASE_PATH } from "@platform/routes";

const BASE = `${TOOLS_BASE_PATH}/reader`;

/** Every URL the reader tool owns. The settings page is mounted by the platform hub. */
export const READER_ROUTES = Object.freeze({
  base: BASE,
  library: BASE,
  upload: `${BASE}/upload`,
  bookProfile: (id: string) => `${BASE}/book/${id}`,
  bookReader: (id: string) => `${BASE}/book/${id}/read`,
  bookSummary: (id: string) => `${BASE}/book/${id}/summary`,
  settings: "/settings/reader",
} as const);
