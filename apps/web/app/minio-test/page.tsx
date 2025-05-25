'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface FileObject {
  name: string;
  size: number;
  lastModified: string;
  url: string;
}

// Define the component using React.memo to help with re-rendering during HMR
const MinioTestPage: React.FC = React.memo(() => {
  const [files, setFiles] = useState<FileObject[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [transferSpeed, setTransferSpeed] = useState<number>(0);
  const [lastLoaded, setLastLoaded] = useState<number>(0);
  const [lastTime, setLastTime] = useState<number>(Date.now());

  // Use useCallback for functions to maintain reference stability during HMR
  const fetchFiles = useCallback(async () => {
    try {
      const response = await fetch('/api/minio/list');
      if (!response.ok) {
        throw new Error(`Failed to fetch files: ${response.statusText}`);
      }
      const data = await response.json();
      setFiles(data.files || []);
    } catch (err: any) {
      console.error('Error fetching files:', err);
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
    setSuccessMessage(null);
    
    try {
      const response = await fetch(`/api/minio/delete?objectName=${encodeURIComponent(fileName)}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Delete failed');
      }
      
      // Show success message
      setSuccessMessage(`File "${fileName}" deleted successfully!`);
      
      // Refresh file list
      fetchFiles();
    } catch (err: any) {
      console.error('Delete error:', err);
      setError(err.message || 'Failed to delete file');
    } finally {
      setIsDeleting(null);
    }
  }, [fetchFiles]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
  }, []);

  const handleFileUpload = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    
    const formElement = e.currentTarget;
    const formData = new FormData(formElement);
    const fileInput = formElement.elements.namedItem('file') as HTMLInputElement;
    
    if (!fileInput.files || fileInput.files.length === 0) {
      setError('Please select a file to upload');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setLastLoaded(0);
    setLastTime(Date.now());
    
    try {
      // Use XMLHttpRequest instead of fetch to track upload progress
      const xhr = new XMLHttpRequest();
      
      // Set up event listeners for progress updates
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(percentComplete);

          const currentTime = Date.now();
          const timeElapsed = (currentTime - lastTime) / 1000; // in seconds
          
          // Only update speed calculation if meaningful time has elapsed (at least 500ms)
          // This prevents wild fluctuations in the speed calculation
          if (timeElapsed >= 0.5 && event.loaded > lastLoaded) {
            const bytesTransferred = event.loaded - lastLoaded;
            const speed = bytesTransferred / timeElapsed; // bytes per second
            
            // Apply heavier smoothing to prevent wild fluctuations
            setTransferSpeed(prev => {
              if (prev === 0) return speed;
              // Use 80% of previous value and 20% of new measurement for smoother updates
              return (prev * 0.8 + speed * 0.2);
            });
            
            setLastLoaded(event.loaded);
            setLastTime(currentTime);
          }
        }
      });
      
      // Create a promise to handle the async XHR request
      const uploadPromise = new Promise<any>((resolve, reject) => {
        xhr.open('POST', '/api/minio/upload');
        
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              resolve(response);
            } catch (error) {
              reject(new Error('Invalid response format'));
            }
          } else {
            try {
              const errorData = JSON.parse(xhr.responseText);
              reject(new Error(errorData.error || 'Upload failed'));
            } catch (error) {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          }
        };
        
        xhr.onerror = () => {
          reject(new Error('Network error occurred'));
        };
        
        xhr.send(formData);
      });
      
      // Wait for the upload to complete
      const result = await uploadPromise;
      
      setSuccessMessage(`File "${result.fileName}" uploaded successfully!`);
      formElement.reset();
      setSelectedFile(null);
      
      // Refresh the file list after upload
      fetchFiles();
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.message || 'Failed to upload file');
    } finally {
      setIsUploading(false);
      // Keep the final progress visible for a moment
      setTimeout(() => setUploadProgress(0), 1000);
    }
  }, [fetchFiles, lastLoaded, lastTime]);

  const formatFileSize = useCallback((bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }, []);

  const calculateRemainingTime = useCallback(() => {
    if (transferSpeed > 0 && selectedFile) {
      const remainingBytes = selectedFile.size - lastLoaded;
      const remainingSeconds = remainingBytes / transferSpeed; // in seconds
      
      // Format the remaining time in a more human-readable way
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
  }, [transferSpeed, selectedFile, lastLoaded]);

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">MinIO Test</h1>
        <p className="text-gray-600">Test MinIO</p>
        <Link href="/" className="text-blue-500 hover:underline mt-2 inline-block">
          Back to Home
        </Link>
      </div>
      
      <div className="bg-white shadow-md rounded-lg p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Upload New File</h2>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}
        
        {successMessage && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
            {successMessage}
          </div>
        )}
        
        <form onSubmit={handleFileUpload} className="space-y-4">
          <div>
            <label htmlFor="file" className="block text-sm font-medium text-gray-700 mb-2">
              Select a file to upload
            </label>
            <input
              type="file"
              id="file"
              name="file"
              className="block w-full border border-gray-300 rounded-md shadow-sm p-2"
              disabled={isUploading}
              onChange={handleFileChange}
            />
          </div>

          {selectedFile && (
            <div className="text-sm text-gray-600 mt-2 p-3 bg-gray-50 rounded-md">
              <p><strong>File Name:</strong> {selectedFile.name}</p>
              <p><strong>File Size:</strong> {formatFileSize(selectedFile.size)}</p>
            </div>
          )}
          
          {uploadProgress > 0 && (
            <div className="mt-2">
              <div className="flex justify-between mb-1">
                <span className="text-sm font-medium text-blue-700">{uploadProgress}%</span>
                <span className="text-sm font-medium text-gray-600">
                  {transferSpeed > 0 ? formatFileSize(transferSpeed) + '/s' : 'Calculating...'}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div 
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
              <div className="text-xs text-gray-500 mt-1 flex justify-between">
                <span>{formatFileSize(lastLoaded)} of {formatFileSize(selectedFile?.size || 0)}</span>
                <span>Remaining: {calculateRemainingTime()}</span>
              </div>
            </div>
          )}
          
          <button
            type="submit"
            disabled={isUploading}
            className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded 
                      focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50
                      disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUploading ? 'Uploading...' : 'Upload File'}
          </button>
        </form>
      </div>
      
      <div className="bg-white shadow-md rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Uploaded Files</h2>
        
        {files.length === 0 ? (
          <p className="text-gray-500 italic">No files uploaded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Size
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Modified
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {files.map((file) => (
                  <tr key={file.name}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {file.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatFileSize(file.size)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(file.lastModified).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <a 
                        href={file.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:text-blue-700 mr-4"
                      >
                        Download
                      </a>
                      <button
                        onClick={() => handleDeleteFile(file.name)}
                        disabled={isDeleting === file.name}
                        className="text-red-500 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isDeleting === file.name ? 'Deleting...' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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