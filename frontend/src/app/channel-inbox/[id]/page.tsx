'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, PauseCircle, PlayCircle, RefreshCw, Send } from 'lucide-react';
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

const messageReference = (message: ChannelMessage, conversation: ChannelConversation) => {
  if (conversation.conversation_type === 'group' && message.sender_display_name) return message.sender_display_name;
  if (message.sender_type === 'agent') return 'AI reply';
  if (message.sender_type === 'human') return 'Human reply';
  return '';
};

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
    <div className="grid h-[100dvh] overflow-hidden bg-white text-gray-900 lg:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="min-h-0 overflow-hidden border-r border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Shared Channel Inbox</p>
          <h1 className="mt-1 text-lg font-bold">{config?.agent_name || 'Channel Inbox'}</h1>
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
            <p className="p-4 text-sm text-gray-500">No channel messages yet.</p>
          ) : (
            conversations.map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => setSelectedId(conversation.id)}
                className={`w-full border-b border-gray-100 p-4 text-left ${selectedConversation?.id === conversation.id ? 'bg-primary-50' : 'hover:bg-gray-50'}`}
              >
                <div className="flex items-center gap-2">
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium capitalize text-gray-600">{conversation.provider}</span>
                  {conversation.human_takeover && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Paused</span>}
                </div>
                <p className="mt-2 truncate font-medium">{customerLabel(conversation)}</p>
                <p className="mt-1 line-clamp-2 text-sm text-gray-500">{conversation.last_message_preview || 'No preview'}</p>
              </button>
            ))
          )}
        </div>
      </aside>

      <main className="flex min-h-0 overflow-hidden flex-col bg-white">
        {selectedConversation ? (
          <>
            <div className="shrink-0 flex items-center justify-between gap-3 border-b border-gray-200 p-4">
              <div>
                <h2 className="font-semibold">{customerLabel(selectedConversation)}</h2>
                <p className="text-sm capitalize text-gray-500">
                  {selectedConversation.provider} {selectedConversation.conversation_type === 'group' ? 'group' : 'channel'} · shared view
                </p>
              </div>
              <button
                onClick={() => updateConversation(selectedConversation, { human_takeover: !selectedConversation.human_takeover })}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${selectedConversation.human_takeover ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}
              >
                {selectedConversation.human_takeover ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
                {selectedConversation.human_takeover ? 'AI Paused' : 'AI Active'}
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-[#f3f0e8] p-4">
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-2.5">
                {selectedConversation.messages.map((message) => {
                  const reference = messageReference(message, selectedConversation);
                  const outbound = message.direction !== 'inbound';
                  return (
                    <div
                      key={message.id}
                      className={`w-fit max-w-[82%] rounded-2xl px-3 py-2 text-sm shadow-sm [overflow-wrap:anywhere] sm:max-w-[460px] ${outbound ? 'ml-auto rounded-br-md bg-primary-500 text-white' : 'rounded-bl-md bg-white text-gray-900'}`}
                    >
                      {reference && (
                        <p className={`mb-1 border-l-2 pl-2 text-[11px] font-semibold leading-4 ${outbound ? 'border-white/50 text-white/80' : 'border-primary-400 text-primary-700'}`}>
                          {reference}
                        </p>
                      )}
                      <p className="whitespace-pre-wrap leading-5">{message.text}</p>
                      <p className={`mt-1 text-right text-[10px] leading-none ${outbound ? 'text-white/70' : 'text-gray-400'}`}>
                        {formatMessageTime(message.created_at)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="shrink-0 border-t border-gray-200 p-4">
              {sendError && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{sendError}</div>}
              <div className="mx-auto flex w-full max-w-3xl gap-2">
                <input
                  value={replyText}
                  onFocus={pauseConversationForHuman}
                  onChange={(event) => setReplyText(event.target.value)}
                  placeholder="Manual reply to customer..."
                  className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500"
                />
                <button onClick={sendManualReply} disabled={saving} className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-gray-500">Select a conversation</div>
        )}
      </main>
    </div>
  );
}
