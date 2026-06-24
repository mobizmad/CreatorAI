'use client';

import { useState } from 'react';
import { Upload, Loader2, FileJson, CheckCircle, AlertCircle, Brain } from 'lucide-react';

interface FineTuneUploaderProps {
  agentId: string;
  isTraining?: boolean;
}

export default function FineTuneUploader({ agentId, isTraining }: FineTuneUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({
    type: null,
    message: '',
  });

  const [newModelId, setNewModelId] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState({ type: '', text: '' });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      // Basic frontend validation to stop non-JSONL files early
      if (!selectedFile.name.endsWith('.jsonl')) {
        setStatus({ type: 'error', message: 'Please select a valid .jsonl file' });
        setFile(null);
        return;
      }
      setFile(selectedFile);
      setStatus({ type: null, message: '' });
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setStatus({ type: null, message: '' });

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'https://aicreateback.ibechamp.com'}/agents/${agentId}/finetune/upload`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to upload training data');
      }

      setStatus({ 
        type: 'success', 
        message: `Job started successfully! Job ID: ${data.job_id}` 
      });
      setFile(null); // Clear the file input on success

    } catch (err: any) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setIsUploading(false);
    }
  };

  const handleUpdateModel = async () => {
    if (!newModelId.trim()) return;
    setIsUpdating(true);
    setUpdateMessage({ type: '', text: '' });

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'https://aicreateback.ibechamp.com'}/agents/${agentId}/model`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
          body: JSON.stringify({ llm_model: newModelId.trim() }),
        }
      );

      if (!response.ok) throw new Error('Failed to update model');
      
      setUpdateMessage({ type: 'success', text: 'Agent updated! It is now using your custom model.' });
      setNewModelId('');
    } catch (err) {
      setUpdateMessage({ type: 'error', text: 'Failed to update agent model.' });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg border border-gray-200 shadow-sm w-full">
      <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-2">
        <Brain className="w-5 h-5 text-primary-500" />
        Fine-Tune Agent
      </h3>
      {/* ADD THIS BLOCK */}
      {isTraining && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          <div className="text-sm text-blue-700">
            <p className="font-bold">Model Training in Progress</p>
            <p>Your agent is currently being upgraded. This usually takes 10-20 minutes. You can keep using the current model in the meantime.</p>
          </div>
        </div>
      )}
      <p className="text-sm text-gray-600 mb-6">
        Upload a <code>.jsonl</code> file containing at least 10 conversational examples to train your agent's behavior.
      </p>

      <div className="flex flex-col gap-4">
        {/* File Input Area */}
        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
          <div className="flex flex-col items-center justify-center pt-5 pb-6">
            <FileJson className="w-8 h-8 text-gray-400 mb-2" />
            <p className="text-sm text-gray-500 font-medium px-4 text-center">
              {file ? file.name : "Click or drag to select a .jsonl file"}
            </p>
          </div>
          <input 
            type="file" 
            className="hidden" 
            accept=".jsonl" 
            onChange={handleFileChange}
          />
        </label>

        {/* Upload Button */}
        <button
          onClick={handleUpload}
          disabled={!file || isUploading}
          className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {isUploading ? 'Validating & Uploading...' : 'Start Training Job'}
        </button>

        {/* Status Messages */}
        {status.type === 'error' && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-md border border-red-200 mt-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {status.message}
          </div>
        )}
        {status.type === 'success' && (
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 p-3 rounded-md border border-green-200 mt-2 break-all">
            <CheckCircle className="w-4 h-4 shrink-0" />
            {status.message}
          </div>
        )}
      </div>

      {/* NEW: Apply Fine-Tuned Model Section */}
      <div className="mt-8 pt-6 border-t border-gray-200">
        <h4 className="text-md font-medium text-gray-900 mb-2">Apply Trained Model</h4>
        <p className="text-sm text-gray-600 mb-4">
          Once OpenAI emails you that your fine-tuning job is complete, paste your new custom model ID (starts with <code>ft:gpt-4o-mini...</code>) below to upgrade this agent.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={newModelId}
            onChange={(e) => setNewModelId(e.target.value)}
            placeholder="ft:gpt-4o-mini-2024-07-18:my-org:custom:123..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-mono"
          />
          <button
            onClick={handleUpdateModel}
            disabled={!newModelId.trim() || isUpdating}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 text-sm font-medium transition-colors"
          >
            {isUpdating ? 'Updating...' : 'Apply Model'}
          </button>
        </div>
        {updateMessage.text && (
          <p className={`mt-2 text-sm ${updateMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
            {updateMessage.text}
          </p>
        )}
      </div>

    </div>
  );
}
