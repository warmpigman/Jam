import React from "react";
import {
  File,
  FileVideo,
  FileImage,
  FileText,
} from "lucide-react";

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(k));
  return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const getFileIcon = (fileName: string): React.ReactElement => {
  const extension = fileName.split('.').pop()?.toLowerCase();
  
  if (['mp4', 'mov', 'avi', 'wmv', 'flv', 'webm'].includes(extension || '')) {
    return React.createElement(FileVideo, { className: "h-4 w-4 text-muted-foreground" });
  } else if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(extension || '')) {
    return React.createElement(FileImage, { className: "h-4 w-4 text-muted-foreground" });
  } else if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'].includes(extension || '')) {
    return React.createElement(FileText, { className: "h-4 w-4 text-muted-foreground" });
  } else {
    return React.createElement(File, { className: "h-4 w-4 text-muted-foreground" });
  }
};

export const calculateRemainingTime = (speed: number, totalSize: number, loaded: number): string => {
  if (speed > 0 && totalSize > 0) {
    const remainingBytes = totalSize - loaded;
    const remainingSeconds = remainingBytes / speed;
    
    if (remainingSeconds < 60) {
      return `${Math.ceil(remainingSeconds)}s`;
    } else if (remainingSeconds < 3600) {
      const minutes = Math.floor(remainingSeconds / 60);
      const seconds = Math.ceil(remainingSeconds % 60);
      return `${minutes}m ${seconds}s`;
    } else {
      const hours = Math.floor(remainingSeconds / 3600);
      const minutes = Math.floor((remainingSeconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  }
  return 'Calculating...';
};