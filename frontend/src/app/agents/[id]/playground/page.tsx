'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft,
  Upload,
  BookOpen,
  MessageSquare,
  Settings,
  Loader2,
  Key,
  Brain,
  SplitSquareHorizontal,
  TrendingUp,
  Wrench, // Added for Tools icon
} from 'lucide-react';
import ChatInterface from '@/components/ChatInterface';
import FileUploader from '@/components/FileUploader';
import CorrectionModal from '@/components/CorrectionModal';
import FineTuneUploader from '@/components/FineTuneUploader';
import ModelComparison from '@/components/ModelComparison';
import AgentTools from '@/components/AgentTools'; // NEW: Imported AgentTools
import { agentAPI, knowledgeAPI, correctionAPI } from '@/lib/api';
import type { Agent, KnowledgeBase, Correction } from '@/lib/types';
import AnalyticsDashboard from '@/components/AnalyticsDashboard';

export default function AgentPlayground() {
  const router = useRouter();
  const params = useParams();
  const agentId = params.id as string;

  const [agent, setAgent] = useState<Agent | null>(null);
  // UPDATED: Added 'settings' to activeTab type
  const [activeTab, setActiveTab] = useState<'chat' | 'knowledge' | 'corrections' | 'finetune' | 'compare' | 'analytics' | 'settings'>('chat'); 
  const [knowledgeFiles, setKnowledgeFiles] = useState<KnowledgeBase[]>([]);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Correction modal state
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [correctionData, setCorrectionData] = useState({
    userQuery: '',
    incorrectResponse: '',
  });

  useEffect(() => {
    loadData();
  }, [agentId]);

  const loadData = async () => {
    try {
      const [agentData, knowledgeData, correctionsData] = await Promise.all([
        agentAPI.get(agentId),
        knowledgeAPI.list(agentId),
        correctionAPI.list(agentId),
      ]);
      setAgent(agentData);
      setKnowledgeFiles(knowledgeData);
      setCorrections(correctionsData);
    } catch (err) {
      console.error('Failed to load data:', err);
      router.push('/dashboard');
    } finally {
      setIsLoading(false);
    }
  };

  // NEW: Handle Toggle for Web Search and Multi-Agent Mode
  const handleToggleSetting = async (field: 'web_search_enabled' | 'multi_agent_enabled') => {
    if (!agent) return;
    
    try {
      const newValue = !agent[field];
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/agents/${agentId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ [field]: newValue }),
      });

      if (response.ok) {
        setAgent({ ...agent, [field]: newValue });
      }
    } catch (err) {
      console.error("Failed to update agent setting:", err);
    }
  };

  const handleCorrect = (userMessage: string, agentResponse: string) => {
    setCorrectionData({
      userQuery: userMessage,
      incorrectResponse: agentResponse,
    });
    setShowCorrectionModal(true);
  };

  const handleDeleteKnowledge = async (knowledgeId: string) => {
    if (!confirm('Are you sure you want to delete this file?')) return;

    try {
      await knowledgeAPI.delete(agentId, knowledgeId);
      setKnowledgeFiles(knowledgeFiles.filter((k) => k.id !== knowledgeId));
    } catch (err) {
      alert('Failed to delete file');
    }
  };

  const handleToggleCorrection = async (correctionId: string) => {
    try {
      const updated = await correctionAPI.toggle(agentId, correctionId);
      setCorrections(
        corrections.map((c) => (c.id === correctionId ? updated : c))
      );
    } catch (err) {
      alert('Failed to toggle correction');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (!agent) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{agent.name}</h1>
              <p className="text-sm text-gray-600">
                {agent.llm_provider} • {agent.llm_model}
              </p>
            </div>
            <button
              onClick={() => router.push(`/agents/${agentId}/api`)}
              className="ml-auto flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
            >
              <Key className="w-4 h-4" />
              API Integration
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Tabs */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-4 space-y-2">
              <button
                onClick={() => setActiveTab('chat')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  activeTab === 'chat'
                    ? 'bg-primary-500 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <MessageSquare className="w-5 h-5" />
                <span className="font-medium">Chat</span>
              </button>

              <button
                onClick={() => setActiveTab('knowledge')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  activeTab === 'knowledge'
                    ? 'bg-primary-500 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <BookOpen className="w-5 h-5" />
                <span className="font-medium">Knowledge Base</span>
                <span className="ml-auto bg-gray-200 text-gray-700 text-xs px-2 py-1 rounded-full">
                  {knowledgeFiles.length}
                </span>
              </button>

              {/* NEW: Settings & Tools Sidebar Button */}
              <button
                onClick={() => setActiveTab('settings')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  activeTab === 'settings'
                    ? 'bg-primary-500 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Wrench className="w-5 h-5" />
                <span className="font-medium">Settings & Tools</span>
              </button>

              <button
                onClick={() => setActiveTab('corrections')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  activeTab === 'corrections'
                    ? 'bg-primary-500 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Settings className="w-5 h-5" />
                <span className="font-medium">Corrections</span>
                <span className="ml-auto bg-gray-200 text-gray-700 text-xs px-2 py-1 rounded-full">
                  {corrections.filter((c) => c.is_active).length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('finetune')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  activeTab === 'finetune'
                    ? 'bg-primary-500 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Brain className="w-5 h-5" />
                <span className="font-medium">Fine-Tuning</span>
              </button>

              <button
                onClick={() => setActiveTab('compare')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  activeTab === 'compare'
                    ? 'bg-primary-500 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <SplitSquareHorizontal className="w-5 h-5" />
                <span className="font-medium">A/B Testing</span>
              </button>

              <button
                onClick={() => setActiveTab('analytics')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  activeTab === 'analytics'
                    ? 'bg-primary-500 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <TrendingUp className="w-5 h-5" />
                <span className="font-medium">Analytics</span>
              </button>
            </div>
          </div>

          {/* Right Column - Content */}
          <div className="lg:col-span-2">
            {activeTab === 'chat' && (
              <div className="h-[calc(100vh-200px)]">
                <ChatInterface agentId={agentId} onCorrect={handleCorrect} />
              </div>
            )}

            {/* NEW: Settings & Tools Content Tab */}
            {activeTab === 'settings' && (
              <div className="space-y-6">
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-6">
                    Workforce Configuration
                  </h2>
                  
                  <div className="space-y-4">
                    {/* Web Search Toggle */}
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div>
                        <h3 className="font-medium text-gray-900">Web Search</h3>
                        <p className="text-sm text-gray-600">
                          Allow agent to search the internet for current information
                        </p>
                      </div>
                      <button
                        onClick={() => handleToggleSetting('web_search_enabled')}
                        className={`relative w-12 h-6 rounded-full transition-colors ${
                          agent.web_search_enabled ? 'bg-green-500' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                            agent.web_search_enabled ? 'translate-x-6' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Multi-Agent Toggle */}
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div>
                        <h3 className="font-medium text-gray-900">Multi-Agent Mode</h3>
                        <p className="text-sm text-gray-600">
                          Use multiple specialized agents working together
                        </p>
                      </div>
                      <button
                        onClick={() => handleToggleSetting('multi_agent_enabled')}
                        className={`relative w-12 h-6 rounded-full transition-colors ${
                          agent.multi_agent_enabled ? 'bg-green-500' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                            agent.multi_agent_enabled ? 'translate-x-6' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Custom API Tools List Component */}
                <AgentTools agentId={agentId} />
              </div>
            )}

            {activeTab === 'knowledge' && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-6">
                  Knowledge Base
                </h2>

                <FileUploader
                  agentId={agentId}
                  onUploadSuccess={() =>
                    knowledgeAPI.list(agentId).then(setKnowledgeFiles)
                  }
                />

                {knowledgeFiles.length > 0 && (
                  <div className="mt-8">
                    <h3 className="font-medium text-gray-900 mb-4">
                      Uploaded Files
                    </h3>
                    <div className="space-y-3">
                      {knowledgeFiles.map((file) => (
                        <div
                          key={file.id}
                          className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                        >
                          <div>
                            <p className="font-medium text-gray-900">
                              {file.filename}
                            </p>
                            <p className="text-sm text-gray-500">
                              {file.chunk_count} chunks •{' '}
                              {new Date(file.uploaded_at).toLocaleDateString()}
                            </p>
                          </div>
                          <button
                            onClick={() => handleDeleteKnowledge(file.id)}
                            className="text-red-600 hover:text-red-700 text-sm font-medium"
                          >
                            Delete
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {activeTab === 'finetune' && (
              <div className="h-full">
                <FineTuneUploader 
                  agentId={agentId} 
                  isTraining={agent.is_training} 
                />
              </div>
            )}

            {activeTab === 'compare' && (
              <div className="h-[calc(100vh-200px)]">
                <ModelComparison 
                  agentId={agentId} 
                  customModelName={agent.llm_model} 
                />
              </div>
            )}

            {activeTab === 'corrections' && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-6">
                  Corrections (Few-Shot Examples)
                </h2>

                {corrections.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <p>No corrections yet</p>
                    <p className="text-sm mt-2">
                      Click "Correct this response" in chat to add examples
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {corrections.map((correction) => (
                      <div
                        key={correction.id}
                        className={`p-4 rounded-lg border ${
                          correction.is_active
                            ? 'border-green-200 bg-green-50'
                            : 'border-gray-200 bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <span
                            className={`text-xs font-medium px-2 py-1 rounded ${
                              correction.is_active
                                ? 'bg-green-200 text-green-800'
                                : 'bg-gray-200 text-gray-600'
                            }`}
                          >
                            {correction.is_active ? 'Active' : 'Inactive'}
                          </span>
                          <button
                            onClick={() => handleToggleCorrection(correction.id)}
                            className="text-sm text-primary-600 hover:text-primary-700"
                          >
                            {correction.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>

                        <div className="space-y-2 text-sm">
                          <div>
                            <p className="font-medium text-gray-700">Query:</p>
                            <p className="text-gray-600">
                              {correction.user_query}
                            </p>
                          </div>
                          <div>
                            <p className="font-medium text-gray-700">
                              Corrected Response:
                            </p>
                            <p className="text-gray-600">
                              {correction.corrected_response}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {activeTab === 'analytics' && (
              <div className="bg-white rounded-lg shadow p-6">
                <AnalyticsDashboard agentId={agentId} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Correction Modal */}
      <CorrectionModal
        isOpen={showCorrectionModal}
        onClose={() => setShowCorrectionModal(false)}
        agentId={agentId}
        userQuery={correctionData.userQuery}
        incorrectResponse={correctionData.incorrectResponse}
        onSuccess={() => {
          correctionAPI.list(agentId).then(setCorrections);
        }}
      />
    </div>
  );
}