'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Key, Code } from 'lucide-react';
import APIKeyManager from '@/components/APIKeyManager';
import APIDocs from '@/components/APIDocs';

export default function AgentAPIPage() {
  const router = useRouter();
  const params = useParams();
  const agentId = params.id as string;
  const [agentName, setAgentName] = useState('');
  const [activeTab, setActiveTab] = useState<'keys' | 'docs'>('keys');

  useEffect(() => {
    fetchAgent();
  }, [agentId]);

  const fetchAgent = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/agents/${agentId}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );
      const data = await response.json();
      setAgentName(data.name);
    } catch (err) {
      console.error('Failed to fetch agent:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header - same style as playground */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push(`/agents/${agentId}/playground`)}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                API Integration
              </h1>
              <p className="text-sm text-gray-600">{agentName}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="flex gap-4 border-b mb-6">
          <button
            onClick={() => setActiveTab('keys')}
            className={`flex items-center gap-2 px-4 py-2 font-medium transition-colors ${
              activeTab === 'keys'
                ? 'text-primary-600 border-b-2 border-primary-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Key className="w-4 h-4" />
            API Keys
          </button>
          <button
            onClick={() => setActiveTab('docs')}
            className={`flex items-center gap-2 px-4 py-2 font-medium transition-colors ${
              activeTab === 'docs'
                ? 'text-primary-600 border-b-2 border-primary-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Code className="w-4 h-4" />
            Documentation
          </button>
        </div>

        {activeTab === 'keys' && <APIKeyManager agentId={agentId} />}
        {activeTab === 'docs' && (
          <APIDocs agentId={agentId} agentName={agentName} />
        )}
      </div>
    </div>
  );
}