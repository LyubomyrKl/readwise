import Image from "next/image";
import { cn } from "@/lib/utils";

interface BookCoverProps {
  title: string;
  author: string;
  cover?: string;
  className?: string;
  backgroundStyle?: 'classic' | 'modern';
}

// Generate sophisticated color schemes based on title
function getBookTheme(title: string): {
  gradient: string;
  accent: string;
  pattern: string;
} {
  const themes = [
    {
      gradient: "from-slate-900 via-blue-900 to-indigo-900",
      accent: "from-blue-400 to-cyan-300",
      pattern: "from-blue-500/20 to-transparent",
    },
    {
      gradient: "from-emerald-900 via-teal-900 to-cyan-900",
      accent: "from-emerald-400 to-teal-300",
      pattern: "from-emerald-500/20 to-transparent",
    },
    {
      gradient: "from-slate-800 via-blue-800 to-indigo-800",
      accent: "from-blue-300 to-sky-200",
      pattern: "from-blue-400/20 to-transparent",
    },
    {
      gradient: "from-rose-900 via-red-900 to-pink-900",
      accent: "from-rose-400 to-pink-300",
      pattern: "from-rose-500/20 to-transparent",
    },
    {
      gradient: "from-stone-800 via-amber-800 to-orange-800",
      accent: "from-amber-300 to-orange-200",
      pattern: "from-amber-400/20 to-transparent",
    },
    {
      gradient: "from-teal-900 via-emerald-900 to-green-900",
      accent: "from-teal-400 to-emerald-300",
      pattern: "from-teal-500/20 to-transparent",
    },
    {
      gradient: "from-slate-800 via-purple-800 to-indigo-800",
      accent: "from-purple-300 to-lavender-200",
      pattern: "from-purple-400/20 to-transparent",
    },
    {
      gradient: "from-indigo-900 via-blue-900 to-slate-900",
      accent: "from-indigo-400 to-blue-300",
      pattern: "from-indigo-500/20 to-transparent",
    },
  ];

  const hash = title.split("").reduce((a, b) => {
    a = (a << 5) - a + b.charCodeAt(0);
    return a & a;
  }, 0);

  return themes[Math.abs(hash) % themes.length];
}

// Generate modern color schemes
function getModernTheme(title: string): { gradient: string; accent: string; pattern: string } {
  const modernThemes = [
    { 
      gradient: "from-gray-900 via-slate-800 to-gray-900", 
      accent: "from-white to-gray-200",
      pattern: "from-white/10 to-transparent"
    },
    { 
      gradient: "from-neutral-900 via-zinc-800 to-neutral-900", 
      accent: "from-blue-400 to-blue-200",
      pattern: "from-blue-400/10 to-transparent"
    },
    { 
      gradient: "from-slate-900 via-gray-800 to-slate-900", 
      accent: "from-emerald-400 to-emerald-200",
      pattern: "from-emerald-400/10 to-transparent"
    },
    { 
      gradient: "from-zinc-900 via-neutral-800 to-zinc-900", 
      accent: "from-purple-400 to-purple-200",
      pattern: "from-purple-400/10 to-transparent"
    },
    { 
      gradient: "from-gray-900 via-slate-800 to-gray-900", 
      accent: "from-orange-400 to-orange-200",
      pattern: "from-orange-400/10 to-transparent"
    },
    { 
      gradient: "from-neutral-900 via-gray-800 to-neutral-900", 
      accent: "from-teal-400 to-teal-200",
      pattern: "from-teal-400/10 to-transparent"
    },
    { 
      gradient: "from-slate-900 via-zinc-800 to-slate-900", 
      accent: "from-pink-400 to-pink-200",
      pattern: "from-pink-400/10 to-transparent"
    },
    { 
      gradient: "from-zinc-900 via-slate-800 to-zinc-900", 
      accent: "from-indigo-400 to-indigo-200",
      pattern: "from-indigo-400/10 to-transparent"
    },
  ];

  const hash = title.split("").reduce((a, b) => {
    a = (a << 5) - a + b.charCodeAt(0);
    return a & a;
  }, 0);

  return modernThemes[Math.abs(hash) % modernThemes.length];
}

