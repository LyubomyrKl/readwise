import { ThemeProvider } from "next-themes";
import { MotionProvider } from "./MotionProvider";
import { UploadProvider } from "./UploadProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <MotionProvider>
        <UploadProvider>{children}</UploadProvider>
      </MotionProvider>
    </ThemeProvider>
  );
}
