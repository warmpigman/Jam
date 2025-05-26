'use client';

import React from 'react';
import { Button } from "@workspace/ui/components/button";
import { Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CheckCircle, AlertCircle } from "lucide-react";
import { FileObject } from './types';
import { formatFileSize, getFileIcon } from './utils';

interface FilesTableProps {
  files: FileObject[];
  isDeleting: string | null;
  onDeleteFile: (fileName: string) => void;
}

export const FilesTable: React.FC<FilesTableProps> = ({
  files,
  isDeleting,
  onDeleteFile,
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
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="hover:bg-muted/50 border-b" style={{ borderColor: "oklch(1 0 0 / 10%)" }}>
            <th className="text-left pb-3" style={{ color: "oklch(0.705 0.015 286.067)" }}>
              Name
            </th>
            <th className="text-left pb-3" style={{ color: "oklch(0.705 0.015 286.067)" }}>
              Size
            </th>
            <th className="text-left pb-3" style={{ color: "oklch(0.705 0.015 286.067)" }}>
              Last Modified
            </th>
            <th className="text-right pb-3" style={{ color: "oklch(0.705 0.015 286.067)" }}>
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {files.map((file) => (
            <tr 
              key={file.name} 
              className="hover:bg-muted/50 border-b" 
              style={{ borderColor: "oklch(1 0 0 / 10%)" }}
            >
              <td className="py-4">
                <div className="flex items-center gap-3">
                  {getFileIcon(file.name)}
                  <span className="font-medium" style={{ color: "oklch(0.985 0 0)" }}>
                    {file.name}
                  </span>
                </div>
              </td>
              <td className="py-4" style={{ color: "oklch(0.705 0.015 286.067)" }}>
                {formatFileSize(file.size)}
              </td>
              <td className="py-4" style={{ color: "oklch(0.705 0.015 286.067)" }}>
                {new Date(file.lastModified).toLocaleString()}
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
  );
};