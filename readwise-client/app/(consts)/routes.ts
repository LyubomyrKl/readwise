export const ROUTES = Object.freeze({
  reader: {
    bookReader: (id: string) => `/reader/book/${id}/reader`,
    bookProfile: (id: string) => `/reader/book/${id}/profile`,
    library: "/reader/library",
    ingest: {
      uploadFiles: "/reader/ingest/upload"
    },
  },
  auth: {
    login: "/auth/login",
    register: "/auth/register",
  },
  settings: {
    root: "/settings",
    appearance: "/settings/appearance",
    reader: "/settings/reader",
    account: "/settings/account",
  },
  home: "/",
} as const);
