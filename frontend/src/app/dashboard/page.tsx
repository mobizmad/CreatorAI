'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Loader2, LogOut, Bot, Store } from 'lucide-react';
import AgentCard from '@/components/AgentCard';
import { agentAPI } from '@/lib/api';
import type { Agent } from '@/lib/types';

export default function Dashboard() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAgents();
    const interval = setInterval(() => { loadAgents(); }, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadAgents = async () => {
    try {
      const data = await agentAPI.list();
      setAgents(data);
    } catch (err) {
      console.error('Failed to load agents:', err);
      if ((err as any).response?.status === 401) router.push('/');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAgent = async (agentId: string) => {
    try {
      await agentAPI.delete(agentId);
      setAgents(agents.filter((a) => a.id !== agentId));
    } catch (err) {
      alert('Failed to delete agent');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 w-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-500 rounded-lg flex items-center justify-center">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">AgentBuilder</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/marketplace')}
              className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-primary-600 hover:bg-primary-50 border border-gray-200 hover:border-primary-200 rounded-lg transition-colors font-medium text-sm"
            >
              <Store className="w-4 h-4" />
              Marketplace
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
            >
              <LogOut className="w-5 h-5" />
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">My Agents</h2>
            <p className="text-gray-600 mt-2">Create and manage your custom AI agents</p>
          </div>
          <button
            onClick={() => router.push('/templates')}
            className="flex items-center gap-2 px-6 py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600 shadow-lg"
          >
            <Plus className="w-5 h-5" />
            Create Agent
          </button>
        </div>

        {agents.length > 0 && (
          <div
            onClick={() => router.push('/marketplace')}
            className="mb-6 p-4 bg-gradient-to-r from-primary-50 to-blue-50 border border-primary-100 rounded-xl flex items-center justify-between cursor-pointer hover:from-primary-100 hover:to-blue-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-primary-500 rounded-lg flex items-center justify-center">
                <Store className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">Agent Marketplace</p>
                <p className="text-xs text-gray-500">Discover agents from the community — or publish yours to share with the world</p>
              </div>
            </div>
            <span className="text-primary-600 text-sm font-medium flex-shrink-0">Explore →</span>
          </div>
        )}

        {agents.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Bot className="w-12 h-12 text-gray-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No agents yet</h3>
            <p className="text-gray-600 mb-6">Create your first agent to get started</p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => router.push('/templates')}
                className="inline-flex items-center gap-2 px-6 py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
              >
                <Plus className="w-5 h-5" />
                Create Your First Agent
              </button>
              <button
                onClick={() => router.push('/marketplace')}
                className="inline-flex items-center gap-2 px-6 py-3 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50"
              >
                <Store className="w-5 h-5" />
                Browse Marketplace
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} onDelete={handleDeleteAgent} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
