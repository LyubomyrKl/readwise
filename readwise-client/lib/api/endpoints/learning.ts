import { getClient, withRefresh } from "../client";
import type {
  CreateLearningNoteDto,
  UpdateLearningNoteDto,
  ValidateNoteDto,
  SubmitReviewDto,
  EndSessionDto,
  UpdateSettingsDto,
  ValidationResultResponse,
  LearningNoteResponse,
  StudyQueueResponse,
  SessionStartResponse,
  ReviewResultResponse,
  StatsResponse,
  DailyStatsResponse,
  SettingsResponse,
  LearningExportResponse,
  ImportLearningDataDto,
  ImportResultResponse,
} from "@/lib/types";

export const learningApi = {
  // Notes
  async getNotes() {
    return withRefresh(() => {
      const client = getClient();
      return client.get<LearningNoteResponse[]>("/learning/notes");
    });
  },

  async getNote(id: string) {
    return withRefresh(() => {
      const client = getClient();
      return client.get<LearningNoteResponse>(`/learning/notes/${id}`);
    });
  },

  async createNote(dto: CreateLearningNoteDto) {
    return withRefresh(() => {
      const client = getClient();
      return client.post<LearningNoteResponse>("/learning/notes", dto);
    });
  },

  async validateNote(dto: ValidateNoteDto) {
    return withRefresh(() => {
      const client = getClient();
      return client.post<ValidationResultResponse>("/learning/notes/validate", dto);
    });
  },

  async createNoteFromHighlight(highlightId: string, dto: CreateLearningNoteDto) {
    return withRefresh(() => {
      const client = getClient();
      return client.post<LearningNoteResponse>(
        `/learning/notes/from-highlight/${highlightId}`,
        dto
      );
    });
  },

  async updateNote(id: string, dto: UpdateLearningNoteDto) {
    return withRefresh(() => {
      const client = getClient();
      return client.patch<LearningNoteResponse>(`/learning/notes/${id}`, dto);
    });
  },

  async deleteNote(id: string) {
    return withRefresh(() => {
      const client = getClient();
      return client.delete(`/learning/notes/${id}`);
    });
  },

  // Study
  async getStudyQueue() {
    return withRefresh(() => {
      const client = getClient();
      return client.get<StudyQueueResponse>("/learning/study/queue");
    });
  },

  async startSession() {
    return withRefresh(() => {
      const client = getClient();
      return client.post<SessionStartResponse>("/learning/study/session/start", {});
    });
  },

  async endSession(dto: EndSessionDto) {
    return withRefresh(() => {
      const client = getClient();
      return client.post("/learning/study/session/end", dto);
    });
  },

  async submitReview(dto: SubmitReviewDto) {
    return withRefresh(() => {
      const client = getClient();
      return client.post<ReviewResultResponse>("/learning/study/review", dto);
    });
  },

  // Stats
  async getStats() {
    return withRefresh(() => {
      const client = getClient();
      return client.get<StatsResponse>("/learning/stats");
    });
  },

  async getDailyStats() {
    return withRefresh(() => {
      const client = getClient();
      return client.get<DailyStatsResponse[]>("/learning/stats/daily");
    });
  },

  // Settings
  async getSettings() {
    return withRefresh(() => {
      const client = getClient();
      return client.get<SettingsResponse>("/learning/settings");
    });
  },

  async updateSettings(dto: UpdateSettingsDto) {
    return withRefresh(() => {
      const client = getClient();
      return client.patch<SettingsResponse>("/learning/settings", dto);
    });
  },

  // Export/Import
  async exportData() {
    return withRefresh(() => {
      const client = getClient();
      return client.get<LearningExportResponse>("/learning/export");
    });
  },

  async exportCsv() {
    return withRefresh(() => {
      const client = getClient();
      return client.get<string>("/learning/export/csv", {
        responseType: "text",
      });
    });
  },

  async importData(dto: ImportLearningDataDto) {
    return withRefresh(() => {
      const client = getClient();
      return client.post<ImportResultResponse>("/learning/import", dto);
    });
  },
};
