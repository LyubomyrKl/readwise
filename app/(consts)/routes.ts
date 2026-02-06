export const ROUTES = Object.freeze({
  reader: {
    bookReader: (id: string) => `/reader/book/${id}/reader`,
    bookProfile: (id: string) => `/reader/book/${id}/profile`,
    library: "/reader/library",
    ingest: {
      uploadFiles: "/reader/ingest/upload"
    },
  },
  learning: {
    dashboard: "/learning",
    study: "/learning/study",
    notes: "/learning/notes",
    notesNew: "/learning/notes/new",
    stats: "/learning/stats",
    settings: "/learning/settings",
  },
  auth: {
    login: "/auth/login",
    register: "/auth/register",
  },
  settings: "/settings",
  home: "/",
} as const);
