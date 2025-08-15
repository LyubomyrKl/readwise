interface LibraryFiltersProps {
  query: string;
  setQuery: (query: string) => void;
  filter: "all" | "inprogress" | "finished" | "favorites";
  setFilter: (filter: "all" | "inprogress" | "finished" | "favorites") => void;
  sortBy: "recent" | "progress" | "alphabetical" | "time";
  setSortBy: (sortBy: "recent" | "progress" | "alphabetical" | "time") => void;
}

export function LibraryFilters({
  query,
  setQuery,
  filter,
  setFilter,
  sortBy,
  setSortBy,
}: LibraryFiltersProps) {
  return (
    <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`rounded-full px-3 py-1.5 text-xs ring-1 transition ${
            filter === "all"
              ? "bg-foreground text-background"
              : "text-muted-foreground ring-border"
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFilter("inprogress")}
          className={`rounded-full px-3 py-1.5 text-xs ring-1 transition ${
            filter === "inprogress"
              ? "bg-foreground text-background"
              : "text-muted-foreground ring-border"
          }`}
        >
          In progress
        </button>
        <button
          onClick={() => setFilter("finished")}
          className={`rounded-full px-3 py-1.5 text-xs ring-1 transition ${
            filter === "finished"
              ? "bg-foreground text-background"
              : "text-muted-foreground ring-border"
          }`}
        >
          Finished
        </button>
        <button
          onClick={() => setFilter("favorites")}
          className={`rounded-full px-3 py-1.5 text-xs ring-1 transition ${
            filter === "favorites"
              ? "bg-foreground text-background"
              : "text-muted-foreground ring-border"
          }`}
        >
          Favorites
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title or author"
            className="h-9 w-64 rounded-xl border bg-background px-3 text-sm ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className="h-9 rounded-xl border bg-background px-3 text-sm ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="recent">Sort: Recent</option>
          <option value="alphabetical">Sort: A-Z</option>
          <option value="progress">Sort: Progress</option>
          <option value="time">Sort: Time spent</option>
        </select>
      </div>
    </div>
  );
}