import { apiFetch } from "@platform/api/http";
import type { JobResponse, ListJobsFilter } from "./types";

export const jobsApi = {
  get: (id: string) => apiFetch<JobResponse>(`/jobs/${encodeURIComponent(id)}`),
  list: (filter: ListJobsFilter = {}) => apiFetch<JobResponse[]>("/jobs", { query: filter }),
  cancel: (id: string) => apiFetch<JobResponse>(`/jobs/${encodeURIComponent(id)}/cancel`, { method: "POST" }),
  retry: (id: string) => apiFetch<JobResponse>(`/jobs/${encodeURIComponent(id)}/retry`, { method: "POST" }),
};
