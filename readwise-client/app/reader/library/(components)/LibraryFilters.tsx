import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
    <div className="mt-4 sm:mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`rounded-full px-2.5 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs ring-1 transition ${
            filter === "all"
              ? "bg-foreground text-background"
              : "text-muted-foreground ring-border"
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFilter("inprogress")}
          className={`rounded-full px-2.5 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs ring-1 transition ${
            filter === "inprogress"
              ? "bg-foreground text-background"
              : "text-muted-foreground ring-border"
          }`}
        >
          In progress
        </button>
        <button
          onClick={() => setFilter("finished")}
          className={`rounded-full px-2.5 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs ring-1 transition ${
            filter === "finished"
              ? "bg-foreground text-background"
              : "text-muted-foreground ring-border"
          }`}
        >
          Finished
        </button>
        <button
          onClick={() => setFilter("favorites")}
          className={`rounded-full px-2.5 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs ring-1 transition ${
            filter === "favorites"
              ? "bg-foreground text-background"
              : "text-muted-foreground ring-border"
          }`}
        >
          Favorites
        </button>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
        <div className="relative w-full sm:w-auto">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title or author"
            className="h-9 w-full sm:w-64 rounded-xl border bg-background px-3 text-sm ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="h-9 w-full sm:w-fit rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Sort: Recent</SelectItem>
            <SelectItem value="alphabetical">Sort: A-Z</SelectItem>
            <SelectItem value="progress">Sort: Progress</SelectItem>
            <SelectItem value="time">Sort: Time spent</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}