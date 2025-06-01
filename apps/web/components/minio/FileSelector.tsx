'use client';

import React, { useRef, type DragEvent } from 'react';
import { Upload } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { toast } from "sonner";
import { CheckCircle } from "lucide-react";

interface FileSelectorProps {
  isDragOver: boolean;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onFileSelect: (files: FileList) => void;
}

export const FileSelector: React.FC<FileSelectorProps> = ({
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileSelect,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onFileSelect(files);
      
      toast.success("Files Selected", {
        description: `${files.length} file${files.length > 1 ? "s" : ""} ready for upload`,
        icon: <CheckCircle className="h-4 w-4" />,
        position: "top-right",
      });
    }
  };

  return (
    <div
      className={cn(
        "border-2 border-dashed rounded-lg p-8 text-center transition-all duration-200 cursor-pointer",
        isDragOver ? "border-primary bg-primary/5 scale-[1.02]" : "hover:border-muted-foreground",
      )}
      style={{
        borderColor: isDragOver ? "oklch(0.92 0.004 286.32)" : "oklch(1 0 0 / 10%)",
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={handleBrowseClick}
    >
      <Upload
        className={cn(
          "h-12 w-12 mx-auto mb-4 transition-colors",
          isDragOver ? "text-primary" : "text-muted-foreground",
        )}
      />
      <p className="mb-2" style={{ color: "oklch(0.985 0 0)" }}>
        {isDragOver ? "Drop files here" : "Select files to upload"}
      </p>
      <p className="text-sm" style={{ color: "oklch(0.705 0.015 286.067)" }}>
        Drag and drop or click to browse
      </p>
      <input 
        ref={fileInputRef} 
        type="file" 
        multiple 
        className="hidden" 
        onChange={handleFileInputChange} 
      />
    </div>
  );
};