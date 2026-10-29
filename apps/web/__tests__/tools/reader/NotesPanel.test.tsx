import { act, fireEvent, render, screen, within } from "@testing-library/react";
import NotesPanel from "@tools/reader/reading/NotesPanel";
import type { HighlightResponse, NoteResponse } from "@tools/reader/types";
import { toast } from "sonner";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const note = (overrides: Partial<NoteResponse> = {}): NoteResponse => ({
  id: "n1", userId: "u", bookId: "b1", body: "first thought", isPinned: false, isArchived: false,
  createdAt: "2026-10-25T10:00:00Z", updatedAt: "2026-10-25T10:00:00Z", ...overrides,
});

const highlight: HighlightResponse = {
  id: "h1", userId: "u", bookId: "b1", text: "a marked line", anchor: { type: "epub", cfi: "epubcfi(/6/4!/4/2)" },
  createdAt: "2026-10-25T10:00:00Z", updatedAt: "2026-10-25T10:00:00Z",
};

/** The pin, edit and delete buttons of a note card, in that order. */
function noteButtons(body: string) {
  const card = screen.getByText(body).parentElement!;
  const [pin, edit, remove] = within(card).getAllByRole("button");
  return { pin, edit, remove };
}

// useNotes and useHighlights catch request errors and resolve null/false instead of throwing.
describe("NotesPanel with callbacks that resolve null/false on failure", () => {
  beforeEach(() => jest.clearAllMocks());

  it("keeps a new note's text and reports the failure when it was not saved", async () => {
    const onCreateNote = jest.fn().mockResolvedValue(null);
    render(<NotesPanel notes={[]} onClose={() => {}} onCreateNote={onCreateNote} />);
    fireEvent.click(screen.getByText("New Note"));
    fireEvent.change(screen.getByPlaceholderText("Write your note..."), { target: { value: "two pages of thoughts" } });
    await act(async () => {
      fireEvent.click(screen.getByText("Save"));
    });

    expect(onCreateNote).toHaveBeenCalledWith({ body: "two pages of thoughts" });
    expect(screen.getByPlaceholderText("Write your note...")).toHaveValue("two pages of thoughts");
    expect(toast.error).toHaveBeenCalledWith("Failed to create note");
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("closes the editor and confirms once the note is saved", async () => {
    const onCreateNote = jest.fn().mockResolvedValue(note({ body: "saved" }));
    render(<NotesPanel notes={[]} onClose={() => {}} onCreateNote={onCreateNote} />);
    fireEvent.click(screen.getByText("New Note"));
    fireEvent.change(screen.getByPlaceholderText("Write your note..."), { target: { value: "saved" } });
    await act(async () => {
      fireEvent.click(screen.getByText("Save"));
    });

    expect(screen.queryByPlaceholderText("Write your note...")).toBeNull();
    expect(toast.success).toHaveBeenCalledWith("Note created");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("keeps an edit open with its text when the update failed", async () => {
    const onUpdateNote = jest.fn().mockResolvedValue(false);
    render(<NotesPanel notes={[note()]} onClose={() => {}} onUpdateNote={onUpdateNote} />);
    fireEvent.click(noteButtons("first thought").edit);
    fireEvent.change(screen.getByDisplayValue("first thought"), { target: { value: "second thought" } });
    await act(async () => {
      fireEvent.click(screen.getByText("Save"));
    });

    expect(onUpdateNote).toHaveBeenCalledWith("n1", { body: "second thought" });
    expect(screen.getByDisplayValue("second thought")).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith("Failed to update note");
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("reports a failed pin toggle and a failed delete instead of confirming them", async () => {
    const onUpdateNote = jest.fn().mockResolvedValue(false);
    const onDeleteNote = jest.fn().mockResolvedValue(false);
    render(<NotesPanel notes={[note()]} onClose={() => {}} onUpdateNote={onUpdateNote} onDeleteNote={onDeleteNote} />);

    await act(async () => {
      fireEvent.click(noteButtons("first thought").pin);
    });
    expect(onUpdateNote).toHaveBeenCalledWith("n1", { isPinned: true });
    expect(toast.error).toHaveBeenCalledWith("Failed to update pin status");

    await act(async () => {
      fireEvent.click(noteButtons("first thought").remove);
    });
    expect(onDeleteNote).toHaveBeenCalledWith("n1");
    expect(toast.error).toHaveBeenCalledWith("Failed to delete note");
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("reports a failed highlight delete", async () => {
    const onDeleteHighlight = jest.fn().mockResolvedValue(false);
    render(<NotesPanel notes={[]} highlights={[highlight]} onClose={() => {}} onDeleteHighlight={onDeleteHighlight} />);
    fireEvent.click(screen.getByText(/Highlights \(1\)/));
    const card = screen.getByText("a marked line").closest("div.border")! as HTMLElement;
    await act(async () => {
      fireEvent.click(within(card).getByRole("button"));
    });

    expect(onDeleteHighlight).toHaveBeenCalledWith("h1");
    expect(toast.error).toHaveBeenCalledWith("Failed to delete highlight");
    expect(toast.success).not.toHaveBeenCalled();
  });
});
