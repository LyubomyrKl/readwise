"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { jobsApi } from "./api";
import { isActiveJob, type ListJobsFilter } from "./types";

export const jobKeys = {
  all: ["jobs"] as const,
  list: (filter: ListJobsFilter) => ["jobs", "list", filter] as const,
  one: (id: string) => ["jobs", "one", id] as const,
};

/** A job list that keeps refreshing while any listed job is active. */
export function useJobs(filter: ListJobsFilter = {}, activeIntervalMs = 5000) {
  return useQuery({
    queryKey: jobKeys.list(filter),
    queryFn: () => jobsApi.list(filter),
    refetchInterval: (query) => (query.state.data?.some((j) => isActiveJob(j.status)) ? activeIntervalMs : false),
  });
}

export function useInvalidateJobs() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: jobKeys.all });
}
