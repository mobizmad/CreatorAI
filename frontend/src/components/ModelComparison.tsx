'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, Loader2, SplitSquareHorizontal } from 'lucide-react';
import { chatAPI } from '@/lib/api';

interface ModelComparisonProps {
  agentId: string;
  customModelName: string;
}

interface Interaction {
  id: string;
  query: string;
  baseResponse: string;
  customResponse: string;
  isBaseLoading: boolean;
  isCustomLoading: boolean;
}

export default function ModelComparison({ agentId, customModelName }: ModelComparisonProps) {
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const baseModel = 'gpt-4o-mini-2024-07-18'; // The standard OpenAI model

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [interactions]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isSending) return;

    const userQuery = input.trim();
    setInput('');
    setIsSending(true);

    const interactionId = Date.now().toString();
    
    // Create placeholders for the responses
    setInteractions((prev) => [
      ...prev,
      {
        id: interactionId,
        query: userQuery,
        baseResponse: '',
        customResponse: '',
        isBaseLoading: true,
        isCustomLoading: true,
      },
    ]);

    // Fire BOTH requests simultaneously using the updated chatAPI
    try {
      const [baseResult, customResult] = await Promise.allSettled([
        chatAPI.send(agentId, userQuery, undefined, baseModel), // Force Base Model
        chatAPI.send(agentId, userQuery, undefined, undefined)  // Use Custom Model
      ]);

      setInteractions((prev) =>
        prev.map((interaction) => {
          if (interaction.id === interactionId) {
            return {
              ...interaction,
              baseResponse: baseResult.status === 'fulfilled' ? baseResult.value.response : 'Error loading response.',
              customResponse: customResult.status === 'fulfilled' ? customResult.value.response : 'Error loading response.',
              isBaseLoading: false,
              isCustomLoading: false,
            };
          }
          return interaction;
        })
      );
    } catch (error) {
      console.error('Comparison error:', error);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow border border-gray-200">
      {/* Header */}
      <div className="flex bg-gray-50 border-b border-gray-200 rounded-t-lg">
        <div className="flex-1 p-4 border-r border-gray-200 flex items-center gap-2">
          <SplitSquareHorizontal className="w-5 h-5 text-gray-500" />
          <h3 className="font-semibold text-gray-700">Factory Default</h3>
          <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded">{baseModel}</span>
        </div>
        <div className="flex-1 p-4 flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary-500" />
          <h3 className="font-semibold text-gray-900">Your Fine-Tuned Agent</h3>
          <span className="text-xs bg-primary-100 text-primary-800 px-2 py-1 rounded truncate max-w-[200px]" title={customModelName}>
            {customModelName}
          </span>
        </div>
      </div>

      {/* Chat Area */}
      
      <div className="flex-1 overflow-y-auto p-4 space-y-8">
        {interactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <SplitSquareHorizontal className="w-12 h-12 mb-4 text-gray-300" />
            <p>Send a message to compare both models side-by-side.</p>
          </div>
        ) : (
          interactions.map((interaction) => (
            <div key={interaction.id} className="space-y-4">
              {/* User Prompt */}
              <div className="flex justify-center">
                <div className="bg-gray-100 px-4 py-2 rounded-2xl max-w-2xl text-center text-gray-800 shadow-sm border border-gray-200">
                  <span className="font-semibold text-sm text-gray-500 block mb-1">You asked:</span>
                  {interaction.query}
                </div>
              </div>

              {/* Split Responses */}
              <div className="flex gap-4">
                {/* Base Model Response */}
                <div className="flex-1 bg-gray-50 p-4 rounded-xl border border-gray-200">
                  {interaction.isBaseLoading ? (
                    <div className="flex items-center gap-2 text-gray-500">
                      <Loader2 className="w-4 h-4 animate-spin" /> Thinking...
                    </div>
                  ) : (
                    <p className="text-gray-700 whitespace-pre-wrap">{interaction.baseResponse}</p>
                  )}
                </div>

                {/* Custom Model Response */}
                <div className="flex-1 bg-blue-50 p-4 rounded-xl border border-blue-100">
                  {interaction.isCustomLoading ? (
                    <div className="flex items-center gap-2 text-primary-500">
                      <Loader2 className="w-4 h-4 animate-spin" /> Generating custom response...
                    </div>
                  ) : (
                    <p className="text-gray-800 whitespace-pre-wrap">{interaction.customResponse}</p>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-gray-200 rounded-b-lg">
        <form onSubmit={handleSend} className="relative max-w-4xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message to test both models..."
            className="w-full pl-4 pr-12 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-gray-50"
            disabled={isSending}
          />
          <button
            type="submit"
            disabled={isSending || !input.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 transition-colors"
          >
            {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </div>
  );
}