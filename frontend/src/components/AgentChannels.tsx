'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bell, Bot, Clock, Inbox, KeyRound, Loader2, Megaphone, PauseCircle, PlayCircle, Save, Send, UserPlus } from 'lucide-react';
import AgentIntegrations from './AgentIntegrations';

type Provider = 'all' | 'facebook' | 'line' | 'telegram';

interface ChannelMessage {
  id: string;
  direction: string;
  sender_type: string;
  text: string;
  created_at: string;
}

interface ChannelConversation {
  id: string;
  provider: Provider;
  external_user_id: string;
  display_name?: string;
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

export default function AgentChannels({ agentId }: { agentId: string }) {
  const [activeView, setActiveView] = useState<'inbox' | 'credentials' | 'rules' | 'leads' | 'broadcast'>('inbox');
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
  const [saving, setSaving] = useState(false);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) || conversations[0],
    [conversations, selectedId]
  );

  useEffect(() => {
    loadAll();
  }, [agentId, provider]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const query = provider === 'all' ? '' : `?provider=${provider}`;
      const [conversationRes, leadRes, broadcastRes, integrationRes] = await Promise.all([
        fetch(`${API}/agents/${agentId}/channel-conversations${query}`, { headers: authHeaders() }),
        fetch(`${API}/agents/${agentId}/channel-leads`, { headers: authHeaders() }),
        fetch(`${API}/agents/${agentId}/channel-broadcasts`, { headers: authHeaders() }),
        fetch(`${API}/agents/${agentId}/integrations`, { headers: authHeaders() }),
      ]);
      const conversationData = conversationRes.ok ? await conversationRes.json() : [];
      setConversations(conversationData);
      setLeads(leadRes.ok ? await leadRes.json() : []);
      setBroadcasts(broadcastRes.ok ? await broadcastRes.json() : []);
      setIntegrations(integrationRes.ok ? await integrationRes.json() : []);
      if (!selectedId && conversationData[0]) setSelectedId(conversationData[0].id);
    } finally {
      setLoading(false);
    }
  };

  const updateConversation = async (conversation: ChannelConversation, patch: Partial<ChannelConversation>) => {
    await fetch(`${API}/agents/${agentId}/channel-conversations/${conversation.id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(patch),
    });
    await loadAll();
  };

  const sendManualReply = async () => {
    if (!selectedConversation || !replyText.trim()) return;
    setSaving(true);
    try {
      await fetch(`${API}/agents/${agentId}/channel-conversations/${selectedConversation.id}/messages`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ text: replyText.trim() }),
      });
      setReplyText('');
      await loadAll();
    } finally {
      setSaving(false);
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

  const tabs = [
    { id: 'inbox', label: 'Inbox', icon: Inbox },
    { id: 'credentials', label: 'Credentials', icon: KeyRound },
    { id: 'rules', label: 'Rules', icon: Clock },
    { id: 'leads', label: 'Leads', icon: UserPlus },
    { id: 'broadcast', label: 'Broadcast', icon: Megaphone },
  ] as const;

  return (
    <div className="space-y-5">
      <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-950">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Channel Control Center</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Manage external messages, rules, leads, and broadcasts for this agent.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {providers.map((item) => (
              <button
                key={item}
                onClick={() => setProvider(item)}
                className={`rounded-lg px-3 py-2 text-sm font-medium capitalize ${provider === item ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'}`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveView(tab.id)}
                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${activeView === tab.id ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900'}`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-lg bg-white py-12 text-gray-500 shadow dark:bg-gray-950">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading channels...
        </div>
      ) : (
        <>
          {activeView === 'inbox' && (
            <div className="grid min-h-[520px] gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
              <div className="overflow-hidden rounded-lg bg-white shadow dark:bg-gray-950">
                <div className="border-b border-gray-200 p-4 dark:border-gray-800">
                  <h3 className="font-semibold text-gray-900 dark:text-white">Conversations</h3>
                </div>
                <div className="max-h-[620px] overflow-y-auto">
                  {conversations.length === 0 ? (
                    <p className="p-4 text-sm text-gray-500">No channel messages yet.</p>
                  ) : (
                    conversations.map((conversation) => (
                      <button
                        key={conversation.id}
                        onClick={() => setSelectedId(conversation.id)}
                        className={`w-full border-b border-gray-100 p-4 text-left dark:border-gray-900 ${selectedConversation?.id === conversation.id ? 'bg-primary-50 dark:bg-primary-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-900'}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium capitalize text-gray-600 dark:bg-gray-800 dark:text-gray-300">{conversation.provider}</span>
                          {conversation.human_takeover && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Paused</span>}
                        </div>
                        <p className="mt-2 truncate font-medium text-gray-900 dark:text-white">{customerLabel(conversation)}</p>
                        <p className="mt-1 line-clamp-2 text-sm text-gray-500">{conversation.last_message_preview || 'No preview'}</p>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-lg bg-white shadow dark:bg-gray-950">
                {selectedConversation ? (
                  <div className="flex h-full min-h-[520px] flex-col">
                    <div className="flex items-center justify-between gap-3 border-b border-gray-200 p-4 dark:border-gray-800">
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">{customerLabel(selectedConversation)}</h3>
                        <p className="text-sm capitalize text-gray-500">{selectedConversation.provider} channel</p>
                      </div>
                      <button
                        onClick={() => updateConversation(selectedConversation, { human_takeover: !selectedConversation.human_takeover })}
                        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${selectedConversation.human_takeover ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}
                      >
                        {selectedConversation.human_takeover ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
                        {selectedConversation.human_takeover ? 'AI Paused' : 'AI Active'}
                      </button>
                    </div>
                    <div className="flex-1 space-y-3 overflow-y-auto p-4">
                      {selectedConversation.messages.map((message) => (
                        <div key={message.id} className={`max-w-[80%] rounded-lg px-4 py-3 text-sm ${message.direction === 'inbound' ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100' : 'ml-auto bg-primary-500 text-white'}`}>
                          <p>{message.text}</p>
                          <p className="mt-1 text-[11px] opacity-70">{message.sender_type}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 border-t border-gray-200 p-4 dark:border-gray-800">
                      <input
                        value={replyText}
                        onChange={(event) => setReplyText(event.target.value)}
                        placeholder="Manual reply note..."
                        className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                      />
                      <button onClick={sendManualReply} disabled={saving} className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50">
                        <Send className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full min-h-[520px] items-center justify-center text-gray-500">Select a conversation</div>
                )}
              </div>
            </div>
          )}

          {activeView === 'credentials' && (
            <AgentIntegrations agentId={agentId} />
          )}

          {activeView === 'rules' && (
            <div className="grid gap-5">
              {integrations.length === 0 ? (
                <div className="rounded-lg bg-white p-6 text-sm text-gray-500 shadow dark:bg-gray-950">Connect a channel first in Credentials.</div>
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

          {activeView === 'broadcast' && (
            <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
              <div className="rounded-lg bg-white p-5 shadow dark:bg-gray-950">
                <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">New Broadcast Draft</h3>
                <div className="space-y-3">
                  <input value={broadcastDraft.provider} onChange={(event) => setBroadcastDraft({ ...broadcastDraft, provider: event.target.value })} placeholder="provider" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
                  <input value={broadcastDraft.title} onChange={(event) => setBroadcastDraft({ ...broadcastDraft, title: event.target.value })} placeholder="title" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
                  <textarea value={broadcastDraft.message} onChange={(event) => setBroadcastDraft({ ...broadcastDraft, message: event.target.value })} placeholder="message" rows={5} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
                  <button onClick={createBroadcast} disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50">
                    <Bell className="h-4 w-4" />
                    Save Draft
                  </button>
                </div>
              </div>
              <div className="rounded-lg bg-white shadow dark:bg-gray-950">
                <div className="border-b border-gray-200 p-4 dark:border-gray-800">
                  <h3 className="font-semibold text-gray-900 dark:text-white">Broadcast History</h3>
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
          )}
        </>
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
