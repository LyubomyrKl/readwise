import { Loader2, Sparkles, Edit, Check, ChevronDown, ChevronUp, X, Upload, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PendingFile } from "../types";

interface PendingFileCardProps {
  file: PendingFile;
  isValid: boolean;
  onUpload: () => void;
  onToggleExpanded: () => void;
  onRemove: () => void;
  onUpdateField: (updates: Partial<PendingFile>) => void;
  onCoverUpload: (coverFile: File) => void;
}

export function PendingFileCard({
  file,
  isValid,
  onUpload,
  onToggleExpanded,
  onRemove,
  onUpdateField,
  onCoverUpload,
}: PendingFileCardProps) {
  const needsAttention = !isValid && !file.isParsingMetadata;

  const getFileExtension = (fileName: string) => {
    return fileName.split('.').pop()?.toUpperCase() || '';
  };

  return (
    <Card
      className={`overflow-hidden transition-all duration-300 hover:shadow-lg ${
        needsAttention ? 'border-orange-500/50' : 'border-2'
      } ${file.isExpanded ? 'shadow-xl' : ''}`}
    >
      {/* Compact View */}
      <div className="p-4">
        <div className="flex items-center gap-4">
          {/* Cover Thumbnail */}
          <div className="relative flex-shrink-0 group">
            <input
              type="file"
              id={`cover-${file.id}`}
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const coverFile = e.target.files?.[0];
                if (coverFile) {
                  onCoverUpload(coverFile);
                }
              }}
            />
            <label
              htmlFor={`cover-${file.id}`}
              className="block w-16 h-20 rounded-md overflow-hidden border-2 border-muted bg-gradient-to-br from-muted to-muted/50 transition-all duration-300 group-hover:border-primary/50 cursor-pointer relative"
            >
              {file.coverPreview || file.extractedCover ? (
                <>
                  <img
                    src={file.coverPreview || file.extractedCover}
                    alt="cover"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <ImagePlus className="h-5 w-5 text-white" />
                  </div>
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                  <ImagePlus className="h-5 w-5 text-muted-foreground opacity-50" />
                  <span className="text-[10px] text-muted-foreground opacity-50">Upload</span>
                </div>
              )}
            </label>
            {file.coverPreview && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center pointer-events-none">
                <Sparkles className="h-2 w-2 text-primary-foreground" />
              </div>
            )}
          </div>

          {/* File Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-lg truncate">
                  {file.title || file.file.name}
                </h3>
                <p className="text-sm text-muted-foreground truncate">
                  {file.author || 'Unknown author'}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs">
                    {getFileExtension(file.file.name)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {(file.file.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                  {file.pageCount && (
                    <>
                      <span className="text-xs text-muted-foreground">•</span>
                      <span className="text-xs text-muted-foreground">
                        {file.pageCount} pages
                      </span>
                    </>
                  )}
                  {file.isParsingMetadata && (
                    <>
                      <span className="text-xs text-muted-foreground">•</span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Analyzing...
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Status Indicator */}
              {isValid && !file.isExpanded && (
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
                    <Check className="h-4 w-4 text-green-500" />
                  </div>
                </div>
              )}
              {needsAttention && !file.isExpanded && (
                <Badge variant="outline" className="text-orange-600 border-orange-600/50">
                  Needs info
                </Badge>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {isValid && !file.isExpanded && (
              <Button
                onClick={onUpload}
                size="sm"
                className="gap-1"
              >
                <Upload className="h-3 w-3" />
                Upload
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleExpanded}
              className="gap-1"
            >
              <Edit className="h-3 w-3" />
              {file.isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onRemove}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Expanded Edit View */}
      {file.isExpanded && (
        <div className="border-t bg-muted/30 p-6 space-y-6 animate-in slide-in-from-top duration-300">
          <div className="display-flex flex-row">
            {/* Cover Upload */}

            {/* Metadata Form */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor={`title-${file.id}`} className="text-sm font-medium">
                  Title <span className="text-destructive">*</span>
                </Label>
                <Input
                  id={`title-${file.id}`}
                  value={file.title}
                  onChange={(e) => onUpdateField({ title: e.target.value })}
                  placeholder="Enter book title"
                  className="h-10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`author-${file.id}`} className="text-sm font-medium">
                  Author <span className="text-destructive">*</span>
                </Label>
                <Input
                  id={`author-${file.id}`}
                  value={file.author}
                  onChange={(e) => onUpdateField({ author: e.target.value })}
                  placeholder="Enter author name"
                  className="h-10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`description-${file.id}`} className="text-sm font-medium">
                  Description
                </Label>
                <Textarea
                  id={`description-${file.id}`}
                  value={file.description}
                  onChange={(e) => onUpdateField({ description: e.target.value })}
                  placeholder="Add a brief description"
                  rows={3}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground text-right">
                  {file.description.length} characters
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={onUpload}
                  disabled={!isValid}
                  className="flex-1 gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Upload Now
                </Button>
                <Button
                  variant="outline"
                  onClick={onToggleExpanded}
                >
                  Collapse
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}