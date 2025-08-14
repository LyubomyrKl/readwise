import Image from "next/image";
import { cn } from "@/lib/utils";

interface BookCoverProps {
  title: string;
  author: string;
  cover?: string;
  className?: string;
}

// Generate a consistent color based on title
function getBookColor(title: string): string {
  const colors = [
    "from-blue-500 to-blue-700",
    "from-green-500 to-green-700", 
    "from-purple-500 to-purple-700",
    "from-red-500 to-red-700",
    "from-orange-500 to-orange-700",
    "from-teal-500 to-teal-700",
    "from-pink-500 to-pink-700",
    "from-indigo-500 to-indigo-700",
    "from-yellow-500 to-yellow-700",
    "from-cyan-500 to-cyan-700",
  ];
  
  const hash = title.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  
  return colors[Math.abs(hash) % colors.length];
}

export function BookCover({ title, author, cover, className }: BookCoverProps) {
  if (cover) {
    return (
      <Image
        src={cover}
        alt={`${title} cover`}
        fill
        className={cn("object-cover transition-transform duration-300 group-hover:scale-105", className)}
        sizes="(max-width:768px) 100vw, 25vw"
      />
    );
  }

  const gradient = getBookColor(title);
  const initials = title
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className={cn(
      "relative w-full h-full flex flex-col justify-between p-4 text-white transition-transform duration-300 group-hover:scale-105",
      `bg-gradient-to-br ${gradient}`,
      className
    )}>
      {/* Decorative pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 right-0 w-20 h-20 border-2 border-white/20 rounded-full -translate-y-10 translate-x-10" />
        <div className="absolute bottom-0 left-0 w-16 h-16 border-2 border-white/20 rounded-full translate-y-8 -translate-x-8" />
      </div>
      
      {/* Book spine effect */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-black/20" />
      
      {/* Title area */}
      <div className="relative z-10 flex-1 flex flex-col justify-center">
        <div className="text-center space-y-2">
          <div className="text-2xl font-bold opacity-50 mb-2">
            {initials}
          </div>
          <h3 className="text-sm font-bold leading-tight line-clamp-4 px-1">
            {title}
          </h3>
        </div>
      </div>
      
      {/* Author at bottom */}
      <div className="relative z-10 text-center">
        <p className="text-xs opacity-80 line-clamp-2">
          {author}
        </p>
      </div>
      
      {/* Paper texture overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent" />
    </div>
  );
}