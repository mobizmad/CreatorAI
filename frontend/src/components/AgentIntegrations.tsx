'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bot, CheckCircle, Copy, Loader2, MessageCircle, Power, Save, Send, Trash2 } from 'lucide-react';

type Provider = 'facebook' | 'line' | 'telegram';

interface AgentIntegration {
  id: string;
  provider: Provider;
  display_name?: string;
  channel_id?: string;
  page_id?: string;
  bot_username?: string;
  app_id?: string;
  has_app_secret: boolean;
  has_channel_secret: boolean;
  has_access_token: boolean;
  has_bot_token: boolean;
  has_verify_token: boolean;
  webhook_url?: string;
  required_scopes?: string;
  notes?: string;
  is_active: boolean;
}

interface DraftIntegration {
  display_name: string;
  channel_id: string;
  page_id: string;
  bot_username: string;
  app_id: string;
  app_secret: string;
  channel_secret: string;
  access_token: string;
  bot_token: string;
  verify_token: string;
  required_scopes: string;
  notes: string;
  is_active: boolean;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'https://aicreateback.ibechamp.com';

const PROVIDERS: Array<{
  id: Provider;
  name: string;
  description: string;
  icon: typeof MessageCircle;
  fields: Array<keyof DraftIntegration>;
}> = [
  {
    id: 'facebook',
    name: 'Facebook Page',
    description: 'Connect a Facebook Page or Messenger app to this agent.',
    icon: MessageCircle,
    fields: ['display_name', 'page_id', 'app_id', 'app_secret', 'access_token', 'verify_token', 'required_scopes', 'notes'],
  },
  {
    id: 'line',
    name: 'LINE Official Account',
    description: 'Connect a LINE channel so this agent can be used with LINE messages.',
    icon: Send,
    fields: ['display_name', 'channel_id', 'channel_secret', 'access_token', 'required_scopes', 'notes'],
  },
  {
    id: 'telegram',
    name: 'Telegram Bot',
    description: 'Connect a Telegram bot token and username to this agent.',
    icon: Bot,
    fields: ['display_name', 'bot_username', 'bot_token', 'required_scopes', 'notes'],
  },
];

const FIELD_LABELS: Record<keyof DraftIntegration, string> = {
  display_name: 'Display name',
  channel_id: 'Channel ID',
  page_id: 'Page ID',
  bot_username: 'Bot username',
  app_id: 'App ID',
  app_secret: 'App secret',
  channel_secret: 'Channel secret',
  access_token: 'Access token',
  bot_token: 'Bot token',
  verify_token: 'Verify token',
  required_scopes: 'Required scopes / permissions',
  notes: 'Requirements / notes',
  is_active: 'Active',
};

const SECRET_FIELDS = new Set<keyof DraftIntegration>(['app_secret', 'channel_secret', 'access_token', 'bot_token', 'verify_token']);

const emptyDraft = (): DraftIntegration => ({
  display_name: '',
  channel_id: '',
  page_id: '',
  bot_username: '',
  app_id: '',
  app_secret: '',
  channel_secret: '',
  access_token: '',
  bot_token: '',
  verify_token: '',
  required_scopes: '',
  notes: '',
  is_active: false,
});

const draftFromIntegration = (integration?: AgentIntegration): DraftIntegration => ({
  ...emptyDraft(),
  display_name: integration?.display_name || '',
  channel_id: integration?.channel_id || '',
  page_id: integration?.page_id || '',
  bot_username: integration?.bot_username || '',
  app_id: integration?.app_id || '',
  app_secret: integration?.has_app_secret ? '••••••••' : '',
  channel_secret: integration?.has_channel_secret ? '••••••••' : '',
  access_token: integration?.has_access_token ? '••••••••' : '',
  bot_token: integration?.has_bot_token ? '••••••••' : '',
  verify_token: integration?.has_verify_token ? '••••••••' : '',
  required_scopes: integration?.required_scopes || '',
  notes: integration?.notes || '',
  is_active: integration?.is_active || false,
});

export default function AgentIntegrations({ agentId }: { agentId: string }) {
  const [integrations, setIntegrations] = useState<AgentIntegration[]>([]);
  const [drafts, setDrafts] = useState<Record<Provider, DraftIntegration>>({
    facebook: emptyDraft(),
    line: emptyDraft(),
    telegram: emptyDraft(),
  });
  const [activeProvider, setActiveProvider] = useState<Provider>('facebook');
  const [loading, setLoading] = useState(true);
  const [savingProvider, setSavingProvider] = useState<Provider | null>(null);
  const [copiedUrl, setCopiedUrl] = useState('');

  const activeConfig = PROVIDERS.find((provider) => provider.id === activeProvider) || PROVIDERS[0];
  const activeIntegration = useMemo(
    () => integrations.find((integration) => integration.provider === activeProvider),
    [integrations, activeProvider]
  );
  const activeDraft = drafts[activeProvider];

  useEffect(() => {
    loadIntegrations();
  }, [agentId]);

  const loadIntegrations = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API}/agents/${agentId}/integrations`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!response.ok) throw new Error('Failed to load integrations');
      const data: AgentIntegration[] = await response.json();
      setIntegrations(data);
      setDrafts({
        facebook: draftFromIntegration(data.find((item) => item.provider === 'facebook')),
        line: draftFromIntegration(data.find((item) => item.provider === 'line')),
        telegram: draftFromIntegration(data.find((item) => item.provider === 'telegram')),
      });
    } catch (err) {
      console.error('Failed to load integrations:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateDraft = (field: keyof DraftIntegration, value: string | boolean) => {
    setDrafts((prev) => ({
      ...prev,
      [activeProvider]: {
        ...prev[activeProvider],
        [field]: value,
      },
    }));
  };

  const saveIntegration = async () => {
    setSavingProvider(activeProvider);
    try {
      const body: Record<string, string | boolean> = { is_active: activeDraft.is_active };
      for (const [key, value] of Object.entries(activeDraft)) {
        if (key === 'is_active') continue;
        if (SECRET_FIELDS.has(key as keyof DraftIntegration) && value === '••••••••') continue;
        body[key] = value;
      }

      const response = await fetch(`${API}/agents/${agentId}/integrations/${activeProvider}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error('Failed to save integration');
      await loadIntegrations();
    } catch (err) {
      console.error('Failed to save integration:', err);
      alert('Could not save this channel.');
    } finally {
      setSavingProvider(null);
    }
  };

  const deleteIntegration = async () => {
    if (!confirm(`Remove ${activeConfig.name} from this agent?`)) return;
    setSavingProvider(activeProvider);
    try {
      await fetch(`${API}/agents/${agentId}/integrations/${activeProvider}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      await loadIntegrations();
    } catch (err) {
      console.error('Failed to delete integration:', err);
      alert('Could not remove this channel.');
    } finally {
      setSavingProvider(null);
    }
  };

  const copyWebhook = async (url: string) => {
    await navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    window.setTimeout(() => setCopiedUrl((current) => (current === url ? '' : current)), 1600);
  };

  return (
    <div className="bg-white dark:bg-gray-950 rounded-lg shadow p-6">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Channel Access</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Connect this agent to Facebook, LINE, or Telegram credentials. Webhook reply handling can be enabled after credentials are ready.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-gray-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading channels...
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
          <div className="space-y-2">
            {PROVIDERS.map((provider) => {
              const Icon = provider.icon;
              const connected = integrations.find((item) => item.provider === provider.id);
              const isActive = drafts[provider.id].is_active;
              return (
                <button
                  key={provider.id}
                  onClick={() => setActiveProvider(provider.id)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    activeProvider === provider.id
                      ? 'border-primary-500 bg-primary-50 text-primary-900 dark:bg-primary-900/20 dark:text-primary-100'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    <span className="font-medium">{provider.name}</span>
                    {isActive && <span className="ml-auto h-2 w-2 rounded-full bg-green-500" />}
                  </span>
                  <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                    {connected ? (isActive ? 'Active' : 'Inactive') : 'Not connected'}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">{activeConfig.name}</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{activeConfig.description}</p>
              </div>
              <button
                onClick={() => updateDraft('is_active', !activeDraft.is_active)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                  activeDraft.is_active
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                }`}
              >
                <Power className="h-4 w-4" />
                {activeDraft.is_active ? 'Active' : 'Inactive'}
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {activeConfig.fields.map((field) => {
                const isLong = field === 'notes' || field === 'required_scopes';
                const isSecret = SECRET_FIELDS.has(field);
                const inputClass = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100";
                return (
                  <label key={field} className={isLong ? 'md:col-span-2' : ''}>
                    <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{FIELD_LABELS[field]}</span>
                    {isLong ? (
                      <textarea
                        rows={3}
                        value={String(activeDraft[field] || '')}
                        onChange={(event) => updateDraft(field, event.target.value)}
                        className={inputClass}
                      />
                    ) : (
                      <input
                        type={isSecret ? 'password' : 'text'}
                        value={String(activeDraft[field] || '')}
                        onChange={(event) => updateDraft(field, event.target.value)}
                        className={inputClass}
                        placeholder={isSecret ? 'Paste secret or leave masked' : undefined}
                      />
                    )}
                  </label>
                );
              })}
            </div>

            {activeIntegration?.webhook_url && (
              <div className="mt-4 rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
                <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">Webhook URL for this channel</p>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1 text-xs text-gray-700 dark:bg-gray-950 dark:text-gray-300">
                    {activeIntegration.webhook_url}
                  </code>
                  <button
                    onClick={() => copyWebhook(activeIntegration.webhook_url || '')}
                    className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-white dark:border-gray-700 dark:hover:bg-gray-800"
                    title="Copy webhook URL"
                  >
                    {copiedUrl === activeIntegration.webhook_url ? <CheckCircle className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              {activeIntegration && (
                <button
                  onClick={deleteIntegration}
                  disabled={savingProvider === activeProvider}
                  className="flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </button>
              )}
              <button
                onClick={saveIntegration}
                disabled={savingProvider === activeProvider}
                className="flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
              >
                {savingProvider === activeProvider ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save channel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
