export const ROUTES = Object.freeze({
  reader: {
    bookReader: (id: string) => `/reader/book/${id}/reader`,
    bookProfile: (id: string) => `/reader/book/${id}/profile`,
    library: "/reader/library",
    collections: {
      all: "/reader/collections",
      new: "/reader/collections/new",
      archived: "/reader/collections/archived",
    },
    ingest: {
      uploadFiles: "/reader/ingest/upload",
      webImport: "/reader/ingest/web",
    },
    aiWorkbench: "/reader/workbench",
  },

  auth: {
    login: "/auth/login",
    register: "/auth/register",
  },
  settings: "/settings",
  home: "/",
} as const);
