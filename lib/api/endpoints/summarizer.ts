import { getClient, withRefresh } from "../client";
import type {
  RequestSummaryDto,
  GetSummaryDto,
  SummaryRequestResponse,
  SummaryResponse,
} from "@/lib/types";

export const summarizerApi = {
  async requestSummary(dto: RequestSummaryDto) {
    return withRefresh(() => {
      const client = getClient();
      return client.post<SummaryRequestResponse>("/summarizer/request", dto);
    });
  },

  async getSummary(dto: GetSummaryDto) {
    return withRefresh(() => {
      const client = getClient();
      return client.post<SummaryResponse>("/summarizer/summary", dto);
    });
  },
};
