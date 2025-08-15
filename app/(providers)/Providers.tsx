import { ThemeProvider } from "next-themes";
import { MotionProvider } from "./MotionProvider";
import { UploadProvider } from "./UploadProvider";
import { BookCoverProvider } from "./BookCoverProvider/BookCoverProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <MotionProvider>
        <UploadProvider>
          <BookCoverProvider>{children}</BookCoverProvider>
        </UploadProvider>
      </MotionProvider>
    </ThemeProvider>
  );
}
