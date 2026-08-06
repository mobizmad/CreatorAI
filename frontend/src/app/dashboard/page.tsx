'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Bot,
  ChevronRight,
  Key,
  Loader2,
  LogOut,
  MessageSquare,
  Moon,
  Plus,
  Search,
  Settings,
  Star,
  Store,
  Sun,
  Wand2,
} from 'lucide-react';
import AIStudio from '@/components/AIStudio';
import MediaEditor from '@/components/MediaEditor';
import AgentCard from '@/components/AgentCard';
import AgentChannels from '@/components/AgentChannels';
import ChatInterface from '@/components/ChatInterface';
import DefaultChatInterface from '@/components/DefaultChatInterface';
import DashboardSidebar from '@/components/DashboardSidebar';
import { agentAPI, authAPI } from '@/lib/api';
import type { Agent, User } from '@/lib/types';

type DashboardView = 'chat' | 'agents' | 'marketplace' | 'studio' | 'channels' | 'media-editor' | 'playground';

interface MarketplaceAgent {
  id: string;
  name: string;
  description: string;
  llm_provider: string;
  llm_model: string;
  category: string;
  average_rating: number;
  review_count: number;
  owner_email: string;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';
const MARKETPLACE_CATEGORIES = ['All', 'General', 'Support', 'Education', 'HR', 'Sales', 'Legal', 'Finance', 'Medical', 'Creative'];

export default function Dashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeView, setActiveView] = useState<DashboardView>('chat');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [marketplaceAgents, setMarketplaceAgents] = useState<MarketplaceAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMarketplaceLoading, setIsMarketplaceLoading] = useState(false);
  const [marketplaceSearch, setMarketplaceSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [selectedChannelAgentId, setSelectedChannelAgentId] = useState('');
  const [selectedPlaygroundAgentId, setSelectedPlaygroundAgentId] = useState('');

  useEffect(() => {
    loadAgents();
    loadCurrentUser();
    const interval = setInterval(loadAgents, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const view = searchParams.get('view') as DashboardView | null;
    if (view && ['chat', 'agents', 'marketplace', 'studio', 'channels', 'media-editor', 'playground'].includes(view)) {
      setActiveView(view);
    }
  }, [searchParams]);

  useEffect(() => {
    const agentId = searchParams.get('agent');
    if (agentId) setSelectedChannelAgentId(agentId);
    if (agentId) setSelectedPlaygroundAgentId(agentId);
  }, [searchParams]);

  useEffect(() => {
    if (!selectedChannelAgentId && agents[0]) {
      setSelectedChannelAgentId(agents[0].id);
    }
    if (!selectedPlaygroundAgentId && agents[0]) {
      setSelectedPlaygroundAgentId(agents[0].id);
    }
  }, [agents, selectedChannelAgentId, selectedPlaygroundAgentId]);

  useEffect(() => {
    if (activeView !== 'marketplace') return;

    const debounce = setTimeout(loadMarketplace, 300);
    return () => clearTimeout(debounce);
  }, [activeView, marketplaceSearch, activeCategory]);

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

  const loadMarketplace = async () => {
    setIsMarketplaceLoading(true);
    try {
      const params = new URLSearchParams({ sort_by: 'newest' });
      if (marketplaceSearch) params.append('search', marketplaceSearch);
      if (activeCategory !== 'All') params.append('category', activeCategory);
      const response = await fetch(`${API}/marketplace?${params}`);
      const data = await response.json();
      setMarketplaceAgents(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load marketplace:', err);
      setMarketplaceAgents([]);
    } finally {
      setIsMarketplaceLoading(false);
    }
  };

  const loadCurrentUser = async () => {
    try {
      setCurrentUser(await authAPI.getMe());
    } catch (err) {
      console.error('Failed to load user:', err);
    }
  };

  const handleDeleteAgent = async (agentId: string) => {
    try {
      await agentAPI.delete(agentId);
      setAgents((current) => current.filter((agent) => agent.id !== agentId));
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
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="h-screen flex overflow-hidden bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <DashboardSidebar
        activeViewOverride={activeView}
        onNavigate={(view) => {
          const nextView = view as DashboardView;
          setActiveView(nextView);
          router.push(nextView === 'chat' ? '/dashboard' : `/dashboard?view=${nextView}`);
        }}
      />

      <main className="min-w-0 flex-1 bg-gray-50 dark:bg-gray-900">
        {activeView === 'chat' && <DefaultChatInterface />}
        {activeView === 'agents' && (
          <AgentsView
            agents={agents}
            onDelete={handleDeleteAgent}
            onCreate={() => router.push('/templates')}
            onOpen={(agentId) => {
              setSelectedPlaygroundAgentId(agentId);
              router.push(`/dashboard?view=playground&agent=${agentId}`);
            }}
          />
        )}
        {activeView === 'marketplace' && (
          <MarketplaceView
            agents={marketplaceAgents}
            isLoading={isMarketplaceLoading}
            search={marketplaceSearch}
            activeCategory={activeCategory}
            onSearch={setMarketplaceSearch}
            onCategory={setActiveCategory}
            onTry={(agentId) => router.push(`/widget/${agentId}`)}
          />
        )}
        {activeView === 'studio' && <AIStudio />}
        {activeView === 'channels' && (
          <ChannelsView
            agents={agents}
            selectedAgentId={selectedChannelAgentId}
            onSelectAgent={(agentId) => {
              setSelectedChannelAgentId(agentId);
              router.push(`/dashboard?view=channels&agent=${agentId}`);
            }}
            onCreate={() => router.push('/templates')}
          />
        )}
        {activeView === 'media-editor' && <MediaEditor />}
        {activeView === 'playground' && (
          <DashboardPlaygroundView
            agentId={selectedPlaygroundAgentId || agents[0]?.id || ''}
            agent={agents.find((agent) => agent.id === (selectedPlaygroundAgentId || agents[0]?.id))}
            hasAgents={agents.length > 0}
            onCreate={() => router.push('/templates')}
          />
        )}
      </main>
    </div>
  );
}

function DashboardPlaygroundView({
  agentId,
  agent,
  hasAgents,
  onCreate,
}: {
  agentId: string;
  agent?: Agent;
  hasAgents: boolean;
  onCreate: () => void;
}) {
  const router = useRouter();

  if (!hasAgents || !agentId) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-10 py-12 text-center dark:border-gray-800 dark:bg-gray-950">
          <Bot className="mx-auto h-12 w-12 text-gray-300" />
          <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">No agents yet</h2>
          <p className="mt-1 text-sm text-gray-500">Create an agent first, then open the playground.</p>
          <button
            onClick={onCreate}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-600"
          >
            <Plus className="w-4 h-4" />
            Create Agent
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-white dark:bg-gray-950">
      <header className="shrink-0 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-950 sm:px-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/dashboard?view=agents')}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            title="Back to agents"
          >
            <ChevronRight className="h-5 w-5 rotate-180" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold text-gray-900 dark:text-white">{agent?.name || 'Agent'}</h1>
            <p className="truncate text-sm text-gray-600 dark:text-gray-400">
              {[agent?.llm_provider, agent?.llm_model].filter(Boolean).join(' • ')}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => router.push(`/agents/${agentId}/playground`)}
              className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <Settings className="h-4 w-4" />
              Settings
            </button>
            <button
              onClick={() => router.push(`/agents/${agentId}/api`)}
              className="flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
            >
              <Key className="h-4 w-4" />
              API Integration
            </button>
          </div>
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <ChatInterface agentId={agentId} />
      </div>
    </div>
  );
}

function ChannelsView({
  agents,
  selectedAgentId,
  onSelectAgent,
  onCreate,
}: {
  agents: Agent[];
  selectedAgentId: string;
  onSelectAgent: (agentId: string) => void;
  onCreate: () => void;
}) {
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) || agents[0];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1800px] px-4 py-4 lg:px-6">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Channels</h1>
            <p className="mt-1 text-gray-600 dark:text-gray-400">Manage LINE, Telegram, Facebook inboxes, rules, leads, and broadcasts.</p>
          </div>
          {agents.length > 0 && (
            <label className="w-full lg:w-80">
              <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Agent</span>
              <select
                value={selectedAgent?.id || ''}
                onChange={(event) => onSelectAgent(event.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              >
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {!selectedAgent ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center dark:border-gray-800 dark:bg-gray-950">
            <Bot className="mx-auto h-12 w-12 text-gray-300" />
            <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">No agents yet</h2>
            <p className="mt-1 text-sm text-gray-500">Create an agent first, then connect LINE, Telegram, or Facebook channels.</p>
            <button
              onClick={onCreate}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-600"
            >
              <Plus className="w-4 h-4" />
              Create Agent
            </button>
          </div>
        ) : (
          <AgentChannels agentId={selectedAgent.id} />
        )}
      </div>
    </div>
  );
}

function AgentsView({
  agents,
  onDelete,
  onCreate,
  onOpen,
}: {
  agents: Agent[];
  onDelete: (agentId: string) => void;
  onCreate: () => void;
  onOpen: (agentId: string) => void;
}) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Agents</h1>
            <p className="text-gray-600 mt-1">Create and manage custom AI agents with knowledge, memory, and tools.</p>
          </div>
          <button
            onClick={onCreate}
            className="flex items-center gap-2 rounded-lg bg-primary-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-600"
          >
            <Plus className="w-4 h-4" />
            Create Agent
          </button>
        </div>

        {agents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
            <Bot className="mx-auto h-12 w-12 text-gray-300" />
            <h2 className="mt-4 text-lg font-semibold text-gray-900">No agents yet</h2>
            <p className="mt-1 text-sm text-gray-500">Create your first agent to unlock the full playground.</p>
            <button
              onClick={onCreate}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-600"
            >
              <Plus className="w-4 h-4" />
              Create Agent
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} onDelete={onDelete} onOpen={onOpen} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MarketplaceView({
  agents,
  isLoading,
  search,
  activeCategory,
  onSearch,
  onCategory,
  onTry,
}: {
  agents: MarketplaceAgent[];
  isLoading: boolean;
  search: string;
  activeCategory: string;
  onSearch: (value: string) => void;
  onCategory: (value: string) => void;
  onTry: (agentId: string) => void;
}) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Agent Marketplace</h1>
          <p className="text-gray-600 mt-1">Browse published agents from the community.</p>
        </div>

        <div className="mb-5 flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="Search agents..."
              className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        <div className="mb-8 flex flex-wrap gap-2">
          {MARKETPLACE_CATEGORIES.map((category) => (
            <button
              key={category}
              onClick={() => onCategory(category)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                activeCategory === category
                  ? 'border-primary-500 bg-primary-500 text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
          </div>
        ) : agents.length === 0 ? (
          <div className="rounded-xl bg-white py-16 text-center">
            <Store className="mx-auto h-12 w-12 text-gray-300" />
            <h2 className="mt-4 text-lg font-semibold text-gray-900">No published agents found</h2>
            <p className="mt-1 text-sm text-gray-500">Try another search or category.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {agents.map((agent) => (
              <div key={agent.id} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary-500 text-lg font-bold text-white">
                    {agent.name[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-semibold text-gray-900">{agent.name}</h2>
                    <p className="mt-1 line-clamp-2 text-sm text-gray-500">{agent.description || 'No description provided.'}</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4 text-sm">
                  <div className="flex items-center gap-1.5 text-gray-600">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    <span className="font-medium">{agent.average_rating.toFixed(1)}</span>
                    <span className="text-gray-400">({agent.review_count})</span>
                  </div>
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
                    {agent.category}
                  </span>
                </div>
                <button
                  onClick={() => onTry(agent.id)}
                  className="mt-4 w-full rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
                >
                  Try Agent
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
