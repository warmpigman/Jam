'use client';

import React, { useState, useEffect, useCallback, useRef, type DragEvent } from 'react';
import Link from 'next/link';
import { Button } from "@workspace/ui/components/button";
import {
  ArrowLeft,
  Upload,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";
import { toast } from "sonner";

// Import our new components
import {
  FileSelector,
  FilePreview,
  UploadProgress,
  FilesTable,
  FileObject,
  UploadState,
  FileState,
  SearchBar,
} from '@/components/minio';

// Define the component using React.memo to help with re-rendering during HMR
const MinioTestPage: React.FC = React.memo(() => {
  const [files, setFiles] = useState<FileObject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [highlightedFile, setHighlightedFile] = useState<string | null>(null);

  // Upload state consolidated into a single object
  const [uploadState, setUploadState] = useState<UploadState>({
    isUploading: false,
    uploadProgress: 0,
    transferSpeed: 0,
    successfulUploads: 0,
    failedUploads: 0,
    activeFileIndex: 0,
    fileProgresses: {},
    fileStates: {},
    totalBytesUploaded: 0,
    totalBytes: 0,
    totalSpeed: 0,
  });

  // Additional state for tracking upload progress - using refs to avoid stale closures
  const speedTrackingRef = useRef<{
    fileStartTimes: Record<number, number>;
    filePreviousLoaded: Record<number, number>;
    filePreviousTime: Record<number, number>;
    globalStartTime: number;
    globalPreviousLoaded: number;
    globalPreviousTime: number;
  }>({
    fileStartTimes: {},
    filePreviousLoaded: {},
    filePreviousTime: {},
    globalStartTime: 0,
    globalPreviousLoaded: 0,
    globalPreviousTime: 0,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const determineFileType = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
    const videoExts = ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm'];
    const documentExts = ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'];
    const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz'];
    
    if (imageExts.includes(ext || '')) return 'image';
    if (videoExts.includes(ext || '')) return 'video';
    if (documentExts.includes(ext || '')) return 'document';
    if (archiveExts.includes(ext || '')) return 'archive';
    
    return 'file';
  };

  const fetchFiles = useCallback(async () => {
    try {
      const response = await fetch('/api/minio/list');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      
      // Add type field to each file
      const filesWithType = data.files.map((file: any) => ({
        ...file,
        type: determineFileType(file.name)
      }));
      
      setFiles(filesWithType);
      setError(null);
    } catch (err: any) {
      console.error('Fetch error:', err);
      setError(err.message || 'Failed to fetch files');
    }
  }, []);

  // Fetch the list of files from MinIO on component mount
  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleDeleteFile = useCallback(async (fileName: string) => {
    if (!confirm(`Are you sure you want to delete "${fileName}"?`)) {
      return;
    }

    setIsDeleting(fileName);
    setError(null);

    try {
      const response = await fetch(`/api/minio/delete?objectName=${encodeURIComponent(fileName)}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Delete failed');
      }

      toast.success("File Deleted", {
        description: `${fileName} has been permanently deleted`,
        icon: <CheckCircle className="h-4 w-4" />,
        position: "top-right",
      });

      fetchFiles();
    } catch (err: any) {
      console.error('Delete error:', err);
      setError(err.message || 'Failed to delete file');
      toast.error("Delete Error", {
        description: err.message || 'Failed to delete file',
        icon: <AlertCircle className="h-4 w-4" />,
        position: "top-right",
      });
    } finally {
      setIsDeleting(null);

    }
  }, [fetchFiles]);

  const handleDeleteAllFiles = useCallback(async () => {
    if (files.length === 0) return;
    
    // Create a more descriptive confirmation message
    const fileCount = files.length;
    const fileWord = fileCount === 1 ? 'file' : 'files';
    const confirmMessage = `Are you sure you want to delete all ${fileCount} ${fileWord}?\n\nThis action cannot be undone.`;
    
    if (!confirm(confirmMessage)) {
      return;
    }

    setIsDeletingAll(true);
    setError(null);

    try {
      let successCount = 0;
      let failCount = 0;

      // Create a toast for the overall deletion process
      const deleteToastId = toast.loading(`Deleting all files...`, {
        description: `0/${files.length} files deleted`,
        position: "top-right",
      });

      // Process files in batches to avoid overwhelming the server
      const batchSize = 5;
      const totalFiles = files.length;
      
      for (let i = 0; i < totalFiles; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        
        // Create a batch of promises for concurrent deletion
        const batchPromises = batch.map(file => 
          fetch(`/api/minio/delete?objectName=${encodeURIComponent(file.name)}`, {
            method: 'DELETE',
          }).then(response => {
            if (response.ok) {
              successCount++;
              return true;
            } else {
              failCount++;
              return false;
            }
          }).catch(() => {
            failCount++;
            return false;
          })
        );
        
        // Wait for the current batch to complete
        await Promise.all(batchPromises);
        
        // Update the toast with progress
        toast.loading(`Deleting files...`, {
          id: deleteToastId,
          description: `${successCount}/${totalFiles} files deleted`,
          position: "top-right",
        });
      }

      // Show appropriate final toast based on results
      if (successCount === totalFiles) {
        toast.success("All Files Deleted", {
          id: deleteToastId,
          description: `Successfully deleted ${totalFiles} ${totalFiles !== 1 ? 'files' : 'file'}`,
          icon: <CheckCircle className="h-4 w-4" />,
          position: "top-right",
        });
      } else if (successCount > 0 && failCount > 0) {
        toast.warning("Deletion Partially Complete", {
          id: deleteToastId,
          description: `${successCount} deleted, ${failCount} failed`,
          icon: <AlertTriangle className="h-4 w-4" />,
          position: "top-right",
        });
      } else {
        toast.error("Deletion Failed", {
          id: deleteToastId,
          description: "All files failed to delete",
          icon: <AlertCircle className="h-4 w-4" />,
          position: "top-right",
        });
      }

      fetchFiles();
    } catch (err: any) {
      console.error('Delete all error:', err);
      setError(err.message || 'Failed to delete files');
      toast.error("Delete Error", {
        description: err.message || 'Failed to delete files',
        icon: <AlertCircle className="h-4 w-4" />,
        position: "top-right",
      });
    } finally {
      setIsDeletingAll(false);
    }
  }, [files, fetchFiles]);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      setSelectedFiles(droppedFiles);

      toast.success("Files Selected", {
        description: `${droppedFiles.length} file${droppedFiles.length > 1 ? "s" : ""} ready for upload`,
        icon: <CheckCircle className="h-4 w-4" />,
        position: "top-right",
      });
    }
  };

  const handleFileSelect = (files: FileList) => {
    setSelectedFiles(files);
  };

  const removeSelectedFile = (index: number) => {
    if (selectedFiles) {
      const dt = new DataTransfer();
      for (let i = 0; i < selectedFiles.length; i++) {
        if (i !== index) {
          const file = selectedFiles[i];
          if (file) {
            dt.items.add(file);
          }
        }
      }
      setSelectedFiles(dt.files.length > 0 ? dt.files : null);

      toast.warning("File Removed", {
        description: "File removed from upload queue",
        icon: <AlertTriangle className="h-4 w-4" />,
        position: "top-right",
      });
    }
  };

  const handleNavigateToFile = (index: number) => {
    setUploadState((prev: UploadState) => ({
      ...prev,
      activeFileIndex: index,
      uploadProgress: prev.fileProgresses[index] || 0,
    }));
  };

  const handleFileSelectSearch = (fileName: string) => {
    // Set the highlighted file
    setHighlightedFile(fileName);

    // Clear highlight after 3 seconds
    setTimeout(() => {
      setHighlightedFile(null);
    }, 3000);

    toast.success("File Found", {
      description: `Highlighted ${fileName}`,
      icon: <CheckCircle className="h-4 w-4" />,
      position: "top-right",
    });
  };

  const handleUpload = async () => {
    if (!selectedFiles || selectedFiles.length === 0) {
      toast.error("No Files Selected", {
        description: "Please select files to upload",
        icon: <AlertCircle className="h-4 w-4" />,
        position: "top-right",
      });
      return;
    }

    // Reset speed tracking
    const now = Date.now();
    speedTrackingRef.current = {
      fileStartTimes: {},
      filePreviousLoaded: {},
      filePreviousTime: {},
      globalStartTime: now,
      globalPreviousLoaded: 0,
      globalPreviousTime: now,
    };

    setUploadState((prev: UploadState) => ({
      ...prev,
      isUploading: true,
      uploadProgress: 0,
      successfulUploads: 0,
      failedUploads: 0,
      activeFileIndex: 0,
      fileProgresses: {},
      fileStates: {},
      totalBytesUploaded: 0,
      totalBytes: 0,
      totalSpeed: 0,
      transferSpeed: 0,
    }));

    // Calculate total size for all files
    let totalSize = 0;
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      if (file) {
        totalSize += file.size;
      }
    }

    setUploadState((prev: UploadState) => ({ ...prev, totalBytes: totalSize }));

    toast.success("Upload Started", {
      description: `Uploading ${selectedFiles.length} file${selectedFiles.length > 1 ? "s" : ""} to MinIO`,
      icon: <CheckCircle className="h-4 w-4" />,
      position: "top-right",
    });

    const totalFiles = selectedFiles.length;
    const uploadPromises = [];

    // Setup for parallel uploads
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      if (!file) continue;

      const currentFileToast = toast.loading(`Preparing upload ${i + 1} of ${totalFiles}`, {
        description: file.name,
        position: "top-right",
      });

      uploadPromises.push(
        new Promise<void>(async (resolve) => {
          try {
            await uploadFile(file, i, totalFiles, String(currentFileToast));
            setUploadState((prev: UploadState) => ({ ...prev, successfulUploads: prev.successfulUploads + 1 }));
            resolve();
          } catch (err) {
            setUploadState((prev: UploadState) => ({ ...prev, failedUploads: prev.failedUploads + 1 }));
            resolve();
          }
        })
      );
    }

    try {
      await Promise.all(uploadPromises);

      // Final summary toast after all uploads are attempted
      const currentState = uploadState;
      if (currentState.successfulUploads === totalFiles) {
        toast.success("All Files Uploaded", {
          description: `Successfully uploaded ${totalFiles} file${totalFiles !== 1 ? 's' : ''}`,
          icon: <CheckCircle className="h-4 w-4" />,
          position: "top-right",
        });
      } else if (currentState.successfulUploads > 0 && currentState.failedUploads > 0) {
        toast.warning("Upload Partially Complete", {
          description: `${currentState.successfulUploads} succeeded, ${currentState.failedUploads} failed`,
          icon: <AlertTriangle className="h-4 w-4" />,
          position: "top-right",
        });
      } else {
        toast.error("Upload Failed", {
          description: "All files failed to upload",
          icon: <AlertCircle className="h-4 w-4" />,
          position: "top-right",
        });
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      setTimeout(() => {
        setSelectedFiles(null);
      }, 2000);

      if (currentState.successfulUploads > 0) {
        fetchFiles();
      }
    } catch (err: any) {
      console.error('Upload process error:', err);
      setError(err.message || 'Failed to upload files');
      toast.error("Upload Process Failed", {
        description: err.message || 'An unexpected error occurred during the upload process',
        icon: <AlertCircle className="h-4 w-4" />,
        position: "top-right",
      });

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setTimeout(() => {
        setSelectedFiles(null);
      }, 2000);
    } finally {
      setUploadState((prev: UploadState) => ({ ...prev, isUploading: false }));
      setTimeout(() => {
        setUploadState({
          isUploading: false,
          uploadProgress: 0,
          transferSpeed: 0,
          successfulUploads: 0,
          failedUploads: 0,
          activeFileIndex: 0,
          fileProgresses: {},
          fileStates: {},
          totalBytesUploaded: 0,
          totalBytes: 0,
          totalSpeed: 0,
        });
      }, 2000);
    }
  };

  // Helper function to upload a single file
  const uploadFile = async (file: File, index: number, totalFiles: number, toastId: string): Promise<any> => {
    const formData = new FormData();
    formData.append('file', file);

    // Initialize tracking for this file
    const now = Date.now();
    speedTrackingRef.current.fileStartTimes[index] = now;
    speedTrackingRef.current.filePreviousLoaded[index] = 0;
    speedTrackingRef.current.filePreviousTime[index] = now;

    setUploadState((prev: UploadState) => ({
      ...prev,
      fileProgresses: { ...prev.fileProgresses, [index]: 0 },
      fileStates: { ...prev.fileStates, [index]: 'uploading' as FileState }
    }));

    toast.loading(`Uploading file ${index + 1} of ${totalFiles}`, {
      description: file.name,
      id: toastId,
      position: "top-right",
    });

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          const currentTime = Date.now();

          // Update file progress
          setUploadState((prev: UploadState) => ({
            ...prev,
            fileProgresses: { ...prev.fileProgresses, [index]: percentComplete }
          }));

          // Calculate individual file speed using delta time
          const previousTime = speedTrackingRef.current.filePreviousTime[index];
          const previousLoaded = speedTrackingRef.current.filePreviousLoaded[index];

          if (previousTime !== undefined && previousLoaded !== undefined) {
            const timeDelta = (currentTime - previousTime) / 1000;
            const bytesDelta = event.loaded - previousLoaded;

            // Only update speed if we have significant time delta (avoid division by near-zero)
            if (timeDelta >= 0.5 && bytesDelta > 0) {
              const currentFileSpeed = bytesDelta / timeDelta;

              // Update tracking for this file
              speedTrackingRef.current.filePreviousLoaded[index] = event.loaded;
              speedTrackingRef.current.filePreviousTime[index] = currentTime;

              // Calculate global speed using total bytes uploaded across all files
              const globalTimeDelta = (currentTime - speedTrackingRef.current.globalPreviousTime) / 1000;

              if (globalTimeDelta >= 0.1) {
                setUploadState((prev: UploadState) => {
                  const newTotalBytesUploaded = prev.totalBytesUploaded + bytesDelta;
                  const totalElapsed = (currentTime - speedTrackingRef.current.globalStartTime) / 1000;

                  // Calculate average speed over entire upload duration for stability
                  const averageGlobalSpeed = totalElapsed > 0 ? newTotalBytesUploaded / totalElapsed : 0;

                  // For current file being actively uploaded, use more responsive calculation
                  const updatedTransferSpeed = index === prev.activeFileIndex ?
                    (prev.transferSpeed === 0 ? currentFileSpeed : (prev.transferSpeed * 0.7 + currentFileSpeed * 0.3)) :
                    prev.transferSpeed;

                  return {
                    ...prev,
                    uploadProgress: percentComplete,
                    transferSpeed: updatedTransferSpeed,
                    totalBytesUploaded: newTotalBytesUploaded,
                    totalSpeed: averageGlobalSpeed,
                  };
                });

                // Update global tracking
                speedTrackingRef.current.globalPreviousTime = currentTime;
              }
            }
          }

          // Show progress toasts at key milestones
          if (percentComplete % 25 === 0 || percentComplete === 100) {
            toast.loading(`${percentComplete}% Complete`, {
              description: file.name,
              id: toastId,
              position: "top-right",
            });
          }

          if (percentComplete === 100) {
            setUploadState((prev: UploadState) => ({
              ...prev,
              fileStates: { ...prev.fileStates, [index]: 'processing' as FileState }
            }));

            toast.loading(`Processing`, {
              description: file.name,
              id: toastId,
              position: "top-right",
            });
          }
        }
      });

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);

            setUploadState((prev: UploadState) => ({
              ...prev,
              fileStates: { ...prev.fileStates, [index]: 'completed' as FileState }
            }));

            toast.success(`Upload Complete`, {
              description: file.name,
              id: toastId,
              icon: <CheckCircle className="h-4 w-4" />,
              position: "top-right",
            });

            fetchFiles();
            resolve(response);
          } catch (error) {
            setUploadState((prev: UploadState) => ({
              ...prev,
              fileStates: { ...prev.fileStates, [index]: 'failed' as FileState }
            }));
            reject(new Error('Invalid response format'));
          }
        } else {
          try {
            const errorData = JSON.parse(xhr.responseText);
            const error = new Error(errorData.error || 'Upload failed');

            setUploadState((prev: UploadState) => ({
              ...prev,
              fileStates: { ...prev.fileStates, [index]: 'failed' as FileState }
            }));

            toast.error(`Upload Failed`, {
              description: file.name,
              id: toastId,
              icon: <AlertCircle className="h-4 w-4" />,
              position: "top-right",
            });

            reject(error);
          } catch (error) {
            setUploadState((prev: UploadState) => ({
              ...prev,
              fileStates: { ...prev.fileStates, [index]: 'failed' as FileState }
            }));
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        }
      };

      xhr.onerror = () => {
        setUploadState((prev: UploadState) => ({
          ...prev,
          fileStates: { ...prev.fileStates, [index]: 'failed' as FileState }
        }));

        toast.error(`Connection Error`, {
          description: file.name,
          id: toastId,
          icon: <AlertCircle className="h-4 w-4" />,
          position: "top-right",
        });

        reject(new Error('Network error occurred'));
      };

      xhr.open('POST', '/api/minio/upload');
      xhr.send(formData);
    });
  };

  return (
    <div
      className="min-h-screen text-foreground"
      style={{
        backgroundColor: "oklch(0.141 0.005 285.823)",
        color: "oklch(0.985 0 0)",
      }}
    >
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Link href="/">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Home
              </Button>
            </Link>
          </div>
          <h1 className="text-4xl font-bold mb-2" style={{ color: "oklch(0.985 0 0)" }}>
            Test
          </h1>
          <p className="text-muted-foreground">Test file storage and management</p>
        </div>

        <div className="space-y-6">
          {/* Upload Section */}
          <div
            className="border border-border rounded-lg"
            style={{
              backgroundColor: "oklch(0.21 0.006 285.885)",
              borderColor: "oklch(1 0 0 / 10%)",
            }}
          >
            <div className="p-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2" style={{ color: "oklch(0.985 0 0)" }}>
                <Upload className="h-5 w-5" />
                File Upload
              </h2>
            </div>
            <div className="px-6 pb-6 space-y-6">
              {/* File Selector with Drag & Drop */}
              <FileSelector
                isDragOver={isDragOver}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onFileSelect={handleFileSelect}
              />

              {/* Selected Files Preview */}
              {selectedFiles && selectedFiles.length > 0 && (
                <FilePreview
                  selectedFiles={selectedFiles}
                  fileStates={uploadState.fileStates}
                  onRemoveFile={removeSelectedFile}
                  onUpload={handleUpload}
                  isUploading={uploadState.isUploading}
                />
              )}

              {/* Current Upload */}
              {uploadState.isUploading && selectedFiles && (
                <UploadProgress
                  selectedFiles={selectedFiles}
                  uploadState={uploadState}
                  onNavigateToFile={handleNavigateToFile}
                />
              )}
            </div>
          </div>

          {/* Files Table */}
          <div
            className="border border-border rounded-lg"
            style={{
              backgroundColor: "oklch(0.21 0.006 285.885)",
              borderColor: "oklch(1 0 0 / 10%)",
            }}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold" style={{ color: "oklch(0.985 0 0)" }}>Uploaded Files</h2>
                <SearchBar
                  files={files}
                  onFileSelect={handleFileSelectSearch}
                />
              </div>
            </div>
            <div className="px-6 pb-6">
              <FilesTable
                files={files}
                isDeleting={isDeleting}
                onDeleteFile={handleDeleteFile}
                onDeleteAllFiles={handleDeleteAllFiles}
                isDeletingAll={isDeletingAll}
                highlightedFile={highlightedFile}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

// Enable proper component display name for debugging
MinioTestPage.displayName = 'MinioTestPage';

// Add a named export for better HMR support
export { MinioTestPage };

// Default export for compatibility
export default MinioTestPage;