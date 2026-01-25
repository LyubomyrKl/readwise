import { Upload as UploadIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DropzoneOptions } from "react-dropzone";

interface UploadDropZoneProps {
  getRootProps: () => any;
  getInputProps: () => any;
  isDragActive: boolean;
}

export function UploadDropZone({ getRootProps, getInputProps, isDragActive }: UploadDropZoneProps) {
  return (
    <Card className="mb-8 border-2 overflow-hidden transition-all duration-300 hover:shadow-lg">
      <CardContent className="p-0">
        <div
          {...getRootProps()}
          className={`relative p-12 sm:p-16 text-center cursor-pointer transition-all duration-300 ${
            isDragActive
              ? "bg-gradient-to-br from-primary/10 via-primary/5 to-primary/10 border-primary"
              : "bg-gradient-to-br from-muted/30 via-background to-muted/30 hover:from-muted/40 hover:to-muted/40"
          }`}
        >
          <input {...getInputProps()} />

          <div className="absolute inset-0 opacity-5">
            <div className="absolute inset-0" style={{
              backgroundImage: `radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)`,
              backgroundSize: '32px 32px'
            }} />
          </div>

          <div className="relative z-10">
            {isDragActive ? (
              <div className="space-y-4 animate-in fade-in zoom-in duration-200">
                <div className="mx-auto w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                  <UploadIcon className="h-10 w-10 text-primary animate-bounce" />
                </div>
                <p className="text-2xl font-semibold text-primary">
                  Drop your files here
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center transition-transform duration-300 hover:scale-110">
                  <UploadIcon className="h-10 w-10 text-primary" />
                </div>

                <div className="space-y-2">
                  <p className="text-xl sm:text-2xl font-semibold">
                    Drag & drop your books here
                  </p>
                  <p className="text-muted-foreground">
                    or click to browse your files
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2 pt-4">
                  <Badge variant="secondary" className="text-sm">
                    <span className="mr-1">📕</span> PDF
                  </Badge>
                  <Badge variant="secondary" className="text-sm">
                    <span className="mr-1">📘</span> EPUB
                  </Badge>
                  <Badge variant="secondary" className="text-sm">
                    <span className="mr-1">📄</span> TXT
                  </Badge>
                </div>
              </div>
            )}
          </div>

          <div className="absolute top-4 left-4 w-8 h-8 border-t-2 border-l-2 border-muted-foreground/20 rounded-tl-lg" />
          <div className="absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 border-muted-foreground/20 rounded-tr-lg" />
          <div className="absolute bottom-4 left-4 w-8 h-8 border-b-2 border-l-2 border-muted-foreground/20 rounded-bl-lg" />
          <div className="absolute bottom-4 right-4 w-8 h-8 border-b-2 border-r-2 border-muted-foreground/20 rounded-br-lg" />
        </div>
      </CardContent>
    </Card>
  );
}