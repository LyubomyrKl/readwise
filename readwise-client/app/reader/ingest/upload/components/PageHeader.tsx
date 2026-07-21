import { BookOpen } from "lucide-react";

export function PageHeader() {
  return (
    <div className="text-center mb-12 space-y-4">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 mb-4">
        <BookOpen className="h-8 w-8 text-primary" />
      </div>
      <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
        Upload Your Books
      </h1>
      <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
        Drop your books and we'll extract metadata automatically. Quick and easy.
      </p>
    </div>
  );
}
