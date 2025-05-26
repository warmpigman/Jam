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
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium" style={{ color: "oklch(0.985 0 0)" }}>
        Selected Files:
      </h4>
      {Array.from(selectedFiles).map((file, index) => (
        <div
          key={index}
          className={cn(
            "flex items-center justify-between rounded-lg p-3 transition-all duration-300",
            fileStates[index] === 'completed' 
              ? "opacity-0 scale-95"
              : "opacity-100"
          )}
          style={{ 
            backgroundColor: "oklch(0.274 0.006 286.033)",
            height: fileStates[index] === 'completed' ? '0' : 'auto',
            padding: fileStates[index] === 'completed' ? '0' : undefined,
            margin: fileStates[index] === 'completed' ? '0' : undefined,
            overflow: fileStates[index] === 'completed' ? 'hidden' : 'visible',
            transitionDelay: fileStates[index] === 'completed' ? "300ms" : "0ms",
            transitionProperty: fileStates[index] === 'completed' 
              ? "opacity, transform, height, padding, margin" 
              : "opacity, transform"
          }}
        >
          <div className="flex items-center gap-3">
            {getFileIcon(file.name)}
            <div>
              <p className="text-sm font-medium" style={{ color: "oklch(0.985 0 0)" }}>
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