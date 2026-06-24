'use client';

import { useState } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import { correctionAPI } from '@/lib/api';

interface CorrectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentId: string;
  userQuery: string;
  incorrectResponse: string;
  onSuccess?: () => void;
}

export default function CorrectionModal({
  isOpen,
  onClose,
  agentId,
  userQuery,
  incorrectResponse,
  onSuccess,
}: CorrectionModalProps) {
  const [correctedResponse, setCorrectedResponse] = useState('');
  const [context, setContext] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!correctedResponse.trim()) {
      setError('Please provide a corrected response');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await correctionAPI.create(agentId, {
        user_query: userQuery,
        incorrect_response: incorrectResponse,
        corrected_response: correctedResponse,
        context: context || undefined,
      });

      setCorrectedResponse('');
      setContext('');
      onClose();

      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save correction');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-900">
            Correct Agent Response
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* User Query */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              User Query
            </label>
            <div className="p-4 bg-gray-50 rounded-lg text-gray-900">
              {userQuery}
            </div>
          </div>

          {/* Incorrect Response */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Incorrect Response
            </label>
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-gray-900">
              {incorrectResponse}
            </div>
          </div>

          {/* Corrected Response */}
          <div>
            <label
              htmlFor="corrected-response"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Corrected Response *
            </label>
            <textarea
              id="corrected-response"
              value={correctedResponse}
              onChange={(e) => setCorrectedResponse(e.target.value)}
              rows={6}
              placeholder="Enter the correct response..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Context (Optional) */}
          <div>
            <label
              htmlFor="context"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Context (Optional)
            </label>
            <textarea
              id="context"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={3}
              placeholder="Add any additional context or notes..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Error message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Info */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>How corrections work:</strong> This correction will be
              stored as a "golden example" and automatically injected into future
              prompts to help your agent avoid making the same mistake again.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !correctedResponse.trim()}
            className="px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Save Correction
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
