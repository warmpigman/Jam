export interface FileObject {
  name: string;
  size: number;
  lastModified: string;
  url: string;
}

export type FileState = 'uploading' | 'processing' | 'completed' | 'failed';

export interface UploadState {
  isUploading: boolean;
  uploadProgress: number;
  transferSpeed: number;
  successfulUploads: number;
  failedUploads: number;
  activeFileIndex: number;
  fileProgresses: Record<number, number>;
  fileStates: Record<number, FileState>;
  totalBytesUploaded: number;
  totalBytes: number;
  totalSpeed: number;
}