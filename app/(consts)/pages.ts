import { authApi } from "@/lib/sdk";
import { set } from "zod";

export const ROUTES = Object.freeze({
  reader: {
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
