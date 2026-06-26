'use client';

import { type KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, Hash, Loader2, MessageSquare, PauseCircle, PlayCircle, RefreshCw, Send, Tag } from 'lucide-react';
import { useParams, useSearchParams } from 'next/navigation';

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

interface ShareConfig {
  agent_id: string;
  agent_name: string;
  agent_description?: string;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'https://aicreateback.ibechamp.com';
const providers: Provider[] = ['all', 'line', 'telegram', 'facebook'];

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
  if (provider === 'line') return 'bg-green-100 text-green-700';
  if (provider === 'telegram') return 'bg-sky-100 text-sky-700';
  if (provider === 'facebook') return 'bg-blue-100 text-blue-700';
  return 'bg-gray-100 text-gray-600';
};

const quickReplies = ['Hello, how can I help?', 'Please wait a moment.', 'Can you share more details?', 'Thank you.'];

export default function SharedChannelInboxPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const agentId = String(params.id || '');
  const token = searchParams.get('token') || '';

  const [config, setConfig] = useState<ShareConfig | null>(null);
  const [provider, setProvider] = useState<Provider>('all');
  const [conversations, setConversations] = useState<ChannelConversation[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [replyText, setReplyText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [sendError, setSendError] = useState('');

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) || conversations[0],
    [conversations, selectedId]
  );

  const shareQuery = useMemo(() => {
    const query = new URLSearchParams({ token });
    if (provider !== 'all') query.set('provider', provider);
    return query.toString();
  }, [provider, token]);

  const loadConversations = useCallback(async ({ showError = false } = {}) => {
    if (!agentId || !token) return;
    try {
      const response = await fetch(`${API}/channel-share/${agentId}/conversations?${shareQuery}`);
      if (!response.ok) throw new Error('Could not load shared inbox.');
      const data = await response.json();
      setConversations(data);
      if (!selectedId && data[0]) setSelectedId(data[0].id);
      if (showError) setError('');
    } catch (err) {
      console.error('Failed to refresh shared channel inbox:', err);
      if (showError) setError(err instanceof Error ? err.message : 'Could not load shared inbox.');
    }
  }, [agentId, selectedId, shareQuery, token]);

  const loadAll = useCallback(async () => {
    if (!agentId || !token) {
      setError('This shared inbox link is missing a token.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [configResponse, conversationResponse] = await Promise.all([
        fetch(`${API}/channel-share/${agentId}/config?token=${encodeURIComponent(token)}`),
        fetch(`${API}/channel-share/${agentId}/conversations?${shareQuery}`),
      ]);
      if (!configResponse.ok || !conversationResponse.ok) throw new Error('This shared inbox is not available.');
      setConfig(await configResponse.json());
      const data = await conversationResponse.json();
      setConversations(data);
      if (!selectedId && data[0]) setSelectedId(data[0].id);
    } catch (err) {
      console.error('Failed to load shared channel inbox:', err);
      setError(err instanceof Error ? err.message : 'Could not load shared inbox.');
    } finally {
      setLoading(false);
    }
  }, [agentId, selectedId, shareQuery, token]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const interval = window.setInterval(() => loadConversations(), 5000);
    return () => window.clearInterval(interval);
  }, [loadConversations]);

  const updateConversation = async (conversation: ChannelConversation, patch: Partial<ChannelConversation>) => {
    await fetch(`${API}/channel-share/${agentId}/conversations/${conversation.id}?token=${encodeURIComponent(token)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    await loadConversations({ showError: true });
  };

  const pauseConversationForHuman = async () => {
    if (!selectedConversation || selectedConversation.human_takeover) return;
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === selectedConversation.id ? { ...conversation, human_takeover: true } : conversation
      )
    );
    await fetch(`${API}/channel-share/${agentId}/conversations/${selectedConversation.id}?token=${encodeURIComponent(token)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ human_takeover: true }),
    });
  };

  const sendManualReply = async () => {
    if (!selectedConversation || !replyText.trim()) return;
    setSaving(true);
    setSendError('');
    try {
      const response = await fetch(`${API}/channel-share/${agentId}/conversations/${selectedConversation.id}/messages?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: replyText.trim() }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.detail || 'Message was not delivered.');
      }
      setReplyText('');
      await loadConversations({ showError: true });
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Message was not delivered.');
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

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 text-gray-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading shared inbox...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 p-6 text-center text-gray-500">
        {error}
      </div>
    );
  }

  return (
    <div className="grid h-[100dvh] overflow-hidden bg-white text-gray-900 lg:grid-cols-[320px_minmax(0,1fr)_300px]">
      <aside className="min-h-0 border-r border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Shared Channel Inbox</p>
              <h1 className="mt-1 truncate text-lg font-bold">{config?.agent_name || 'Channel Inbox'}</h1>
            </div>
            <span className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700">Live</span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <select
              value={provider}
              onChange={(event) => setProvider(event.target.value as Provider)}
              className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm capitalize outline-none focus:ring-2 focus:ring-primary-500"
            >
              {providers.map((item) => (
                <option key={item} value={item}>
                  {item === 'all' ? 'All channels' : item}
                </option>
              ))}
            </select>
            <button
              onClick={() => loadConversations({ showError: true })}
              className="rounded-lg bg-gray-100 p-2 text-gray-600 hover:bg-gray-200"
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="h-[calc(100dvh-121px)] overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="flex h-48 items-center justify-center p-6 text-center text-sm text-gray-500">No channel messages yet.</div>
          ) : (
            conversations.map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => setSelectedId(conversation.id)}
                className={`w-full border-b border-gray-100 p-4 text-left transition-colors ${selectedConversation?.id === conversation.id ? 'bg-primary-50' : 'hover:bg-gray-50'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${providerClass(conversation.provider)}`}>{conversation.provider}</span>
                      {conversation.conversation_type === 'group' && <span className="rounded bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">Group</span>}
                      {conversation.human_takeover && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Paused</span>}
                    </div>
                    <p className="mt-2 truncate font-medium">{customerLabel(conversation)}</p>
                  </div>
                  <span className="shrink-0 text-xs text-gray-400">{formatListTime(conversation.last_message_at)}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm leading-5 text-gray-500">{conversation.last_message_preview || 'No preview'}</p>
              </button>
            ))
          )}
        </div>
      </aside>

      <main className="flex min-h-0 flex-col bg-white">
        {selectedConversation ? (
          <>
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-gray-200 bg-white p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate font-semibold">{customerLabel(selectedConversation)}</h2>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${providerClass(selectedConversation.provider)}`}>{selectedConversation.provider}</span>
                </div>
                <p className="mt-1 text-sm capitalize text-gray-500">
                  {selectedConversation.conversation_type === 'group' ? 'Group conversation' : 'Direct channel'} · shared view
                </p>
              </div>
              <button
                onClick={() => updateConversation(selectedConversation, { human_takeover: !selectedConversation.human_takeover })}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${selectedConversation.human_takeover ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}
              >
                {selectedConversation.human_takeover ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
                {selectedConversation.human_takeover ? 'AI Paused' : 'AI Active'}
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-gray-50 p-4">
              {selectedConversation.messages.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-gray-500">No messages yet.</div>
              ) : selectedConversation.messages.map((message) => (
                <div key={message.id} className={`w-fit max-w-[76%] break-words rounded-lg px-3.5 py-2.5 text-sm shadow-sm ${message.direction === 'inbound' ? 'bg-white text-gray-900' : message.sender_type === 'agent' ? 'ml-auto bg-indigo-500 text-white' : 'ml-auto bg-primary-500 text-white'}`}>
                  {message.sender_display_name && selectedConversation.conversation_type === 'group' && (
                    <p className="mb-1 text-[11px] font-semibold opacity-70">{message.sender_display_name}</p>
                  )}
                  <p className="whitespace-pre-wrap leading-5">{message.text}</p>
                  <p className="mt-1 text-right text-[10px] opacity-60">{formatMessageTime(message.created_at)}{message.sender_type === 'agent' ? ' · AI' : message.sender_type === 'human' ? ' · Human' : ''}</p>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-200 bg-white p-4">
              {sendError && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{sendError}</div>}
              <div className="mb-3 flex flex-wrap gap-2">
                {quickReplies.map((reply) => (
                  <button
                    key={reply}
                    type="button"
                    onClick={() => setReplyText(reply)}
                    className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-primary-300 hover:text-primary-700"
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
                  className="min-w-0 flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500"
                />
                <button onClick={sendManualReply} disabled={saving || !replyText.trim()} className="rounded-lg bg-primary-500 px-4 py-3 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-gray-500">Select a conversation</div>
        )}
      </main>

      <SharedProfilePanel conversation={selectedConversation} />
    </div>
  );
}

function SharedProfilePanel({ conversation }: { conversation?: ChannelConversation }) {
  if (!conversation) {
    return (
      <aside className="hidden min-h-0 border-l border-gray-200 bg-white lg:block">
        <div className="flex h-full items-center justify-center p-6 text-center text-sm text-gray-500">Select a conversation to see details.</div>
      </aside>
    );
  }

  const isGroup = conversation.conversation_type === 'group';
  return (
    <aside className="hidden min-h-0 overflow-y-auto border-l border-gray-200 bg-white lg:block">
      <div className="border-b border-gray-200 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Profile</p>
        <h3 className="mt-1 truncate font-semibold text-gray-900">{customerLabel(conversation)}</h3>
      </div>
      <div className="space-y-4 p-4">
        <div className="rounded-lg bg-gray-50 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <MessageSquare className="h-4 w-4 text-primary-500" />
            Conversation
          </div>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500">Channel</dt>
              <dd className="font-medium capitalize text-gray-900">{conversation.provider}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500">Type</dt>
              <dd className="font-medium text-gray-900">{isGroup ? 'Group' : 'Direct'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500">AI</dt>
              <dd className={conversation.human_takeover ? 'font-medium text-amber-600' : 'font-medium text-green-600'}>{conversation.human_takeover ? 'Paused' : 'Active'}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg bg-gray-50 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Clock className="h-4 w-4 text-primary-500" />
            Activity
          </div>
          <p className="mt-3 text-sm text-gray-500">Last message</p>
          <p className="mt-1 text-sm font-medium text-gray-900">{formatListTime(conversation.last_message_at) || 'Unknown'}</p>
        </div>

        <div className="rounded-lg bg-gray-50 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Tag className="h-4 w-4 text-primary-500" />
            Tags
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">Support</span>
            {conversation.human_takeover && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">Human takeover</span>}
          </div>
        </div>

        <div className="rounded-lg bg-gray-50 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Hash className="h-4 w-4 text-primary-500" />
            Reference
          </div>
          <p className="mt-3 break-all text-xs text-gray-500">{conversation.external_chat_id || conversation.external_user_id}</p>
        </div>
      </div>
    </aside>
  );
}
