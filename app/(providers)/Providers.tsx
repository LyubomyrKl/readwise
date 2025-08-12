import { ThemeProvider } from "next-themes";
import { MotionProvider } from "./MotionProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <MotionProvider>{children}</MotionProvider>
    </ThemeProvider>
  );
}
