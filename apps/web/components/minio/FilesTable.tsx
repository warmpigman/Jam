'use client';

import React from 'react';
import { Button } from "@workspace/ui/components/button";
import { Download, Trash2, TrashIcon } from "lucide-react";
import { toast } from "sonner";
import { CheckCircle, AlertCircle } from "lucide-react";
import { FileObject } from './types';
import { formatFileSize, getFileIcon } from './utils';
import { cn } from "@workspace/ui/lib/utils";

interface FilesTableProps {
  files: FileObject[];
  isDeleting: string | null;
  isDeletingAll?: boolean;
  onDeleteFile: (fileName: string) => void;
  onDeleteAllFiles?: () => void;
  highlightedFile?: string | null;
}

export const FilesTable: React.FC<FilesTableProps> = ({
  files,
  isDeleting,
  isDeletingAll = false,
  onDeleteFile,
  onDeleteAllFiles,
  highlightedFile
}) => {
  const handleDownload = (file: FileObject) => {
    toast.success("Download Started", {
      description: `Downloading ${file.name}`,
      icon: <CheckCircle className="h-4 w-4" />,
      position: "top-right",
    });
  };

  if (files.length === 0) {
    return (
      <p className="text-muted-foreground italic">No files uploaded yet.</p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          {files.length} file{files.length !== 1 ? 's' : ''} available
        </p>
        <Button
          variant="destructive"
          size="sm"
          onClick={onDeleteAllFiles}
          disabled={isDeletingAll || files.length === 0}
          className="text-destructive-foreground bg-destructive hover:bg-destructive/90"
        >
          <TrashIcon className="h-4 w-4 mr-1" />
          {isDeletingAll ? 'Deleting All...' : `Delete All`}
        </Button>
      </div>
      
      <div 
        className={cn(
          "overflow-x-auto",
          files.length > 10 && "max-h-[500px] overflow-y-auto custom-scrollbar pr-2"
        )}
      >
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10" style={{ backgroundColor: "oklch(0.21 0.006 285.885)" }}>
            <tr className="border-b border-muted">
              <th className="text-left py-3 px-2 font-medium">Name</th>
              <th className="text-left py-3 px-2 font-medium">Type</th>
              <th className="text-left py-3 px-2 font-medium">Size</th>
              <th className="text-right py-3 px-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <tr 
                key={file.name} 
                className={cn(
                  "border-b border-muted hover:bg-muted/20 transition-colors",
                  highlightedFile === file.name && "bg-primary/10 hover:bg-primary/15"
                )}
              >
                <td className="py-4 px-2">
                  <div className="flex items-center gap-2">
                    {getFileIcon(file.type)}
                    <span className="truncate max-w-[250px]">{file.name}</span>
                  </div>
                </td>
                <td className="py-4 px-2 text-muted-foreground capitalize">
                  {file.type}
                </td>
                <td className="py-4 px-2 text-muted-foreground">
                  {formatFileSize(file.size)}
                </td>
                <td className="py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <a href={file.url} target="_blank" rel="noopener noreferrer">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-primary hover:text-primary hover:bg-primary/10"
                        onClick={() => handleDownload(file)}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Download
                      </Button>
                    </a>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => onDeleteFile(file.name)}
                      disabled={isDeleting === file.name}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      {isDeleting === file.name ? 'Deleting...' : 'Delete'}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};