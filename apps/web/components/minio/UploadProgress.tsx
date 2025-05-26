'use client';

import React from 'react';
import { Button } from "@workspace/ui/components/button";
import { 
  ArrowLeft,
  Loader2,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { UploadState, FileState } from './types';
import { formatFileSize, getFileIcon, calculateRemainingTime } from './utils';

interface UploadProgressProps {
  selectedFiles: FileList;
  uploadState: UploadState;
  onNavigateToFile: (index: number) => void;
}

export const UploadProgress: React.FC<UploadProgressProps> = ({
  selectedFiles,
  uploadState,
  onNavigateToFile,
}) => {
  const {
    activeFileIndex,
    fileProgresses,
    fileStates,
    transferSpeed,
    successfulUploads,
    failedUploads,
    totalBytesUploaded,
    totalBytes,
    totalSpeed,
  } = uploadState;

  const calculateTotalPercentage = () => {
    if (totalBytes === 0) return 0;
    return Math.min(Math.round((totalBytesUploaded / totalBytes) * 100), 100);
  };

  const calculateTotalRemainingTime = () => {
    return calculateRemainingTime(totalSpeed, totalBytes, totalBytesUploaded);
  };

  const navigateToPrevFile = () => {
    if (activeFileIndex > 0) {
      onNavigateToFile(activeFileIndex - 1);
    }
  };

  const navigateToNextFile = () => {
    if (activeFileIndex < selectedFiles.length - 1) {
      onNavigateToFile(activeFileIndex + 1);
    }
  };

  const currentFile = selectedFiles[activeFileIndex];
  const currentFileProgress = fileProgresses[activeFileIndex] || 0;
  const currentFileState = fileStates[activeFileIndex];

  return (
    <div 
      className="rounded-lg p-6 space-y-4 animate-in fade-in slide-in-from-top-4" 
      style={{ backgroundColor: "oklch(0.274 0.006 286.033)" }}
    >
      {/* Header with file information and navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {selectedFiles.length > 1 && (
            <Button 
              size="icon" 
              variant="ghost" 
              className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
              onClick={navigateToPrevFile}
              disabled={activeFileIndex <= 0}
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Previous file</span>
            </Button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium" style={{ color: "oklch(0.985 0 0)" }}>
                {currentFile?.name || 'Uploading file...'}
              </p>
              <div className="bg-primary/20 text-primary px-2 py-0.5 rounded-md text-xs font-medium">
                {currentFileProgress}%
              </div>
            </div>
            <p className="text-sm" style={{ color: "oklch(0.705 0.015 286.067)" }}>
              {selectedFiles.length > 1 
                ? `File ${activeFileIndex + 1} of ${selectedFiles.length} • ${successfulUploads + failedUploads} completed`
                : (currentFile ? formatFileSize(currentFile.size) : '')}
            </p>
          </div>
          {selectedFiles.length > 1 && (
            <Button 
              size="icon" 
              variant="ghost" 
              className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
              onClick={navigateToNextFile}
              disabled={activeFileIndex >= selectedFiles.length - 1}
            >
              <ArrowLeft className="h-4 w-4 transform rotate-180" />
              <span className="sr-only">Next file</span>
            </Button>
          )}
        </div>
        <div className="bg-primary/20 text-primary px-2 py-1 rounded-md text-xs font-medium">
          {currentFileState === 'processing' ? (
            <span className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Processing
            </span>
          ) : currentFileState === 'completed' ? (
            <span className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
              Completed
            </span>
          ) : currentFileState === 'failed' ? (
            <span className="flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Failed
            </span>
          ) : (
            'Uploading'
          )}
        </div>
      </div>

      {/* Active file progress */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="font-medium" style={{ color: "oklch(0.92 0.004 286.32)" }}>
            {currentFileProgress}%
          </span>
          <span style={{ color: "oklch(0.705 0.015 286.067)" }}>
            {formatFileSize(transferSpeed)}/s
          </span>
        </div>
        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
          <div 
            className="bg-primary h-full rounded-full transition-all duration-300"
            style={{ width: `${currentFileProgress}%` }}
          />
        </div>
        <div className="flex justify-between text-xs" style={{ color: "oklch(0.705 0.015 286.067)" }}>
          {currentFile && (
            <>
              <span>
                {formatFileSize(currentFileProgress / 100 * currentFile.size)} of {formatFileSize(currentFile.size)}
              </span>
              <span>Remaining: {calculateRemainingTime(transferSpeed, currentFile.size, currentFileProgress / 100 * currentFile.size)}</span>
            </>
          )}
        </div>
      </div>

      {/* Multi-file overview (only show for multiple files) */}
      {selectedFiles.length > 1 && (
        <div className="mt-4 pt-4 border-t border-border" style={{ borderColor: "oklch(1 0 0 / 10%)" }}>
          <h4 className="text-sm font-medium mb-3" style={{ color: "oklch(0.985 0 0)" }}>
            All Files Progress
          </h4>
          
          {/* File progress list */}
          <div className="grid gap-2 mb-4 max-h-32 overflow-y-auto pr-2">
            {Array.from(selectedFiles).map((file, index) => (
              <div 
                key={index} 
                className={cn(
                  "flex items-center justify-between text-xs p-2 rounded",
                  activeFileIndex === index ? "bg-primary/10" : "hover:bg-muted/30"
                )}
                onClick={() => onNavigateToFile(index)}
                role="button"
                tabIndex={0}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  {getFileIcon(file.name)}
                  <span className="truncate" style={{ color: "oklch(0.985 0 0)" }}>
                    {file.name}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {fileStates[index] === 'processing' ? (
                    <Loader2 className="h-3 w-3 text-amber-500 animate-spin" />
                  ) : fileStates[index] === 'completed' ? (
                    <CheckCircle className="h-3 w-3 text-green-500" />
                  ) : fileStates[index] === 'failed' ? (
                    <AlertCircle className="h-3 w-3 text-red-500" />
                  ) : (
                    <span className="text-xs font-medium" style={{ color: "oklch(0.92 0.004 286.32)" }}>
                      {fileProgresses[index] || 0}%
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          {/* Total progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium" style={{ color: "oklch(0.92 0.004 286.32)" }}>
                {calculateTotalPercentage()}% Total
              </span>
              <span style={{ color: "oklch(0.705 0.015 286.067)" }}>
                {formatFileSize(totalSpeed)}/s (Total)
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div 
                className="bg-primary h-full rounded-full transition-all duration-300"
                style={{ width: `${calculateTotalPercentage()}%` }}
              />
            </div>
            <div className="flex justify-between text-xs" style={{ color: "oklch(0.705 0.015 286.067)" }}>
              <span>
                {formatFileSize(totalBytesUploaded)} of {formatFileSize(totalBytes)}
              </span>
              <span className="flex items-center gap-1">
                <span>{successfulUploads + failedUploads} of {selectedFiles.length} files completed</span>
                <span>•</span>
                <span>ETA: {calculateTotalRemainingTime()}</span>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};