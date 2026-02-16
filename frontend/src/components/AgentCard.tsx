'use client';

import { useState } from 'react';
import { Bot, Trash2, Edit, MessageSquare } from 'lucide-react';
import type { Agent } from '@/lib/types';
import { useRouter } from 'next/navigation';

interface AgentCardProps {
  agent: Agent;
  onDelete?: (agentId: string) => void;
}

export default function AgentCard({ agent, onDelete }: AgentCardProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!confirm(`Are you sure you want to delete "${agent.name}"?`)) {
      return;
    }

    setIsDeleting(true);
    if (onDelete) {
      await onDelete(agent.id);
    }
    setIsDeleting(false);
  };

  const getLLMBadgeColor = (provider: string) => {
    switch (provider) {
      case 'openai':
        return 'bg-green-100 text-green-800';
      case 'ollama':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6 border border-gray-200">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
            <Bot className="w-6 h-6 text-primary-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {agent.name}
            </h3>
            <span
              className={`inline-block px-2 py-1 rounded text-xs font-medium ${getLLMBadgeColor(
                agent.llm_provider
              )}`}
            >
              {agent.llm_provider === 'openai' ? 'OpenAI' : 'Ollama'} •{' '}
              {agent.llm_model}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(`/agents/${agent.id}`)}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
            title="Edit agent"
          >
            <Edit className="w-5 h-5" />
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="p-2 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
            title="Delete agent"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Description */}
      {agent.description && (
        <p className="text-gray-600 text-sm mb-4 line-clamp-2">
          {agent.description}
        </p>
      )}

      {/* Metadata */}
      <div className="flex items-center justify-between text-xs text-gray-500 mb-4">
        <span>Created {new Date(agent.created_at).toLocaleDateString()}</span>
        <span>Temperature: {agent.temperature}</span>
      </div>

      {/* Chat button */}
      <button
        onClick={() => router.push(`/agents/${agent.id}/playground`)}
        className="w-full px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 flex items-center justify-center gap-2"
      >
        <MessageSquare className="w-4 h-4" />
        Open Playground
      </button>
    </div>
  );
}
