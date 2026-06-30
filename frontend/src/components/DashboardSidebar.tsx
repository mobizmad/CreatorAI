'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  Bot,
  ChevronRight,
  LogOut,
  MessageSquare,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Store,
  Sun,
  Wand2,
  Film,
  Radio,
  Sparkles,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { agentAPI, authAPI } from '@/lib/api';
import type { Agent, User } from '@/lib/types';

interface DashboardSidebarProps {
  activeViewOverride?: string;
  onNavigate?: (view: string) => void;
}

export default function DashboardSidebar({ activeViewOverride, onNavigate }: DashboardSidebarProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIsCollapsed(localStorage.getItem('dashboard-sidebar-collapsed') === 'true');
  }, []);

  // Determine active view based on pathname
  let activeView = 'chat';
  if (activeViewOverride) {
    activeView = activeViewOverride;
  } else {
    if (pathname.includes('/agents') || pathname.includes('/templates')) activeView = 'agents';
    else if (pathname.includes('/widget')) activeView = 'marketplace';
  }
  // Note: dashboard handles its own activeView state internally if it doesn't use URL params,
  // but for the sake of highlighting in the playground, this works.

  useEffect(() => {
    loadAgents();
    loadCurrentUser();
    const interval = setInterval(() => {
      loadAgents();
      loadCurrentUser();
    }, 30000);
    window.addEventListener('token-balance-refresh', loadCurrentUser);
    return () => {
      clearInterval(interval);
      window.removeEventListener('token-balance-refresh', loadCurrentUser);
    };
  }, []);

  const loadAgents = async () => {
    try {
      const data = await agentAPI.list();
      setAgents(data);
    } catch (err) {
      console.error('Failed to load agents in sidebar:', err);
    }
  };

  const loadCurrentUser = async () => {
    try {
      setCurrentUser(await authAPI.getMe());
    } catch (err) {
      console.error('Failed to load user in sidebar:', err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/');
  };

  const handleNavigate = (view: string) => {
    if (onNavigate) {
      onNavigate(view);
    } else {
      router.push(view === 'chat' ? '/dashboard' : `/dashboard?view=${view}`);
    }
  };

  const toggleSidebar = () => {
    setIsCollapsed((current) => {
      localStorage.setItem('dashboard-sidebar-collapsed', String(!current));
      return !current;
    });
  };

  return (
    <aside className={`${isCollapsed ? 'w-20' : 'w-72'} shrink-0 border-r border-gray-200 bg-gray-950 text-white flex flex-col h-full transition-[width] duration-200`}>
      <div className="p-4 border-b border-white/10">
        <button
          onClick={toggleSidebar}
          className={`mb-3 flex w-full items-center ${isCollapsed ? 'justify-center' : 'justify-between'} rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-white/10 hover:text-white`}
          title={isCollapsed ? 'Open sidebar' : 'Close sidebar'}
        >
          {!isCollapsed && <span className="font-medium">Menu</span>}
          {isCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>
        <button
          onClick={() => handleNavigate('chat')}
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-sm font-medium hover:bg-white/10"
          title="New Chat"
        >
          <Plus className="w-4 h-4" />
          {!isCollapsed && 'New Chat'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-5">
        <nav className="space-y-1">
          <button
            onClick={() => handleNavigate('chat')}
            title="Default Chat"
            className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2 text-sm transition-colors ${
              activeView === 'chat' && pathname === '/dashboard'
                ? 'bg-white text-gray-950'
                : 'text-gray-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            {!isCollapsed && 'Default Chat'}
          </button>
          <button
            onClick={() => handleNavigate('marketplace')}
            title="Agent Marketplace"
            className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2 text-sm transition-colors ${
              activeView === 'marketplace' && pathname === '/dashboard'
                ? 'bg-white text-gray-950'
                : 'text-gray-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Store className="w-4 h-4" />
            {!isCollapsed && 'Agent Marketplace'}
          </button>
          <button
            onClick={() => handleNavigate('studio')}
            title="AI Studio"
            className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2 text-sm transition-colors ${
              activeView === 'studio' && pathname === '/dashboard'
                ? 'bg-white text-gray-950'
                : 'text-gray-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Wand2 className="w-4 h-4" />
            {!isCollapsed && 'AI Studio'}
          </button>
          <button
            onClick={() => handleNavigate('channels')}
            title="Channels"
            className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2 text-sm transition-colors ${
              activeView === 'channels' && pathname === '/dashboard'
                ? 'bg-white text-gray-950'
                : 'text-gray-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Radio className="w-4 h-4" />
            {!isCollapsed && 'Channels'}
          </button>
          <button
            onClick={() => handleNavigate('media-editor')}
            title="Media Editor"
            className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2 text-sm transition-colors ${
              activeView === 'media-editor' && pathname === '/dashboard'
                ? 'bg-white text-gray-950'
                : 'text-gray-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Film className="w-4 h-4" />
            {!isCollapsed && (
              <>
                Media Editor
                <span className="ml-auto rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                  In dev
                </span>
              </>
            )}
          </button>
        </nav>

        <section>
          <div className={`flex items-center ${isCollapsed ? 'justify-center px-0' : 'justify-between px-2'} pb-2`}>
            {!isCollapsed && <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Create Agent</p>}
            <button
              onClick={() => router.push('/templates')}
              className="rounded p-1 text-gray-400 hover:bg-white/10 hover:text-white"
              title="Create agent"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={() => handleNavigate('agents')}
            title="My Agents"
            className={`mb-2 w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2 text-sm transition-colors ${
              activeView === 'agents'
                ? 'bg-white text-gray-950'
                : 'text-gray-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Bot className="w-4 h-4" />
            {!isCollapsed && (
              <>
                My Agents
                <span className="ml-auto text-xs opacity-70">{agents.length}</span>
              </>
            )}
          </button>
          <div className="space-y-1">
            {agents.slice(0, 8).map((agent) => (
              <button
                key={agent.id}
                onClick={() => router.push(`/dashboard?view=playground&agent=${agent.id}`)}
                title={agent.name}
                className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-2'} rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  activeViewOverride === 'playground' && typeof window !== 'undefined' && window.location.search.includes(agent.id)
                    ? 'bg-white/10 text-white'
                    : 'text-gray-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary-500 text-xs font-semibold text-white">
                  {agent.name[0]?.toUpperCase()}
                </span>
                {!isCollapsed && (
                  <>
                    <span className="min-w-0 flex-1 truncate">{agent.name}</span>
                    <ChevronRight className="w-3 h-3 shrink-0 opacity-50" />
                  </>
                )}
              </button>
            ))}
            {agents.length === 0 && !isCollapsed && (
              <p className="px-3 py-2 text-xs text-gray-500">No agents created yet</p>
            )}
          </div>
        </section>
      </div>

      <div className="p-3 border-t border-white/10 space-y-2">
        {currentUser && !isCollapsed && (
          <div className="rounded-lg bg-white/5 px-3 py-2">
            <p className="text-xs text-gray-400">Credits</p>
            <p className="text-sm font-semibold text-white">{currentUser.token_balance.toLocaleString()}</p>
            <p className="mt-1 truncate text-xs text-gray-400">{currentUser.email}</p>
          </div>
        )}
        {!isCollapsed ? (
          <button
            onClick={() => handleNavigate('premium')}
            className="w-full overflow-hidden rounded-lg bg-gradient-to-br from-orange-400 via-pink-500 to-sky-400 px-4 py-4 text-left text-white shadow-sm transition-transform hover:-translate-y-0.5"
            title="Go Premium"
          >
            <div className="flex items-center gap-2 text-sm font-bold">
              <Sparkles className="h-4 w-4" />
              Go Premium
            </div>
            <p className="mt-1 text-xs leading-5 text-white/90">Upgrade your plan to get more credits</p>
          </button>
        ) : (
          <button
            onClick={() => handleNavigate('premium')}
            className="flex w-full items-center justify-center rounded-lg bg-gradient-to-br from-orange-400 via-pink-500 to-sky-400 px-3 py-2 text-white"
            title="Go Premium"
          >
            <Sparkles className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title={mounted && theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-white/10 hover:text-white`}
        >
          {mounted && theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {!isCollapsed && (mounted && theme === 'dark' ? 'Light Mode' : 'Dark Mode')}
        </button>
        <button
          onClick={handleLogout}
          title="Logout"
          className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-white/10 hover:text-white`}
        >
          <LogOut className="w-4 h-4" />
          {!isCollapsed && 'Logout'}
        </button>
      </div>
    </aside>
  );
}
