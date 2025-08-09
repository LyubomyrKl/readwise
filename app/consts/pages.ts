export const ROUTES = Object.freeze({
  reader: {
    library: "/library",
    collections: {
      all: "/collections",
      new: "/collections/new",
      archived: "/collections/archived",
    },
    ingest: {
      uploadFiles: "/ingest/upload",
      webImport: "/ingest/web",
    },
    aiWorkbench: "/workbench",
  },
} as const);
