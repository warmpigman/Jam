'use client';

import React from 'react';
import { Button } from "@workspace/ui/components/button";
import { X } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { FileState } from './types';
import { formatFileSize, getFileIcon } from './utils';

interface FilePreviewProps {
  selectedFiles: FileList;
  fileStates: Record<number, FileState>;
  onRemoveFile: (index: number) => void;
  onUpload: () => void;
  isUploading: boolean;
}

export const FilePreview: React.FC<FilePreviewProps> = ({
  selectedFiles,
  fileStates,
  onRemoveFile,
  onUpload,
  isUploading,
}) => {
  // Determine if we need to make the list scrollable (more than 10 items)
  const needsScroll = selectedFiles.length > 10;

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium" style={{ color: "oklch(0.985 0 0)" }}>
        Selected Files:
      </h4>
      <div 
        className={cn(
          "space-y-2",
          needsScroll && "max-h-[400px] overflow-y-auto pr-2 custom-scrollbar"
        )}
      >
        {Array.from(selectedFiles).map((file, index) => (
          <div
            key={index}
            className={cn(
              "flex items-center justify-between rounded-lg p-3 transition-all duration-300",
              fileStates[index] === 'completed' 
                ? "opacity-0 scale-95"
                : "bg-muted/10",
              fileStates[index] === 'uploading' && "border-l-4 border-primary"
            )}
          >
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="flex-shrink-0 text-muted-foreground">
                {getFileIcon(file.type.split('/')[1] || file.type)}
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium" style={{ color: "oklch(0.985 0 0)" }}>
                  {file.name}
                </p>
                <p className="text-xs" style={{ color: "oklch(0.705 0.015 286.067)" }}>
                  {formatFileSize(file.size)}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onRemoveFile(index);
              }}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button 
        className="w-full" 
        onClick={onUpload} 
        disabled={isUploading}
      >
        Upload {selectedFiles.length} file{selectedFiles.length > 1 ? "s" : ""}
      </Button>
    </div>
  );
};