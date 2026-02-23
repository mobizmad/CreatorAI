'use client';

import { useState, useRef } from 'react';
import { Upload, File, X, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { knowledgeAPI } from '@/lib/api';

interface FileUploaderProps {
  agentId: string;
  onUploadSuccess?: () => void;
}

interface FileWithStatus {
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  chunkCount?: number;
}

export default function FileUploader({
  agentId,
  onUploadSuccess,
}: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<FileWithStatus[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    handleFilesSelect(files);
  };

  const handleFilesSelect = (files: File[]) => {
    const validFiles: FileWithStatus[] = [];

    for (const file of files) {
      // Validate file type
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (!['pdf', 'txt', 'csv'].includes(extension || '')) {
        continue; // Skip invalid files
      }

      // Validate file size (10MB)
      if (file.size > 10 * 1024 * 1024) {
        continue; // Skip too large files
      }

      validFiles.push({
        file,
        status: 'pending',
      });
    }

    if (bulkMode) {
      setSelectedFiles((prev) => [...prev, ...validFiles]);
    } else {
      setSelectedFiles(validFiles.slice(0, 1)); // Single file mode
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleBulkUpload = async () => {
    if (selectedFiles.length === 0) return;

    setIsUploading(true);

    try {
      const formData = new FormData();
      selectedFiles.forEach((fileWithStatus) => {
        formData.append('files', fileWithStatus.file);
      });

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/agents/${agentId}/knowledge/bulk`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error('Bulk upload failed');
      }

      const result = await response.json();

      // Update file statuses based on response
      setSelectedFiles((prev) =>
        prev.map((fileWithStatus, index) => {
          const fileResult = result.files[index];
          return {
            ...fileWithStatus,
            status: fileResult.success ? 'success' : 'error',
            error: fileResult.error,
            chunkCount: fileResult.chunk_count,
          };
        })
      );

      // Call success callback
      if (onUploadSuccess) {
        onUploadSuccess();
      }

      // Auto-clear successful files after 3 seconds
      setTimeout(() => {
        setSelectedFiles((prev) => prev.filter((f) => f.status === 'error'));
      }, 3000);
    } catch (err: any) {
      console.error('Bulk upload error:', err);
      setSelectedFiles((prev) =>
        prev.map((f) => ({
          ...f,
          status: 'error',
          error: 'Upload failed',
        }))
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleSingleUpload = async () => {
    if (selectedFiles.length === 0) return;

    const fileWithStatus = selectedFiles[0];
    setIsUploading(true);

    try {
      await knowledgeAPI.upload(agentId, fileWithStatus.file);

      setSelectedFiles([
        {
          ...fileWithStatus,
          status: 'success',
        },
      ]);

      if (onUploadSuccess) {
        onUploadSuccess();
      }

      // Clear after 3 seconds
      setTimeout(() => {
        setSelectedFiles([]);
      }, 3000);
    } catch (err: any) {
      setSelectedFiles([
        {
          ...fileWithStatus,
          status: 'error',
          error: err.response?.data?.detail || 'Failed to upload file',
        },
      ]);
    } finally {
      setIsUploading(false);
    }
  };

  const allFilesProcessed = selectedFiles.every(
    (f) => f.status === 'success' || f.status === 'error'
  );

  return (
    <div className="space-y-4">
      {/* Mode Toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            setBulkMode(false);
            setSelectedFiles([]);
          }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            !bulkMode
              ? 'bg-primary-500 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Single File
        </button>
        <button
          onClick={() => {
            setBulkMode(true);
            setSelectedFiles([]);
          }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            bulkMode
              ? 'bg-primary-500 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Bulk Upload (up to 20)
        </button>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragging
            ? 'border-primary-500 bg-primary-50'
            : 'border-gray-300 hover:border-primary-400'
        }`}
      >
        <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
        <p className="text-lg font-medium text-gray-700 mb-2">
          {bulkMode
            ? 'Drop multiple files here or click to browse'
            : 'Drop your file here or click to browse'}
        </p>
        <p className="text-sm text-gray-500">
          Supported formats: PDF, TXT, CSV (Max 10MB each)
        </p>
        {bulkMode && (
          <p className="text-xs text-primary-600 mt-2">
            📦 Bulk mode: Upload up to 20 files at once
          </p>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.csv"
        multiple={bulkMode}
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          handleFilesSelect(files);
        }}
        className="hidden"
      />

      {/* Selected files list */}
      {selectedFiles.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">
              {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected
            </p>
            {bulkMode && !isUploading && (
              <button
                onClick={() => setSelectedFiles([])}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="max-h-64 overflow-y-auto space-y-2">
            {selectedFiles.map((fileWithStatus, index) => (
              <div
                key={index}
                className={`bg-gray-50 rounded-lg p-3 flex items-center justify-between ${
                  fileWithStatus.status === 'success'
                    ? 'border border-green-200'
                    : fileWithStatus.status === 'error'
                    ? 'border border-red-200'
                    : ''
                }`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <File className="w-6 h-6 text-primary-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">
                      {fileWithStatus.file.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {(fileWithStatus.file.size / 1024).toFixed(1)} KB
                      {fileWithStatus.chunkCount && ` • ${fileWithStatus.chunkCount} chunks`}
                    </p>
                    {fileWithStatus.error && (
                      <p className="text-xs text-red-600 mt-1">{fileWithStatus.error}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {fileWithStatus.status === 'uploading' && (
                    <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
                  )}
                  {fileWithStatus.status === 'success' && (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  )}
                  {fileWithStatus.status === 'error' && (
                    <AlertCircle className="w-5 h-5 text-red-500" />
                  )}
                  {fileWithStatus.status === 'pending' && !isUploading && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(index);
                      }}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload button */}
      {selectedFiles.length > 0 && !allFilesProcessed && (
        <button
          onClick={bulkMode ? handleBulkUpload : handleSingleUpload}
          disabled={isUploading}
          className="w-full px-6 py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isUploading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {bulkMode
                ? `Uploading ${selectedFiles.length} files...`
                : 'Uploading...'}
            </>
          ) : (
            <>
              <Upload className="w-5 h-5" />
              {bulkMode
                ? `Upload ${selectedFiles.length} Files`
                : 'Upload File'}
            </>
          )}
        </button>
      )}

      {/* Summary after bulk upload */}
      {bulkMode && allFilesProcessed && selectedFiles.length > 0 && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm font-medium text-blue-900 mb-2">Upload Complete</p>
          <div className="text-xs text-blue-700 space-y-1">
            <p>
              ✅ Successful: {selectedFiles.filter((f) => f.status === 'success').length}
            </p>
            <p>
              ❌ Failed: {selectedFiles.filter((f) => f.status === 'error').length}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}