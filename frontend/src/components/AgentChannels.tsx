'use client';

import { type KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, CheckCircle, Clock, Copy, Hash, Inbox, Loader2, Maximize2, Megaphone, MessageSquare, Minimize2, PauseCircle, PlayCircle, Save, Send, Settings, Tag, UserPlus } from 'lucide-react';
import AgentIntegrations from './AgentIntegrations';

type Provider = 'all' | 'facebook' | 'line' | 'telegram';

interface ChannelMessage {
  id: string;
  direction: string;
  sender_type: string;
  sender_display_name?: string;
  text: string;
  created_at: string;
}

interface ChannelConversation {
  id: string;
  provider: Provider;
  external_user_id: string;
  external_chat_id?: string;
  display_name?: string;
  conversation_type?: string;
  status: string;
  human_takeover: boolean;
  last_message_preview?: string;
  last_message_at: string;
  messages: ChannelMessage[];
}

interface ChannelLead {
  id: string;
  provider: string;
  name?: string;
  phone?: string;
  email?: string;
  requirement?: string;
  status: string;
  created_at: string;
}

interface ChannelBroadcast {
  id: string;
  provider: string;
  title?: string;
  message: string;
  target: string;
  status: string;
  created_at: string;
}

interface AgentIntegration {
  provider: Exclude<Provider, 'all'>;
  is_active: boolean;
  auto_reply_enabled: boolean;
  human_takeover_enabled: boolean;
  business_hours_enabled: boolean;
  business_hours_timezone?: string;
  business_hours_start?: string;
  business_hours_end?: string;
  after_hours_message?: string;
  channel_prompt?: string;
  fallback_message?: string;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'https://aicreateback.ibechamp.com';
const providers: Provider[] = ['all', 'line', 'telegram', 'facebook'];

const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('token')}`,
});

const customerLabel = (conversation: ChannelConversation) => {
  if (conversation.display_name) return conversation.display_name;
  const suffix = conversation.external_user_id?.slice(-6) || 'unknown';
  return `${conversation.provider} customer ${suffix}`;
};

const formatMessageTime = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatListTime = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const providerClass = (provider: Provider) => {
  if (provider === 'line') return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-200';
  if (provider === 'telegram') return 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-200';
  if (provider === 'facebook') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200';
  return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300';
};

const quickReplies = ['Hello, how can I help?', 'Please wait a moment.', 'Can you share more details?', 'Thank you.'];

export default function AgentChannels({ agentId }: { agentId: string }) {
  const [activeView, setActiveView] = useState<'inbox' | 'leads' | 'settings'>('inbox');
  const [provider, setProvider] = useState<Provider>('all');
  const [conversations, setConversations] = useState<ChannelConversation[]>([]);
  const [leads, setLeads] = useState<ChannelLead[]>([]);
  const [broadcasts, setBroadcasts] = useState<ChannelBroadcast[]>([]);
  const [integrations, setIntegrations] = useState<AgentIntegration[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [replyText, setReplyText] = useState('');
  const [leadDraft, setLeadDraft] = useState({ provider: 'line', name: '', phone: '', email: '', requirement: '' });
  const [broadcastDraft, setBroadcastDraft] = useState({ provider: 'line', title: '', message: '', target: 'all', status: 'draft' });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [sendError, setSendError] = useState('');
  const [saving, setSaving] = useState(false);
  const [inboxFullscreen, setInboxFullscreen] = useState(false);
  const [isPublicChat, setIsPublicChat] = useState(true);
  const [isSharingSaving, setIsSharingSaving] = useState(false);
  const [shareCopied, setShareCopied] = useState<'link' | 'embed' | null>(null);
  const [channelShareUrl, setChannelShareUrl] = useState('');

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) || conversations[0],
    [conversations, selectedId]
  );

  const loadConversations = useCallback(async ({ showError = false } = {}) => {
    try {
      const query = provider === 'all' ? '' : `?provider=${provider}`;
      const response = await fetch(`${API}/agents/${agentId}/channel-conversations${query}`, { headers: authHeaders() });
      if (!response.ok) throw new Error('Could not refresh messages.');
      const conversationData = await response.json();
      setConversations(conversationData);
      if (!selectedId && conversationData[0]) setSelectedId(conversationData[0].id);
      if (showError) setLoadError('');
    } catch (error) {
      console.error('Failed to refresh channel messages:', error);
      if (showError) {
        setLoadError(error instanceof Error ? error.message : 'Could not refresh messages.');
      }
    }
  }, [agentId, provider, selectedId]);

  const loadAll = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setLoadError('');
    try {
      const query = provider === 'all' ? '' : `?provider=${provider}`;
      const [conversationRes, leadRes, broadcastRes, integrationRes] = await Promise.all([
        fetch(`${API}/agents/${agentId}/channel-conversations${query}`, { headers: authHeaders() }),
        fetch(`${API}/agents/${agentId}/channel-leads`, { headers: authHeaders() }),
        fetch(`${API}/agents/${agentId}/channel-broadcasts`, { headers: authHeaders() }),
        fetch(`${API}/agents/${agentId}/integrations`, { headers: authHeaders() }),
      ]);
      if (!conversationRes.ok || !leadRes.ok || !broadcastRes.ok || !integrationRes.ok) {
        throw new Error('Could not load channel data. Please login again and retry.');
      }
      const conversationData = conversationRes.ok ? await conversationRes.json() : [];
      setConversations(conversationData);
      setLeads(leadRes.ok ? await leadRes.json() : []);
      setBroadcasts(broadcastRes.ok ? await broadcastRes.json() : []);
      setIntegrations(integrationRes.ok ? await integrationRes.json() : []);
      if (!selectedId && conversationData[0]) setSelectedId(conversationData[0].id);
    } catch (error) {
      console.error('Failed to load channel data:', error);
      if (showSpinner) {
        setLoadError(error instanceof Error ? error.message : 'Could not load channel data.');
      }
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [agentId, provider, selectedId]);

  const loadShareStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API}/agents/${agentId}/channel-share`, { headers: authHeaders() });
      if (!response.ok) return;
      const data = await response.json();
      setIsPublicChat(Boolean(data.enabled));
      setChannelShareUrl(data.url || '');
    } catch (error) {
      console.error('Failed to load channel share status:', error);
    }
  }, [agentId]);

  useEffect(() => {
    loadAll();
    loadShareStatus();
  }, [loadAll, loadShareStatus]);

  useEffect(() => {
    if (activeView !== 'inbox') return;
    const interval = window.setInterval(() => loadConversations(), 5000);
    return () => window.clearInterval(interval);
  }, [activeView, loadConversations]);

  useEffect(() => {
    if (!inboxFullscreen) return;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setInboxFullscreen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [inboxFullscreen]);

  const updateConversation = async (conversation: ChannelConversation, patch: Partial<ChannelConversation>) => {
    await fetch(`${API}/agents/${agentId}/channel-conversations/${conversation.id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(patch),
    });
    await loadAll();
  };

  const pauseConversationForHuman = async () => {
    if (!selectedConversation || selectedConversation.human_takeover) return;
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === selectedConversation.id ? { ...conversation, human_takeover: true } : conversation
      )
    );
    await fetch(`${API}/agents/${agentId}/channel-conversations/${selectedConversation.id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ human_takeover: true }),
    });
  };

  const sendManualReply = async () => {
    if (!selectedConversation || !replyText.trim()) return;
    setSaving(true);
    setSendError('');
    try {
      const response = await fetch(`${API}/agents/${agentId}/channel-conversations/${selectedConversation.id}/messages`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ text: replyText.trim() }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.detail || 'Message was not delivered.');
      }
      setReplyText('');
      await loadAll();
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Message was not delivered.');
    } finally {
      setSaving(false);
    }
  };

  const handleReplyKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendManualReply();
    }
  };

  const saveRules = async (integration: AgentIntegration) => {
    setSaving(true);
    try {
      await fetch(`${API}/agents/${agentId}/integrations/${integration.provider}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(integration),
      });
      await loadAll();
    } finally {
      setSaving(false);
    }
  };

  const createLead = async () => {
    if (!leadDraft.name && !leadDraft.phone && !leadDraft.email) return;
    setSaving(true);
    try {
      await fetch(`${API}/agents/${agentId}/channel-leads`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(leadDraft),
      });
      setLeadDraft({ provider: 'line', name: '', phone: '', email: '', requirement: '' });
      await loadAll();
    } finally {
      setSaving(false);
    }
  };

  const createBroadcast = async () => {
    if (!broadcastDraft.message.trim()) return;
    setSaving(true);
    try {
      await fetch(`${API}/agents/${agentId}/channel-broadcasts`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(broadcastDraft),
      });
      setBroadcastDraft({ provider: 'line', title: '', message: '', target: 'all', status: 'draft' });
      await loadAll();
    } finally {
      setSaving(false);
    }
  };

  const togglePublicChat = async (nextValue: boolean) => {
    setIsSharingSaving(true);
    try {
      const response = await fetch(`${API}/agents/${agentId}/channel-share`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ enabled: nextValue }),
      });
      if (!response.ok) throw new Error('Could not update channel inbox sharing.');
      const data = await response.json();
      setIsPublicChat(Boolean(data.enabled));
      setChannelShareUrl(data.url || '');
    } catch (error) {
      console.error('Failed to update channel inbox sharing:', error);
      alert('Could not update channel inbox sharing.');
    } finally {
      setIsSharingSaving(false);
    }
  };

  const copyShareText = async (text: string, type: 'link' | 'embed') => {
    await navigator.clipboard.writeText(text);
    setShareCopied(type);
    window.setTimeout(() => setShareCopied((current) => (current === type ? null : current)), 1600);
  };

  const tabs = [
    { id: 'inbox', label: 'Inbox', icon: Inbox },
    { id: 'leads', label: 'Leads', icon: UserPlus },
  ] as const;

  return (
    <div className="space-y-5">
      <div className="rounded-lg bg-white p-4 shadow dark:bg-gray-950">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Channel Control Center</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Manage external messages, leads, and channel settings for this agent.</p>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex flex-wrap gap-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveView(tab.id)}
                    className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${activeView === tab.id ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'}`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
              <button
                onClick={() => setActiveView(activeView === 'settings' ? 'inbox' : 'settings')}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${activeView === 'settings' ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-950' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'}`}
              >
                <Settings className="h-4 w-4" />
                {activeView === 'settings' ? 'Back to Inbox' : 'Settings'}
              </button>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
              Channel
              <select
                value={provider}
                onChange={(event) => setProvider(event.target.value as Provider)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm capitalize text-gray-900 outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              >
                {providers.map((item) => (
                  <option key={item} value={item}>
                    {item === 'all' ? 'All channels' : item}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-lg bg-white py-12 text-gray-500 shadow dark:bg-gray-950">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading channels...
        </div>
      ) : loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          {loadError}
        </div>
      ) : (
        <>
          {activeView === 'inbox' && (
            <div className={inboxFullscreen ? 'fixed inset-0 z-[9999] grid h-[100dvh] w-screen grid-rows-[1fr] gap-0 overflow-hidden bg-white dark:bg-gray-950 lg:grid-cols-[320px_minmax(0,1fr)_300px]' : 'grid min-h-[calc(100vh-210px)] gap-4 xl:grid-cols-[320px_minmax(0,1fr)_300px]'}>
              <div className={`min-h-0 overflow-hidden bg-white shadow dark:bg-gray-950 ${inboxFullscreen ? 'border-r border-gray-200 shadow-none dark:border-gray-800' : 'rounded-lg'}`}>
                <div className="border-b border-gray-200 p-4 dark:border-gray-800">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">Conversations</h3>
                      <p className="mt-1 text-xs text-gray-500">{conversations.length} active thread{conversations.length === 1 ? '' : 's'}</p>
                    </div>
                    <span className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-200">Live</span>
                  </div>
                </div>
                <div className={inboxFullscreen ? 'h-[calc(100dvh-73px)] overflow-y-auto' : 'max-h-[calc(100vh-285px)] overflow-y-auto'}>
                  {conversations.length === 0 ? (
                    <div className="flex h-48 items-center justify-center p-6 text-center text-sm text-gray-500">No channel messages yet.</div>
                  ) : (
                    conversations.map((conversation) => (
                      <button
                        key={conversation.id}
                        onClick={() => setSelectedId(conversation.id)}
                        className={`w-full border-b border-gray-100 p-4 text-left transition-colors dark:border-gray-900 ${selectedConversation?.id === conversation.id ? 'bg-primary-50 dark:bg-primary-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-900'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${providerClass(conversation.provider)}`}>{conversation.provider}</span>
                              {conversation.conversation_type === 'group' && <span className="rounded bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-200">Group</span>}
                              {conversation.human_takeover && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">Paused</span>}
                            </div>
                            <p className="mt-2 truncate font-medium text-gray-900 dark:text-white">{customerLabel(conversation)}</p>
                          </div>
                          <span className="shrink-0 text-xs text-gray-400">{formatListTime(conversation.last_message_at)}</span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm leading-5 text-gray-500">{conversation.last_message_preview || 'No preview'}</p>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className={`min-h-0 bg-white shadow dark:bg-gray-950 ${inboxFullscreen ? 'shadow-none' : 'rounded-lg'}`}>
                {selectedConversation ? (
                  <div className={inboxFullscreen ? 'flex h-[100dvh] min-h-0 flex-col overflow-hidden' : 'flex h-full min-h-[calc(100vh-210px)] flex-col'}>
                    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate font-semibold text-gray-900 dark:text-white">{customerLabel(selectedConversation)}</h3>
                          <span className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${providerClass(selectedConversation.provider)}`}>{selectedConversation.provider}</span>
                        </div>
                        <p className="mt-1 text-sm capitalize text-gray-500">
                          {selectedConversation.conversation_type === 'group' ? 'Group conversation' : 'Direct channel'} · {selectedConversation.human_takeover ? 'Human handling' : 'AI ready'}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          onClick={() => setInboxFullscreen((current) => !current)}
                          className="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                          title={inboxFullscreen ? 'Exit full screen' : 'Full screen'}
                        >
                          {inboxFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                          {inboxFullscreen ? 'Exit' : 'Full'}
                        </button>
                        <button
                          onClick={() => updateConversation(selectedConversation, { human_takeover: !selectedConversation.human_takeover })}
                          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${selectedConversation.human_takeover ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-200'}`}
                        >
                          {selectedConversation.human_takeover ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
                          {selectedConversation.human_takeover ? 'AI Paused' : 'AI Active'}
                        </button>
                      </div>
                    </div>
                    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-gray-50 p-4 dark:bg-gray-900/60">
                      {selectedConversation.messages.length === 0 ? (
                        <div className="flex h-full items-center justify-center text-sm text-gray-500">No messages yet.</div>
                      ) : selectedConversation.messages.map((message) => (
                        <div key={message.id} className={`w-fit max-w-[76%] break-words rounded-lg px-3.5 py-2.5 text-sm shadow-sm ${message.direction === 'inbound' ? 'bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100' : message.sender_type === 'agent' ? 'ml-auto bg-indigo-500 text-white' : 'ml-auto bg-primary-500 text-white'}`}>
                          {message.sender_display_name && selectedConversation.conversation_type === 'group' && (
                            <p className="mb-1 text-[11px] font-semibold opacity-70">{message.sender_display_name}</p>
                          )}
                          <p className="whitespace-pre-wrap leading-5">{message.text}</p>
                          <p className="mt-1 text-right text-[10px] opacity-60">{formatMessageTime(message.created_at)}{message.sender_type === 'agent' ? ' · AI' : message.sender_type === 'human' ? ' · Human' : ''}</p>
                        </div>
                      ))}
                    </div>
                    <div className="border-t border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
                      {sendError && (
                        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
                          {sendError}
                        </div>
                      )}
                      <div className="mb-3 flex flex-wrap gap-2">
                        {quickReplies.map((reply) => (
                          <button
                            key={reply}
                            type="button"
                            onClick={() => setReplyText(reply)}
                            className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-primary-300 hover:text-primary-700 dark:border-gray-800 dark:text-gray-300 dark:hover:border-primary-700"
                          >
                            {reply}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-end gap-2">
                        <textarea
                          value={replyText}
                          onFocus={pauseConversationForHuman}
                          onKeyDown={handleReplyKeyDown}
                          onChange={(event) => setReplyText(event.target.value)}
                          placeholder="Manual reply to customer..."
                          rows={2}
                          className="min-w-0 flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                        />
                        <button onClick={sendManualReply} disabled={saving || !replyText.trim()} className="rounded-lg bg-primary-500 px-4 py-3 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50">
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full min-h-[520px] items-center justify-center text-gray-500">Select a conversation</div>
                )}
              </div>

              <ChannelProfilePanel conversation={selectedConversation} />
            </div>
          )}

          {activeView === 'settings' && (
            <div className="grid gap-5">
              <ChannelShareCard
                agentId={agentId}
                isPublic={isPublicChat}
                saving={isSharingSaving}
                copied={shareCopied}
                shareUrl={channelShareUrl}
                onToggle={togglePublicChat}
                onCopy={copyShareText}
              />
              <AgentIntegrations agentId={agentId} />
              {integrations.length === 0 ? (
                <div className="rounded-lg bg-white p-6 text-sm text-gray-500 shadow dark:bg-gray-950">Connect a channel first in Settings.</div>
              ) : (
                integrations.map((integration, index) => (
                  <RuleCard
                    key={integration.provider}
                    integration={integration}
                    onChange={(next) => setIntegrations((current) => current.map((item, itemIndex) => itemIndex === index ? next : item))}
                    onSave={() => saveRules(integration)}
                    saving={saving}
                  />
                ))
              )}
              <BroadcastSettings
                broadcasts={broadcasts}
                broadcastDraft={broadcastDraft}
                setBroadcastDraft={setBroadcastDraft}
                createBroadcast={createBroadcast}
                saving={saving}
              />
            </div>
          )}

          {activeView === 'leads' && (
            <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
              <div className="rounded-lg bg-white p-5 shadow dark:bg-gray-950">
                <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">Add Lead</h3>
                <div className="space-y-3">
                  {(['provider', 'name', 'phone', 'email', 'requirement'] as const).map((field) => (
                    <input
                      key={field}
                      value={leadDraft[field]}
                      onChange={(event) => setLeadDraft({ ...leadDraft, [field]: event.target.value })}
                      placeholder={field}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                    />
                  ))}
                  <button onClick={createLead} disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50">
                    <Save className="h-4 w-4" />
                    Save Lead
                  </button>
                </div>
              </div>
              <div className="rounded-lg bg-white shadow dark:bg-gray-950">
                <div className="border-b border-gray-200 p-4 dark:border-gray-800">
                  <h3 className="font-semibold text-gray-900 dark:text-white">Captured Leads</h3>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-gray-900">
                  {leads.length === 0 ? <p className="p-4 text-sm text-gray-500">No leads yet.</p> : leads.map((lead) => (
                    <div key={lead.id} className="p-4">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-white">{lead.name || 'Unnamed lead'}</span>
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs capitalize text-gray-600 dark:bg-gray-800 dark:text-gray-300">{lead.provider}</span>
                      </div>
                      <p className="mt-1 text-sm text-gray-500">{[lead.phone, lead.email].filter(Boolean).join(' · ') || 'No contact added'}</p>
                      {lead.requirement && <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{lead.requirement}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </>
      )}
    </div>
  );
}

function ChannelProfilePanel({ conversation }: { conversation?: ChannelConversation }) {
  if (!conversation) {
    return (
      <aside className="hidden min-h-0 bg-white shadow dark:bg-gray-950 xl:block xl:rounded-lg">
        <div className="flex h-full items-center justify-center p-6 text-center text-sm text-gray-500">Select a conversation to see customer details.</div>
      </aside>
    );
  }

  const isGroup = conversation.conversation_type === 'group';
  return (
    <aside className="hidden min-h-0 overflow-y-auto bg-white shadow dark:bg-gray-950 xl:block xl:rounded-lg">
      <div className="border-b border-gray-200 p-4 dark:border-gray-800">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Profile</p>
        <h3 className="mt-1 truncate font-semibold text-gray-900 dark:text-white">{customerLabel(conversation)}</h3>
      </div>
      <div className="space-y-4 p-4">
        <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
            <MessageSquare className="h-4 w-4 text-primary-500" />
            Conversation
          </div>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500">Channel</dt>
              <dd className="font-medium capitalize text-gray-900 dark:text-white">{conversation.provider}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500">Type</dt>
              <dd className="font-medium text-gray-900 dark:text-white">{isGroup ? 'Group' : 'Direct'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500">AI</dt>
              <dd className={conversation.human_takeover ? 'font-medium text-amber-600' : 'font-medium text-green-600'}>{conversation.human_takeover ? 'Paused' : 'Active'}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
            <Clock className="h-4 w-4 text-primary-500" />
            Activity
          </div>
          <p className="mt-3 text-sm text-gray-500">Last message</p>
          <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{formatListTime(conversation.last_message_at) || 'Unknown'}</p>
        </div>

        <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
            <Tag className="h-4 w-4 text-primary-500" />
            Tags
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-200">Support</span>
            {conversation.human_takeover && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">Human takeover</span>}
          </div>
        </div>

        <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
            <Hash className="h-4 w-4 text-primary-500" />
            Reference
          </div>
          <p className="mt-3 break-all text-xs text-gray-500">{conversation.external_chat_id || conversation.external_user_id}</p>
        </div>
      </div>
    </aside>
  );
}

function BroadcastSettings({
  broadcasts,
  broadcastDraft,
  setBroadcastDraft,
  createBroadcast,
  saving,
}: {
  broadcasts: ChannelBroadcast[];
  broadcastDraft: { provider: string; title: string; message: string; target: string; status: string };
  setBroadcastDraft: (draft: { provider: string; title: string; message: string; target: string; status: string }) => void;
  createBroadcast: () => void;
  saving: boolean;
}) {
  return (
    <div className="rounded-lg bg-white p-5 shadow dark:bg-gray-950">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
            <Megaphone className="h-4 w-4" />
            Broadcast Drafts
          </h3>
          <p className="mt-1 text-sm text-gray-500">Save announcement drafts here. Bulk sending can be enabled later.</p>
        </div>
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">In dev</span>
      </div>
      <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-3">
          <input value={broadcastDraft.provider} onChange={(event) => setBroadcastDraft({ ...broadcastDraft, provider: event.target.value })} placeholder="provider" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
          <input value={broadcastDraft.title} onChange={(event) => setBroadcastDraft({ ...broadcastDraft, title: event.target.value })} placeholder="title" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
          <textarea value={broadcastDraft.message} onChange={(event) => setBroadcastDraft({ ...broadcastDraft, message: event.target.value })} placeholder="message" rows={5} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
          <button onClick={createBroadcast} disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50">
            <Bell className="h-4 w-4" />
            Save Draft
          </button>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-800">
          <div className="border-b border-gray-200 p-4 dark:border-gray-800">
            <h4 className="font-semibold text-gray-900 dark:text-white">Saved Drafts</h4>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-900">
            {broadcasts.length === 0 ? <p className="p-4 text-sm text-gray-500">No broadcast drafts yet.</p> : broadcasts.map((broadcast) => (
              <div key={broadcast.id} className="p-4">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 dark:text-white">{broadcast.title || 'Untitled broadcast'}</span>
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs capitalize text-gray-600 dark:bg-gray-800 dark:text-gray-300">{broadcast.provider}</span>
                  <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">{broadcast.status}</span>
                </div>
                <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{broadcast.message}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChannelShareCard({
  agentId,
  isPublic,
  saving,
  copied,
  shareUrl,
  onToggle,
  onCopy,
}: {
  agentId: string;
  isPublic: boolean;
  saving: boolean;
  copied: 'link' | 'embed' | null;
  shareUrl: string;
  onToggle: (nextValue: boolean) => void;
  onCopy: (text: string, type: 'link' | 'embed') => void;
}) {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://yourdomain.com';
  const chatUrl = shareUrl || `${baseUrl}/channel-inbox/${agentId}`;
  const embedCode = `<iframe\n  src="${chatUrl}"\n  width="1200"\n  height="800"\n  style="border-radius: 12px; border: 1px solid #e5e7eb; box-shadow: 0 4px 6px rgba(0,0,0,0.07);"\n  frameborder="0"\n></iframe>`;

  return (
    <div className="rounded-lg bg-white p-5 shadow dark:bg-gray-950">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">Share Channel Inbox</h3>
          <p className="mt-1 text-sm text-gray-500">Share the operator inbox for this agent's LINE, Telegram, and Facebook channels.</p>
        </div>
        <button
          onClick={() => onToggle(!isPublic)}
          disabled={saving}
          className={`relative h-7 w-14 rounded-full transition-colors disabled:opacity-60 ${isPublic ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-700'}`}
          title={isPublic ? 'Hide channel inbox sharing' : 'Show channel inbox sharing'}
        >
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${isPublic ? 'left-8' : 'left-1'}`} />
        </button>
      </div>

      {isPublic ? (
        <div className="mt-5 space-y-4 border-t border-gray-200 pt-5 dark:border-gray-800">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Share Link</p>
            <div className="flex gap-2">
              <input
                readOnly
                value={chatUrl}
                className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              />
              <button
                onClick={() => onCopy(chatUrl, 'link')}
                className="flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
              >
                {copied === 'link' ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied === 'link' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Embed Code</p>
            <div className="relative rounded-lg bg-gray-950 p-4">
              <pre className="overflow-x-auto whitespace-pre-wrap pr-16 text-xs leading-5 text-green-400">{embedCode}</pre>
              <button
                onClick={() => onCopy(embedCode, 'embed')}
                className="absolute right-3 top-3 flex items-center gap-1 rounded bg-gray-700 px-2 py-1 text-xs text-gray-100 hover:bg-gray-600"
              >
                {copied === 'embed' ? <CheckCircle className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied === 'embed' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-400">This opens the channel inbox dashboard. The user must be logged in.</p>
          </div>
        </div>
      ) : (
        <p className="mt-4 border-t border-gray-200 pt-4 text-sm text-gray-400 dark:border-gray-800">Enable sharing to get the channel inbox link and embed code.</p>
      )}
    </div>
  );
}

function RuleCard({
  integration,
  onChange,
  onSave,
  saving,
}: {
  integration: AgentIntegration;
  onChange: (integration: AgentIntegration) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const setValue = (field: keyof AgentIntegration, value: string | boolean) => onChange({ ...integration, [field]: value });
  return (
    <div className="rounded-lg bg-white p-5 shadow dark:bg-gray-950">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold capitalize text-gray-900 dark:text-white">{integration.provider} Rules</h3>
          <p className="text-sm text-gray-500">Control how this channel behaves before and after human takeover.</p>
        </div>
        <button onClick={onSave} disabled={saving} className="flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50">
          <Save className="h-4 w-4" />
          Save
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          ['auto_reply_enabled', 'Auto reply'],
          ['human_takeover_enabled', 'Allow human takeover'],
          ['business_hours_enabled', 'Business hours'],
        ].map(([field, label]) => (
          <label key={field} className="flex items-center justify-between rounded-lg bg-gray-50 p-3 text-sm dark:bg-gray-900">
            <span className="font-medium text-gray-700 dark:text-gray-300">{label}</span>
            <input type="checkbox" checked={Boolean(integration[field as keyof AgentIntegration])} onChange={(event) => setValue(field as keyof AgentIntegration, event.target.checked)} />
          </label>
        ))}
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <input value={integration.business_hours_timezone || ''} onChange={(event) => setValue('business_hours_timezone', event.target.value)} placeholder="Timezone" className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
        <input value={integration.business_hours_start || ''} onChange={(event) => setValue('business_hours_start', event.target.value)} placeholder="Start 09:00" className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
        <input value={integration.business_hours_end || ''} onChange={(event) => setValue('business_hours_end', event.target.value)} placeholder="End 18:00" className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <textarea value={integration.channel_prompt || ''} onChange={(event) => setValue('channel_prompt', event.target.value)} placeholder="Channel-specific prompt" rows={4} className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
        <textarea value={integration.after_hours_message || ''} onChange={(event) => setValue('after_hours_message', event.target.value)} placeholder="After-hours message" rows={4} className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
        <textarea value={integration.fallback_message || ''} onChange={(event) => setValue('fallback_message', event.target.value)} placeholder="Fallback message" rows={4} className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
      </div>
    </div>
  );
}
