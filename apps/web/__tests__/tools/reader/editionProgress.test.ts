import {
  describeEditionError,
  formatDuration,
  parseStage,
  remainingMs,
} from "@tools/reader/editions/progress";

describe("parseStage", () => {
  it.each([
    ["reading the book", "running", "reading", "Reading the book"],
    ["reading scanned page 4 of 30", "running", "reading", "Reading scanned page 4 of 30"],
    ["chapter 3 of 12", "running", "writing", "Writing chapter 3 of 12"],
    ["chapter 3 of 12: part 2 of 4", "running", "writing", "Writing chapter 3 of 12 (part 2 of 4)"],
    ["fact-checking chapter 5 of 12: part 1 of 3", "running", "checking", "Fact-checking chapter 5 of 12 (part 1 of 3)"],
    ["fixing chapter 12 of 12", "running", "fixing", "Correcting chapter 12 of 12"],
    ["writing the book overview", "running", "finishing", "Writing the book overview"],
    ["building the EPUB", "running", "finishing", "Building the EPUB"],
    ["chapter 3 of 12: part 2 of 4", "waiting", "writing", "Paused: writing chapter 3 of 12 (part 2 of 4)"],
    [null, "queued", "queued", "Waiting for the worker to pick it up"],
    ["building the EPUB", "succeeded", "done", "Done"],
  ] as const)("%s (%s) is %s", (stage, status, phase, label) => {
    expect(parseStage(stage, status)).toMatchObject({ phase, label });
  });

  it("keeps the chapter and part numbers for the chapter list", () => {
    expect(parseStage("fact-checking chapter 5 of 12: part 1 of 3", "running")).toMatchObject({
      chapter: 5, chapters: 12, part: 1, parts: 3,
    });
  });
});

describe("time left", () => {
  const minute = 60_000;

  it("needs a minute and two points of progress", () => {
    expect(remainingMs([{ at: 0, progress: 10 }])).toBeNull();
    expect(remainingMs([{ at: 0, progress: 10 }, { at: 30_000, progress: 20 }])).toBeNull();
    expect(remainingMs([{ at: 0, progress: 10 }, { at: 5 * minute, progress: 11 }])).toBeNull();
  });

  it("extrapolates from what was gained while watching, not from the job's start", () => {
    // a resumed edition jumps to 40% at once; 10 more points in 10 minutes means 50 minutes for the rest
    expect(remainingMs([{ at: 0, progress: 40 }, { at: 10 * minute, progress: 50 }])).toBe(50 * minute);
  });

  it("formats durations for people", () => {
    expect(formatDuration(20_000)).toBe("under a minute");
    expect(formatDuration(12 * minute)).toBe("12 min");
    expect(formatDuration(65 * minute)).toBe("1 h 05 min");
  });
});

describe("describeEditionError", () => {
  it("turns a missing model into the command to run", () => {
    const error = describeEditionError("model gemma4:26b-mlx is not on the LLM host (ollama pull gemma4:26b-mlx)", "failed");
    expect(error).toMatchObject({ title: "A model is missing on the Mac", command: "ollama pull gemma4:26b-mlx", canContinue: true });
  });

  it.each([
    ["No text to abridge: the file has no readable chapters", "This book has no readable text", false],
    ["Unsupported file type: text/plain", "This kind of file cannot be abridged", false],
    ["BadZipFile: File is not a zip file", "The file could not be read", false],
    ["interrupted: the worker stopped while the job was running", "The worker stopped while making it", true],
    ["worker lost after 3 attempt(s)", "The worker stopped while making it", true],
    ["LLM error: LLM host answered 500: out of memory", "The LLM host answered with errors", true],
    ["ZeroDivisionError: division by zero", "The edition stopped with an error", true],
  ])("%s", (raw, title, canContinue) => {
    expect(describeEditionError(raw, "failed")).toMatchObject({ title, canContinue });
  });

  it("a cancelled edition can be continued", () => {
    expect(describeEditionError("cancelled by user", "cancelled")).toMatchObject({ title: "Stopped", canContinue: true });
  });
});
