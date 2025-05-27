'use client';

import React, { useState, useEffect } from 'react';
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

// Integrated Speed Monitor Component
function SpeedMonitor({ 
  isCollapsed, 
  onToggle, 
  currentSpeed,
  totalSpeed 
}: { 
  isCollapsed: boolean; 
  onToggle: () => void;
  currentSpeed: number;
  totalSpeed: number;
}) {
  const [speedData, setSpeedData] = useState<number[]>(Array(60).fill(0));
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    // Update speed data every 500ms for faster graph filling
    const interval = setInterval(() => {
      const speedInKBs = currentSpeed / 1024; // Convert bytes/s to KB/s
      setSpeedData((prev) => [...prev.slice(1), speedInKBs]);
    }, 500);

    return () => clearInterval(interval);
  }, [currentSpeed]);

  // Dynamic speed formatting function
  const formatSpeed = (speedInKBs: number): string => {
    if (speedInKBs >= 1024) {
      return `${(speedInKBs / 1024).toFixed(1)} MB/s`;
    }
    return `${speedInKBs.toFixed(1)} KB/s`;
  };

  const maxSpeed = Math.max(...speedData, 30);
  const nonZeroSpeedData = speedData.filter(speed => speed > 0);
  const averageSpeed = nonZeroSpeedData.length > 0 
    ? nonZeroSpeedData.reduce((a, b) => a + b, 0) / nonZeroSpeedData.length 
    : 0;
  const peakSpeed = Math.max(...speedData);
  const currentSpeedKBs = currentSpeed / 1024;

  return (
    <div
      className="transition-all duration-300 ease-in-out"
      style={{
        backgroundColor: "transparent",
        borderTop: "1px solid oklch(1 0 0 / 8%)",
        marginTop: "1rem",
        paddingTop: "1rem",
      }}
    >
      {/* Minimal Header */}
      <div
        className="flex items-center justify-between cursor-pointer group hover:bg-opacity-50 transition-all duration-200 rounded-md px-2 py-1 -mx-2"
        onClick={onToggle}
        style={{
          backgroundColor: "transparent",
        }}
      >
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: "oklch(0.6 0.15 180)" }} />
            <span
              className="text-xs font-medium opacity-70 group-hover:opacity-100 transition-opacity"
              style={{ color: "oklch(0.985 0 0)" }}
            >
              Network
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!isCollapsed && (
            <div className="flex items-end gap-0.5 h-3 relative">
              {speedData.slice(-8).map((speed, index) => {
                const height = Math.max(1, (speed / maxSpeed) * 10);
                const opacity = Math.min(1, 0.2 + (speed / maxSpeed) * 0.6);

                return (
                  <div
                    key={index}
                    className="transition-all duration-200 ease-out relative"
                    style={{
                      width: "1.5px",
                      height: `${height}px`,
                      backgroundColor: `oklch(0.6 0.15 180 / ${opacity})`,
                    }}
                  />
                );
              })}
            </div>
          )}
          <button className="opacity-40 group-hover:opacity-70 transition-opacity p-0.5">
            {isCollapsed ? (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            ) : (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      <div
        className={`transition-all duration-300 ease-in-out overflow-hidden ${
          isCollapsed ? "max-h-0 opacity-0" : "max-h-32 opacity-100"
        }`}
        style={{ marginTop: isCollapsed ? "0" : "0.75rem" }}
      >
        <div className="space-y-3">
          {/* Detailed Speed Graph */}
          <div className="relative" style={{ backgroundColor: "oklch(0 0 0 / 8%)" }}>
            {/* Subtle Axis Lines */}
            <div className="absolute inset-0 flex flex-col justify-between pl-16 pr-8 py-3 pointer-events-none">
              {[75, 50, 25].map((percent) => (
                <div
                  key={percent}
                  className="w-full border-t"
                  style={{
                    borderColor: "oklch(1 0 0 / 5%)",
                    borderWidth: "0.5px",
                  }}
                />
              ))}
            </div>

            {/* Speed Graph with Hover */}
            <div
              className="flex items-end justify-center h-16 gap-0.5 px-8 py-3 relative"
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {speedData.map((speed, index) => {
                const height = Math.max(1, (speed / maxSpeed) * 48);
                const opacity = Math.min(1, 0.2 + (speed / maxSpeed) * 0.6);
                const isHovered = hoveredIndex === index;

                return (
                  <div
                    key={index}
                    className="transition-all duration-200 ease-out relative cursor-crosshair"
                    style={{
                      width: "1.5px",
                      height: `${height}px`,
                      backgroundColor: `oklch(0.6 0.15 180 / ${isHovered ? Math.min(1, opacity + 0.3) : opacity})`,
                      transform: isHovered ? "scaleX(1.5)" : "scaleX(1)",
                    }}
                    onMouseEnter={(e) => {
                      setHoveredIndex(index);
                      const rect = e.currentTarget.getBoundingClientRect();
                      setTooltipPosition({
                        x: rect.left + rect.width / 2,
                        y: rect.top - 10,
                      });
                    }}
                  />
                );
              })}
            </div>

            {/* Subtle Y-Axis Labels */}
            <div className="absolute left-2 top-0 h-16 flex flex-col justify-between text-xs py-3 pl-1 pr-4 pointer-events-none">
              {[
                { value: maxSpeed.toFixed(0), label: formatSpeed(maxSpeed) },
                { value: (maxSpeed * 0.5).toFixed(0), label: formatSpeed(maxSpeed * 0.5) },
                { value: "0", label: formatSpeed(0) },
              ].map((item, index) => (
                <div
                  key={index}
                  className="flex items-center"
                  style={{
                    height: "1px",
                    transform: index === 0 ? "translateY(-6px)" : index === 2 ? "translateY(6px)" : "translateY(0px)",
                  }}
                >
                  <span
                    className="text-xs leading-none whitespace-nowrap"
                    style={{
                      color: "oklch(0.705 0.015 286.067)",
                      opacity: 0.5,
                      fontSize: "9px",
                      fontWeight: "500",
                    }}
                  >
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Hover Tooltip */}
          {hoveredIndex !== null && (
            <div
              className="fixed z-50 pointer-events-none transition-opacity duration-200"
              style={{
                left: `${tooltipPosition.x}px`,
                top: `${tooltipPosition.y}px`,
                transform: "translate(-50%, -100%)",
              }}
            >
              <div
                className="px-2 py-1 rounded text-xs shadow-lg border"
                style={{
                  backgroundColor: "oklch(0.21 0.006 285.885)",
                  borderColor: "oklch(1 0 0 / 15%)",
                  color: "oklch(0.985 0 0)",
                }}
              >
                <div className="font-medium">{formatSpeed(speedData[hoveredIndex])}</div>
                <div className="text-xs" style={{ color: "oklch(0.705 0.015 286.067)" }}>
                  {Math.round((60 - hoveredIndex) * 0.5)}s ago
                </div>
              </div>
            </div>
          )}

          {/* Minimal Stats */}
          <div className="flex justify-between items-center text-xs opacity-60">
            <span style={{ color: "oklch(0.705 0.015 286.067)" }}>
              Peak: {formatSpeed(peakSpeed)}
            </span>
            <span style={{ color: "oklch(0.705 0.015 286.067)" }}>
              Avg: {formatSpeed(averageSpeed)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

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
  const [isSpeedMonitorCollapsed, setIsSpeedMonitorCollapsed] = useState(false);
  
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

      {/* Speed Monitor */}
      <SpeedMonitor
        isCollapsed={isSpeedMonitorCollapsed}
        onToggle={() => setIsSpeedMonitorCollapsed(!isSpeedMonitorCollapsed)}
        currentSpeed={transferSpeed}
        totalSpeed={totalSpeed}
      />
    </div>
  );
};