export function BookCover({ title, author, cover, className, backgroundStyle = 'classic' }: BookCoverProps) {
  if (cover) {
    return (
      <Image
        src={cover}
        alt={`${title} cover`}
        fill
        className={cn(
          "object-cover transition-transform duration-300 group-hover:scale-105",
          className
        )}
        sizes="(max-width:768px) 100vw, 25vw"
      />
    );
  }

  const theme = backgroundStyle === 'modern' ? getModernTheme(title) : getBookTheme(title);
  const initials = title
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      className={cn(
        "relative w-full h-full overflow-hidden transition-transform duration-300 group-hover:scale-105",
        `bg-gradient-to-br ${theme.gradient}`,
        className
      )}
    >
      <div className="absolute inset-0">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(circle at 25% 25%, white 1px, transparent 1px),
                                radial-gradient(circle at 75% 75%, white 1px, transparent 1px)`,
            backgroundSize: "24px 24px",
          }}
        />

        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Ccircle cx='7' cy='7' r='1'/%3E%3Ccircle cx='53' cy='53' r='1'/%3E%3Ccircle cx='37' cy='37' r='1'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
      </div>

      <div className="absolute inset-0 border-2 border-white/10 m-2 rounded-sm" />
      <div className="absolute inset-0 border border-white/5 m-3 rounded-sm" />

      <div className="absolute left-0 top-0 bottom-0 w-3 bg-gradient-to-r from-black/30 via-black/10 to-transparent" />
      <div className="absolute left-0 top-0 bottom-0 w-px bg-white/20" />

      <div
        className={`absolute top-6 left-6 right-6 h-px bg-gradient-to-r ${theme.accent} opacity-60`}
      />

      <div className="relative z-10 flex flex-col h-full p-6">
        {backgroundStyle === 'modern' ? (
          /* Modern clean header */
          <div className="flex justify-center mb-6 mt-2">
            <div className="relative">
              {/* Clean rounded rectangle */}
              <div className="relative w-16 h-16 rounded-lg bg-white/8 border border-white/15">
                <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-white/5 to-transparent" />
                
                {/* Modern initials */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-semibold text-white/90 tracking-wider">
                    {initials}
                  </span>
                </div>
              </div>
              
              {/* Subtle corner accent */}
              <div className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-gradient-to-r ${theme.accent} opacity-70`} />
            </div>
          </div>
        ) : (
          /* Classic minimalist header */
          <div className="flex justify-center mb-8">
            <div className="relative">
              {/* Simple elegant line accent */}
              <div
                className={`w-24 h-px bg-gradient-to-r ${theme.accent} mb-4`}
              />

              {/* Clean typography for initials */}
              <div className="text-center">
                <span className="text-2xl font-light text-white/90 font-serif ">
                  {initials}
                </span>
              </div>

              {/* Bottom accent line */}
              <div
                className={`w-16 h-px bg-gradient-to-r ${theme.accent} opacity-60 mt-1 mx-auto`}
              />
            </div>
          </div>
        )}

        <div className="flex-1 flex flex-col justify-center space-y-4">
          <div className="text-center">
            <h3
              className="text-sm font-bold leading-tight text-white/95 tracking-wide line-clamp-4 px-2
                          drop-shadow-sm"
            >
              {title}
            </h3>
          </div>
        </div>

        <div className="text-center mt-auto">
          {backgroundStyle === 'modern' ? (
            /* Modern author styling */
            <div className="relative">
              <div className={`w-16 h-px bg-gradient-to-r ${theme.accent} opacity-40 mx-auto mb-3`} />
              <p className="text-xs text-white/80 font-medium tracking-wide line-clamp-2">
                {author}
              </p>
            </div>
          ) : (
            /* Classic author styling */
            <div className="relative">
              {/* Simple line accent above author */}
              <div className={`w-12 h-px bg-gradient-to-r ${theme.accent} opacity-40 mx-auto mb-3`} />
              
              {/* Clean author typography */}
              <p className="text-xs text-white/75 font-light tracking-wide line-clamp-2 italic">
                {author}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-24 bg-gradient-to-b from-white/10 to-transparent rounded-full blur-xl" />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full h-32 bg-gradient-to-t from-black/20 to-transparent" />

      <div className="absolute top-4 right-4 w-8 h-8 bg-gradient-to-br from-white/10 to-transparent rounded-full blur-sm" />
      <div className="absolute bottom-4 left-4 w-6 h-6 bg-gradient-to-tl from-white/5 to-transparent rounded-full blur-sm" />
    </div>
  );
}
