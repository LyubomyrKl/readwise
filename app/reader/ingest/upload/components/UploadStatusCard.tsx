import { FileText, AlertCircle, CheckCircle, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

interface UploadStatus {
  id: string;
  name: string;
  title: string;
  size: number;
  status: "pending" | "processing" | "uploading" | "completed" | "error";
  progress: number;
  error?: string;
}

interface UploadStatusCardProps {
  file: UploadStatus;
  onRemove: () => void;
}

export function UploadStatusCard({ file, onRemove }: UploadStatusCardProps) {
  return (
    <Card className="overflow-hidden border-2">
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${
            file.status === "completed"
              ? "bg-green-500/10"
              : file.status === "error"
              ? "bg-destructive/10"
              : "bg-primary/10"
          }`}>
            {file.status === "completed" && (
              <CheckCircle className="h-6 w-6 text-green-500" />
            )}
            {file.status === "error" && (
              <AlertCircle className="h-6 w-6 text-destructive" />
            )}
            {(file.status === "uploading" || file.status === "processing") && (
              <Loader2 className="h-6 w-6 text-primary animate-spin" />
            )}
            {file.status === "pending" && (
              <FileText className="h-6 w-6 text-muted-foreground" />
            )}
          </div>

          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-lg truncate">{file.title}</h3>
                <p className="text-sm text-muted-foreground truncate">
                  {file.name} • {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onRemove}
                disabled={
                  file.status === "uploading" ||
                  file.status === "processing"
                }
                className="flex-shrink-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant={
                file.status === "completed" ? "default" :
                file.status === "error" ? "destructive" :
                "secondary"
              }>
                {file.status === "pending" && "Preparing"}
                {file.status === "processing" && "Processing"}
                {file.status === "uploading" && "Uploading"}
                {file.status === "completed" && "Completed"}
                {file.status === "error" && "Failed"}
              </Badge>
              {(file.status === "uploading" || file.status === "processing") && (
                <span className="text-sm text-muted-foreground">
                  {file.progress}%
                </span>
              )}
            </div>

            {(file.status === "uploading" || file.status === "processing") && (
              <Progress value={file.progress} className="h-2" />
            )}

            {file.status === "error" && file.error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{file.error}</AlertDescription>
              </Alert>
            )}

            {file.status === "completed" && (
              <Alert className="border-green-500/20 bg-green-500/5">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <AlertDescription className="text-green-700 dark:text-green-400">
                  Successfully uploaded! View it in your library.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
