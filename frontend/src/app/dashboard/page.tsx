'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bot,
  ChevronRight,
  Loader2,
  LogOut,
  MessageSquare,
  Moon,
  Plus,
  Search,
  Star,
  Store,
  Sun,
  Wand2,
} from 'lucide-react';
import AIStudio from '@/components/AIStudio';
import MediaEditor from '@/components/MediaEditor';
import AgentCard from '@/components/AgentCard';
import DefaultChatInterface from '@/components/DefaultChatInterface';
import DashboardSidebar from '@/components/DashboardSidebar';
import { agentAPI, authAPI } from '@/lib/api';
import type { Agent, User } from '@/lib/types';

type DashboardView = 'chat' | 'agents' | 'marketplace' | 'studio' | 'media-editor';

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

const API = process.env.NEXT_PUBLIC_API_URL || 'https://aicreateback.ibechamp.com';
const MARKETPLACE_CATEGORIES = ['All', 'General', 'Support', 'Education', 'HR', 'Sales', 'Legal', 'Finance', 'Medical', 'Creative'];

export default function Dashboard() {
  const router = useRouter();
  const [activeView, setActiveView] = useState<DashboardView>('chat');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [marketplaceAgents, setMarketplaceAgents] = useState<MarketplaceAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMarketplaceLoading, setIsMarketplaceLoading] = useState(false);
  const [marketplaceSearch, setMarketplaceSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    loadAgents();
    loadCurrentUser();
    const interval = setInterval(loadAgents, 30000);
    return () => clearInterval(interval);
  }, []);

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
      <DashboardSidebar activeViewOverride={activeView} onNavigate={(view) => setActiveView(view as DashboardView)} />

      <main className="min-w-0 flex-1 bg-gray-50 dark:bg-gray-900">
        {activeView === 'chat' && <DefaultChatInterface />}
        {activeView === 'agents' && (
          <AgentsView agents={agents} onDelete={handleDeleteAgent} onCreate={() => router.push('/templates')} />
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
        {activeView === 'media-editor' && <MediaEditor />}
      </main>
    </div>
  );
}

function AgentsView({
  agents,
  onDelete,
  onCreate,
}: {
  agents: Agent[];
  onDelete: (agentId: string) => void;
  onCreate: () => void;
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
              <AgentCard key={agent.id} agent={agent} onDelete={onDelete} />
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
