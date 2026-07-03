'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Bot,
  Check,
  ChevronRight,
  CreditCard,
  Crown,
  Key,
  Loader2,
  LogOut,
  MessageSquare,
  Moon,
  Plus,
  Search,
  Sparkles,
  Settings,
  Star,
  Store,
  Sun,
  Wand2,
  Zap,
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

type DashboardView = 'chat' | 'agents' | 'marketplace' | 'studio' | 'channels' | 'media-editor' | 'playground' | 'premium' | 'billing';

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

function getApiError(data: any, fallback: string) {
  if (!data?.detail) return fallback;
  if (typeof data.detail === 'string') return data.detail;
  if (Array.isArray(data.detail)) {
    return data.detail.map((item: any) => item?.msg || item?.message || JSON.stringify(item)).join(', ');
  }
  return data.detail.message || fallback;
}

export default function Dashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeView, setActiveView] = useState<DashboardView>('chat');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [marketplaceAgents, setMarketplaceAgents] = useState<MarketplaceAgent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMarketplaceLoading, setIsMarketplaceLoading] = useState(false);
  const [marketplaceSearch, setMarketplaceSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [selectedChannelAgentId, setSelectedChannelAgentId] = useState('');
  const [selectedPlaygroundAgentId, setSelectedPlaygroundAgentId] = useState('');

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.push('/');
      setIsLoading(false);
      return;
    }
    loadAgents();
    loadCurrentUser();
    const interval = setInterval(loadAgents, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const view = searchParams.get('view') as DashboardView | null;
    if (view && ['chat', 'agents', 'marketplace', 'studio', 'channels', 'media-editor', 'playground', 'premium', 'billing'].includes(view)) {
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
      if ((err as any).response?.status === 401) {
        localStorage.removeItem('token');
        router.push('/');
      }
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
      if ((err as any).response?.status === 401) {
        localStorage.removeItem('token');
        router.push('/');
      }
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
        <div className={activeView === 'chat' ? 'h-full' : 'hidden'}>
          <DefaultChatInterface />
        </div>
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
        {activeView === 'premium' && <PremiumView currentUser={currentUser} />}
        {activeView === 'billing' && <BillingView currentUser={currentUser} />}
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

function PremiumView({ currentUser }: { currentUser: User | null }) {
  const searchParams = useSearchParams();
  const [calculatorMode, setCalculatorMode] = useState<'chat' | 'image' | 'video' | 'speech'>('chat');
  const [calculatorProvider, setCalculatorProvider] = useState<'ollama' | 'openai'>('ollama');
  const [inputChars, setInputChars] = useState(1200);
  const [outputChars, setOutputChars] = useState(1200);
  const [checkoutMessage, setCheckoutMessage] = useState('');
  const [checkoutError, setCheckoutError] = useState('');
  const [isStartingCheckout, setIsStartingCheckout] = useState<string | null>(null);

  const packages = [
    {
      name: 'Free',
      price: '$0',
      credits: 100000,
      note: 'For trying local AI chat before upgrading.',
      accent: 'border-gray-200',
      button: 'Current free plan',
      features: ['100K credits', 'Local Ollama models', '1 agent', 'Basic file upload', 'Limited channel testing'],
    },
    {
      name: 'Pro',
      price: '$12',
      credits: 1000000,
      note: 'Best first paid plan for real daily use.',
      accent: 'border-primary-500 ring-2 ring-primary-100',
      button: 'Go Premium',
      popular: true,
      features: ['1M credits', 'Local models plus GPT-4o-mini', '5 agents', 'PDF/Word/Excel reading', 'LINE/Telegram inbox', 'AI auto-reply'],
    },
    {
      name: 'Business',
      price: '$39',
      credits: 5000000,
      note: 'For teams running real customer channels.',
      accent: 'border-gray-200',
      button: 'Upgrade Business',
      features: ['5M credits', 'Local models plus GPT-4o-mini', '20 agents', 'Multiple channels', 'Shared channel inbox', 'Leads and labels'],
    },
    {
      name: 'Agency',
      price: '$79',
      credits: 15000000,
      note: 'For agencies managing multiple clients.',
      accent: 'border-gray-200',
      button: 'Contact Sales',
      features: ['15M credits', 'Multiple brands or clients', 'Team/operator access', 'Higher automation limits', 'Priority setup support'],
    },
  ];

  const usageItems = [
    { label: 'Input message', cost: 'Long prompts, old chat history, files, and search results use more credits.' },
    { label: 'Output answer', cost: 'Longer AI replies use more credits because they generate more text.' },
    { label: 'Model/provider', cost: 'Local Ollama models are cheaper. GPT-4o-mini uses more credits and should be paid-plan only.' },
    { label: 'Media generation', cost: 'Image, video, and speech use fixed credits per generation.' },
  ];

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    const checkoutSuccess = searchParams.get('checkout_success');
    if (!sessionId || checkoutSuccess !== '1') return;

    const confirmCheckout = async () => {
      setCheckoutMessage('Confirming Stripe payment...');
      setCheckoutError('');
      try {
        const response = await fetch(`${API}/billing/checkout/confirm?session_id=${encodeURIComponent(sessionId)}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
        const data = await response.json();
        if (!response.ok) throw new Error(getApiError(data, 'Could not confirm Stripe payment.'));
        setCheckoutMessage(
          data.status === 'already_confirmed'
            ? 'This Stripe payment was already confirmed.'
            : `Payment confirmed. Added ${Number(data.credits_added || 0).toLocaleString()} credits.`
        );
      } catch (err: any) {
        setCheckoutError(err.message || 'Could not confirm Stripe payment.');
        setCheckoutMessage('');
      }
    };

    confirmCheckout();
  }, [searchParams]);

  const handlePackageAction = async (plan: string) => {
    if (plan === 'Free') return;
    setIsStartingCheckout(plan);
    setCheckoutError('');
    setCheckoutMessage('');
    try {
      const origin = window.location.origin;
      const response = await fetch(`${API}/billing/checkout/session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          plan_name: plan,
          success_url: `${origin}/dashboard?view=premium&checkout_success=1&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${origin}/dashboard?view=premium&checkout_cancel=1`,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(getApiError(data, 'Could not start Stripe Checkout.'));
      window.location.href = data.url;
    } catch (err: any) {
      setCheckoutError(err.message || 'Could not start Stripe Checkout.');
    } finally {
      setIsStartingCheckout(null);
    }
  };

  const chatEstimatedTokens = Math.max(1, Math.floor((inputChars + outputChars) / 4));
  const chatEstimatedCost = calculatorProvider === 'ollama'
    ? Math.max(2, Math.floor(chatEstimatedTokens / 100))
    : Math.max(10, Math.floor(chatEstimatedTokens / 10));
  const fixedMediaCosts = { image: 500, video: 2000, speech: 200 };
  const estimatedCost = calculatorMode === 'chat' ? chatEstimatedCost : fixedMediaCosts[calculatorMode];
  const exampleChatCost = 100;

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 overflow-hidden rounded-lg bg-white shadow-sm dark:bg-gray-950">
          <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:p-8">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1 text-sm font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-200">
                <Crown className="h-4 w-4" />
                Premium packages
              </div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Upgrade credits and unlock heavier AI work</h1>
              <p className="mt-3 max-w-2xl text-gray-600 dark:text-gray-400">
                Local models use fewer credits. GPT-4o-mini, file reading, media generation, and channel automation use more.
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-900">
              <p className="text-sm text-gray-500 dark:text-gray-400">Current balance</p>
              <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
                {(currentUser?.token_balance || 0).toLocaleString()}
              </p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">credits available</p>
              <button
                onClick={() => handlePackageAction('Pro')}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-orange-400 via-pink-500 to-sky-400 px-4 py-3 text-sm font-bold text-white shadow-sm"
              >
                <Sparkles className="h-4 w-4" />
                Go Premium
              </button>
            </div>
          </div>
        </div>

        {(checkoutMessage || checkoutError || searchParams.get('checkout_cancel') === '1') && (
          <div className={`mb-6 rounded-lg border px-4 py-3 text-sm ${
            checkoutError
              ? 'border-red-200 bg-red-50 text-red-700'
              : searchParams.get('checkout_cancel') === '1'
                ? 'border-yellow-200 bg-yellow-50 text-yellow-800'
                : 'border-green-200 bg-green-50 text-green-700'
          }`}>
            {checkoutError || checkoutMessage || 'Stripe checkout was canceled.'}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-4">
          {packages.map((item) => (
            <div key={item.name} className={`relative rounded-lg border bg-white p-6 shadow-sm dark:bg-gray-950 dark:border-gray-800 ${item.accent}`}>
              {item.popular && (
                <span className="absolute right-4 top-4 rounded-full bg-primary-500 px-3 py-1 text-xs font-semibold text-white">
                  Popular
                </span>
              )}
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{item.name}</h2>
              <div className="mt-4 flex items-end gap-2">
                <span className="text-4xl font-bold text-gray-900 dark:text-white">{item.price}</span>
                <span className="pb-1 text-sm text-gray-500">/ package</span>
              </div>
              <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-700 dark:bg-gray-900 dark:text-gray-200">
                {item.credits.toLocaleString()} credits
              </p>
              <p className="mt-3 min-h-[48px] text-sm leading-6 text-gray-600 dark:text-gray-400">{item.note}</p>
              <button
                onClick={() => handlePackageAction(item.name)}
                disabled={item.name === 'Free' || isStartingCheckout === item.name}
                className={`mt-5 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60 ${item.popular ? 'bg-primary-500 text-white hover:bg-primary-600' : 'bg-gray-100 text-gray-900 hover:bg-gray-200 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700'}`}
              >
                {isStartingCheckout === item.name && <Loader2 className="h-4 w-4 animate-spin" />}
                {isStartingCheckout === item.name ? 'Opening Stripe...' : item.button}
              </button>
              <div className="mt-5 space-y-3 border-t border-gray-100 pt-5 dark:border-gray-800">
                {item.features.map((feature) => (
                  <div key={feature} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-lg bg-white p-6 shadow-sm dark:bg-gray-950">
            <div className="mb-4 flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary-500" />
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Credit calculator</h2>
            </div>
            <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
              <div className="space-y-4">
                <label>
                  <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Process</span>
                  <select
                    value={calculatorMode}
                    onChange={(event) => setCalculatorMode(event.target.value as typeof calculatorMode)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                  >
                    <option value="chat">Chat / agent reply</option>
                    <option value="image">AI image generation</option>
                    <option value="video">AI video generation</option>
                    <option value="speech">Text to speech</option>
                  </select>
                </label>
                {calculatorMode === 'chat' && (
                  <>
                    <label>
                      <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Model type</span>
                      <select
                        value={calculatorProvider}
                        onChange={(event) => setCalculatorProvider(event.target.value as typeof calculatorProvider)}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                      >
                        <option value="ollama">Local Ollama model: gemma, llama, qwen, llava</option>
                        <option value="openai">Paid model: GPT-4o-mini</option>
                      </select>
                    </label>
                    <label>
                      <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Input characters</span>
                      <input
                        type="number"
                        min="0"
                        value={inputChars}
                        onChange={(event) => setInputChars(Number(event.target.value) || 0)}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                      />
                    </label>
                    <label>
                      <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Output characters</span>
                      <input
                        type="number"
                        min="0"
                        value={outputChars}
                        onChange={(event) => setOutputChars(Number(event.target.value) || 0)}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                      />
                    </label>
                  </>
                )}
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-900">
                <p className="text-sm text-gray-500 dark:text-gray-400">Estimated package cost</p>
                <p className="mt-2 text-4xl font-bold text-gray-900 dark:text-white">{estimatedCost.toLocaleString()}</p>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">credits per request</p>
                {calculatorMode === 'chat' ? (
                  <div className="mt-4 rounded-lg bg-white p-3 text-sm text-gray-600 dark:bg-gray-950 dark:text-gray-300">
                    Estimated text tokens: <span className="font-semibold">{chatEstimatedTokens.toLocaleString()}</span>
                  </div>
                ) : (
                  <div className="mt-4 rounded-lg bg-white p-3 text-sm text-gray-600 dark:bg-gray-950 dark:text-gray-300">
                    Fixed media cost in current backend: <span className="font-semibold">{estimatedCost.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="rounded-lg bg-white p-6 shadow-sm dark:bg-gray-950">
            <div className="mb-4 flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary-500" />
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Payment status</h2>
            </div>
            <p className="text-sm leading-6 text-gray-600 dark:text-gray-400">
              This page is ready for packages. The buttons can connect to Stripe, manual payment, or your own payment API next.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="rounded-lg bg-white p-6 shadow-sm dark:bg-gray-950">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">What uses credits?</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {usageItems.map((item) => (
                <div key={item.label} className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                  <p className="font-semibold text-gray-900 dark:text-white">{item.label}</p>
                  <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">{item.cost}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg bg-white p-6 shadow-sm dark:bg-gray-950">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Package estimate</h2>
            <div className="mt-4 space-y-3">
              {packages.map((item) => {
                const total = item.credits;
                return (
                  <div key={item.name} className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-gray-900 dark:text-white">{item.name}</p>
                      <p className="text-sm font-medium text-primary-600 dark:text-primary-300">{item.credits.toLocaleString()} credits</p>
                    </div>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                      About {Math.floor(total / exampleChatCost).toLocaleString()} paid-model chats, {Math.floor(total / fixedMediaCosts.image).toLocaleString()} images, or {Math.floor(total / fixedMediaCosts.video).toLocaleString()} videos.
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface BillingSummary {
  plan_name: string;
  subscription_status: string;
  credit_balance: number;
  monthly_credit_limit: number;
  plan_expires_at?: string | null;
  limits: {
    credits: number;
    agents: number;
    channel_replies: number;
    paid_models: boolean;
  };
  used_last_30_days: number;
}

interface CreditUsageItem {
  id: string;
  amount: number;
  action: string;
  provider?: string | null;
  model?: string | null;
  note?: string | null;
  created_at: string;
}

function BillingView({ currentUser }: { currentUser: User | null }) {
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [usage, setUsage] = useState<CreditUsageItem[]>([]);
  const [isLoadingBilling, setIsLoadingBilling] = useState(true);

  useEffect(() => {
    const loadBilling = async () => {
      setIsLoadingBilling(true);
      try {
        const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
        const [summaryResponse, usageResponse] = await Promise.all([
          fetch(`${API}/billing/summary`, { headers }),
          fetch(`${API}/billing/usage`, { headers }),
        ]);
        if (summaryResponse.ok) setSummary(await summaryResponse.json());
        if (usageResponse.ok) setUsage(await usageResponse.json());
      } finally {
        setIsLoadingBilling(false);
      }
    };
    loadBilling();
  }, []);

  const activeSummary = summary || {
    plan_name: currentUser?.plan_name || 'free',
    subscription_status: currentUser?.subscription_status || 'free',
    credit_balance: currentUser?.token_balance || 0,
    monthly_credit_limit: currentUser?.monthly_credit_limit || 100000,
    limits: { credits: 100000, agents: 1, channel_replies: 100, paid_models: false },
    used_last_30_days: 0,
  };

  const usagePercent = Math.min(100, Math.round((activeSummary.used_last_30_days / Math.max(1, activeSummary.monthly_credit_limit)) * 100));

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Billing & Usage</h1>
            <p className="mt-1 text-gray-600 dark:text-gray-400">Track credits, plan limits, and recent AI usage.</p>
          </div>
          <button
            onClick={() => window.location.assign('/dashboard?view=premium')}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-orange-400 via-pink-500 to-sky-400 px-4 py-2.5 text-sm font-bold text-white"
          >
            <Sparkles className="h-4 w-4" />
            Go Premium
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-4">
          <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-gray-950">
            <p className="text-sm text-gray-500 dark:text-gray-400">Current plan</p>
            <p className="mt-2 text-2xl font-bold capitalize text-gray-900 dark:text-white">{activeSummary.plan_name}</p>
            <p className="mt-1 text-sm capitalize text-gray-500">{activeSummary.subscription_status}</p>
          </div>
          <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-gray-950">
            <p className="text-sm text-gray-500 dark:text-gray-400">Credits left</p>
            <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{activeSummary.credit_balance.toLocaleString()}</p>
            <p className="mt-1 text-sm text-gray-500">available now</p>
          </div>
          <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-gray-950">
            <p className="text-sm text-gray-500 dark:text-gray-400">Used this period</p>
            <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{activeSummary.used_last_30_days.toLocaleString()}</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
              <div className="h-full rounded-full bg-primary-500" style={{ width: `${usagePercent}%` }} />
            </div>
          </div>
          <div className="rounded-lg bg-white p-5 shadow-sm dark:bg-gray-950">
            <p className="text-sm text-gray-500 dark:text-gray-400">Paid models</p>
            <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{activeSummary.limits.paid_models ? 'Unlocked' : 'Locked'}</p>
            <p className="mt-1 text-sm text-gray-500">GPT-4o-mini</p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="rounded-lg bg-white p-6 shadow-sm dark:bg-gray-950">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Plan limits</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between border-b border-gray-100 pb-3 dark:border-gray-800">
                <span className="text-gray-500">Agents</span>
                <span className="font-semibold text-gray-900 dark:text-white">{activeSummary.limits.agents}</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-3 dark:border-gray-800">
                <span className="text-gray-500">Channel replies/month</span>
                <span className="font-semibold text-gray-900 dark:text-white">{activeSummary.limits.channel_replies.toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-3 dark:border-gray-800">
                <span className="text-gray-500">Monthly credits</span>
                <span className="font-semibold text-gray-900 dark:text-white">{activeSummary.monthly_credit_limit.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">GPT-4o-mini</span>
                <span className="font-semibold text-gray-900 dark:text-white">{activeSummary.limits.paid_models ? 'Yes' : 'Upgrade required'}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-white p-6 shadow-sm dark:bg-gray-950">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Credit history</h2>
              {isLoadingBilling && <Loader2 className="h-4 w-4 animate-spin text-primary-500" />}
            </div>
            {usage.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 py-12 text-center text-sm text-gray-500 dark:border-gray-800">
                No credit usage recorded yet. New chat and media usage will appear here.
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-900">
                    <tr>
                      <th className="px-4 py-3">Action</th>
                      <th className="px-4 py-3">Model</th>
                      <th className="px-4 py-3 text-right">Credits</th>
                      <th className="px-4 py-3">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {usage.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{item.action}</td>
                        <td className="px-4 py-3 text-gray-500">{[item.provider, item.model].filter(Boolean).join(' / ') || '-'}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">{item.amount.toLocaleString()}</td>
                        <td className="px-4 py-3 text-gray-500">{new Date(item.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
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
