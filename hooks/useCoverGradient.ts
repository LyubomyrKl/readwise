// hooks/useCoverGradient.ts
import { hsl, rgbToHsl } from "@/lib/utils";
import * as React from "react";

export function useCoverGradient(src?: string) {
  const [css, setCss] = React.useState<string>("");

  React.useEffect(() => {
    if (!src) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = 32;
      c.height = 32;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, 32, 32);
      const { data } = ctx.getImageData(0, 0, 32, 32);
      let r = 0,
        g = 0,
        b = 0,
        n = 0;
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a < 16) continue; // ignore near-transparent pixels
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        n++;
      }
      if (!n) return;
      r = Math.round(r / n);
      g = Math.round(g / n);
      b = Math.round(b / n);
      const { h, s, l } = rgbToHsl(r, g, b);

      // Palette from cover
      const primary = hsl(h, Math.min(s + 10, 85), Math.min(l + 5, 70));
      const accent = hsl(
        (h + 22) % 360,
        Math.min(s + 15, 90),
        Math.max(l - 5, 35)
      );
      const deepBg = hsl(h, Math.max(s - 40, 15), Math.max(l - 40, 8));

      // Layered gradients + subtle vignette. Soft, minimal, readable.
      const gcss = `
        radial-gradient(1000px 520px at 50% -10%, ${primary.replace(
          ")",
          ",0.35)"
        )} 0%, transparent 60%),
        radial-gradient(1200px 640px at 50% -25%, ${accent.replace(
          ")",
          ",0.25)"
        )} 0%, transparent 70%),
        linear-gradient(to bottom, ${deepBg} 0%, ${deepBg} 35%, rgba(0,0,0,0) 60%),
        linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,.04) 40%, rgba(0,0,0,.06) 100%)
      `;
      setCss(gcss);
    };
  }, [src]);

  return css;
}
