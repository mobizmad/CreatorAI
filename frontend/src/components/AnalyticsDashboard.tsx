'use client';

import { useState, useEffect } from 'react';
import {
  TrendingUp,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Key,
  Users,
  Activity,
  AlertCircle,
  Database,
} from 'lucide-react';

interface AnalyticsOverview {
  total_messages: number;
  total_sessions: number;
  average_rating: number;
  messages_today: number;
  messages_week: number;
  messages_month: number;
  total_api_usage: number;
  thumbs_up: number;
  thumbs_down: number;
  storage_used_mb: number;
  estimated_embedding_cost: number;
  total_chunks: number;
}

interface TimeSeriesData {
  date: string;
  count: number;
}

interface TopQuestion {
  question: string;
  count: number;
  avg_rating: number | null;
}

interface APIKeyUsage {
  key_name: string;
  key_prefix: string;
  usage_count: number;
  last_used_at: string | null;
  is_active: boolean;
}

interface AnalyticsDashboardProps {
  agentId: string;
}

export default function AnalyticsDashboard({ agentId }: AnalyticsDashboardProps) {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesData[]>([]);
  const [topQuestions, setTopQuestions] = useState<TopQuestion[]>([]);
  const [apiUsage, setApiUsage] = useState<APIKeyUsage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAnalytics();
  }, [agentId]);

  const fetchAnalytics = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const [overviewRes, timeSeriesRes, questionsRes, apiRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/agents/${agentId}/analytics/overview`, {
          headers,
        }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/agents/${agentId}/analytics/timeseries`, {
          headers,
        }),
        fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/agents/${agentId}/analytics/top-questions`,
          { headers }
        ),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/agents/${agentId}/analytics/api-usage`, {
          headers,
        }),
      ]);

      if (!overviewRes.ok) throw new Error('Failed to fetch analytics');

      const [overviewData, timeSeriesData, questionsData, apiData] = await Promise.all([
        overviewRes.json(),
        timeSeriesRes.json(),
        questionsRes.json(),
        apiRes.json(),
      ]);

      setOverview(overviewData);
      setTimeSeries(timeSeriesData.reverse()); // Oldest to newest for chart
      setTopQuestions(questionsData);
      setApiUsage(apiData);
    } catch (err) {
      setError('Failed to load analytics');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Activity className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="flex items-center justify-center h-64 text-red-500">
        <AlertCircle className="w-5 h-5 mr-2" />
        {error || 'Failed to load analytics'}
      </div>
    );
  }

  const ratingPercentage =
    overview.thumbs_up + overview.thumbs_down > 0
      ? Math.round((overview.thumbs_up / (overview.thumbs_up + overview.thumbs_down)) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* System Health & Cost Monitor */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          icon={<MessageSquare className="w-6 h-6" />}
          title="Total Messages"
          value={<span className="text-3xl font-bold text-gray-900">{overview.total_messages.toLocaleString()}</span>}
          subtitle={<span className="text-base text-gray-500">{overview.messages_today} today</span>}
          color="blue"
        />
        <StatCard
          icon={<Users className="w-6 h-6" />}
          title="Conversations"
          value={<span className="text-3xl font-bold text-gray-900">{overview.total_sessions.toLocaleString()}</span>}
          subtitle={<span className="text-base text-gray-500">{overview.messages_week} this week</span>}
          color="green"
        />
        <StatCard
          icon={<ThumbsUp className="w-6 h-6" />}
          title="Satisfaction"
          value={<span className="text-3xl font-bold text-gray-900">{ratingPercentage}%</span>}
          subtitle={<span className="text-base text-gray-500">{overview.thumbs_up} 👍 / {overview.thumbs_down} 👎</span>}
          color={ratingPercentage >= 70 ? 'green' : ratingPercentage >= 50 ? 'yellow' : 'red'}
        />
        <StatCard
          icon={<Key className="w-6 h-6" />}
          title="API Calls"
          value={<span className="text-3xl font-bold text-gray-900">{overview.total_api_usage.toLocaleString()}</span>}
          subtitle={<span className="text-base text-gray-500">{overview.messages_month} this month</span>}
          color="purple"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <StatCard
          icon={<Database className="w-6 h-6" />}
          title="Vector Storage"
          value={<span className={`text-3xl font-bold ${overview.storage_used_mb > 500 ? 'text-red-600' : 'text-gray-900'}`}>{overview.storage_used_mb} MB</span>}
          subtitle={<span className="text-base text-gray-500">Disk space used by FAISS</span>}
          color="yellow"
        />
        <StatCard
          icon={<Activity className="w-6 h-6" />}
          title="Embedding Chunks"
          value={<span className="text-3xl font-bold text-gray-900">{overview.total_chunks.toLocaleString()}</span>}
          subtitle={<span className="text-base text-gray-500">Total segments indexed</span>}
          color="purple"
        />
        <StatCard
          icon={<TrendingUp className="w-6 h-6" />}
          title="Estimated Cost"
          value={<span className="text-3xl font-bold text-gray-900">${overview.estimated_embedding_cost}</span>}
          subtitle={<span className="text-base text-gray-500">OpenAI Embedding spend</span>}
          color="green"
        />
      </div>

      {/* Time Series Chart */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary-500" />
          Message Activity (Last 30 Days)
        </h3>
        <div className="h-64 flex items-end justify-between gap-1">
          {timeSeries.length === 0 ? (
            <div className="w-full flex items-center justify-center text-gray-400">
              No data available
            </div>
          ) : (
            timeSeries.map((data, idx) => {
              const maxCount = Math.max(...timeSeries.map((d) => d.count));
              const height = maxCount > 0 ? (data.count / maxCount) * 100 : 0;
              return (
                <div
                  key={idx}
                  className="flex-1 bg-primary-500 rounded-t hover:bg-primary-600 transition-colors relative group"
                  style={{ height: `${height}%`, minHeight: data.count > 0 ? '4px' : '0' }}
                  title={`${data.date}: ${data.count} messages`}
                >
                  <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                    {data.date}: {data.count}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Questions */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Most Asked Questions</h3>
          <div className="space-y-3">
            {topQuestions.length === 0 ? (
              <p className="text-gray-400 text-sm">No questions yet</p>
            ) : (
              topQuestions.map((q, idx) => (
                <div key={idx} className="flex items-start justify-between gap-4 pb-3 border-b">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{q.question}</p>
                    <p className="text-xs text-gray-500">Asked {q.count} times</p>
                  </div>
                  {q.avg_rating !== null && (
                    <div
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        q.avg_rating >= 0.5
                          ? 'bg-green-100 text-green-700'
                          : q.avg_rating >= 0
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {q.avg_rating > 0 ? '👍' : '👎'} {q.avg_rating.toFixed(1)}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* API Key Usage */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">API Key Usage</h3>
          <div className="space-y-3">
            {apiUsage.length === 0 ? (
              <p className="text-gray-400 text-sm">No API keys yet</p>
            ) : (
              apiUsage.map((key, idx) => (
                <div key={idx} className="flex items-center justify-between pb-3 border-b">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{key.key_name}</p>
                    <p className="text-xs text-gray-500">
                      {key.key_prefix}... •{' '}
                      {key.last_used_at
                        ? new Date(key.last_used_at).toLocaleDateString()
                        : 'Never used'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-700">
                      {key.usage_count.toLocaleString()}
                    </span>
                    <span
                      className={`w-2 h-2 rounded-full ${
                        key.is_active ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  title: string;
  value: string;
  subtitle: string;
  color: 'blue' | 'green' | 'purple' | 'red' | 'yellow';
}

function StatCard({ icon, title, value, subtitle, color }: StatCardProps) {
  const colorClasses = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    purple: 'bg-purple-100 text-purple-600',
    red: 'bg-red-100 text-red-600',
    yellow: 'bg-yellow-100 text-yellow-600',
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>{icon}</div>
        <span className="text-sm font-medium text-gray-600">{title}</span>
      </div>
      <div className="text-3xl font-bold text-gray-900 mb-1">{value}</div>
      <div className="text-sm text-gray-500">{subtitle}</div>
    </div>
  );
}
