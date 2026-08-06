'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Star,
  MessageSquare,
  ArrowLeft,
  Bot,
  Loader2,
  Zap,
  TrendingUp,
  Clock,
  X,
  Send,
  ExternalLink,
} from 'lucide-react';

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────
interface MarketplaceAgent {
  id: string;
  name: string;
  description: string;
  llm_provider: string;
  llm_model: string;
  category: string;
  average_rating: number;
  review_count: number;
  created_at: string;
  owner_email: string;
}

interface Review {
  id: string;
  agent_id: string;
  reviewer_email: string;
  rating: number;
  comment: string;
  created_at: string;
}

// ─────────────────────────────────────────
// Constants
// ─────────────────────────────────────────
const CATEGORIES = ['All', 'General', 'Support', 'Education', 'HR', 'Sales', 'Legal', 'Finance', 'Medical', 'Creative'];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest', icon: Clock },
  { value: 'top_rated', label: 'Top Rated', icon: Star },
  { value: 'most_reviewed', label: 'Most Reviewed', icon: TrendingUp },
];

const CATEGORY_COLORS: Record<string, string> = {
  General: 'bg-slate-100 text-slate-700',
  Support: 'bg-blue-100 text-blue-700',
  Education: 'bg-green-100 text-green-700',
  HR: 'bg-purple-100 text-purple-700',
  Sales: 'bg-orange-100 text-orange-700',
  Legal: 'bg-red-100 text-red-700',
  Finance: 'bg-emerald-100 text-emerald-700',
  Medical: 'bg-pink-100 text-pink-700',
  Creative: 'bg-yellow-100 text-yellow-700',
};

// ─────────────────────────────────────────
// Star Rating Component
// ─────────────────────────────────────────
function StarRating({
  rating,
  interactive = false,
  onRate,
}: {
  rating: number;
  interactive?: boolean;
  onRate?: (r: number) => void;
}) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!interactive}
          onClick={() => onRate?.(star)}
          onMouseEnter={() => interactive && setHovered(star)}
          onMouseLeave={() => interactive && setHovered(0)}
          className={`transition-all ${interactive ? 'cursor-pointer hover:scale-110' : 'cursor-default'}`}
        >
          <Star
            className={`w-4 h-4 transition-colors ${
              star <= (hovered || rating)
                ? 'fill-amber-400 text-amber-400'
                : 'text-gray-200 fill-gray-200'
            }`}
          />
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────
// Agent Detail Modal
// ─────────────────────────────────────────
function AgentDetailModal({
  agent,
  onClose,
  token,
}: {
  agent: MarketplaceAgent;
  onClose: () => void;
  token: string | null;
}) {
  const router = useRouter();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [newRating, setNewRating] = useState(0);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [copied, setCopied] = useState(false);
  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

  useEffect(() => {
    fetch(`${API}/marketplace/${agent.id}/reviews`)
      .then((r) => r.json())
      .then((data) => {
        setReviews(Array.isArray(data) ? data : []);
        setLoadingReviews(false);
      })
      .catch(() => setLoadingReviews(false));
  }, [agent.id, API]);

  const handleSubmitReview = async () => {
    if (!token) { setSubmitError('You must be logged in to leave a review.'); return; }
    if (newRating === 0) { setSubmitError('Please select a star rating.'); return; }
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await fetch(`${API}/marketplace/${agent.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rating: newRating, comment: newComment }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to submit');
      setReviews((prev) => [data, ...prev.filter((r) => r.id !== data.id)]);
      setNewRating(0);
      setNewComment('');
    } catch (e: any) {
      setSubmitError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/widget/${agent.id}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const categoryColor = CATEGORY_COLORS[agent.category] || CATEGORY_COLORS['General'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-primary-100 flex-shrink-0">
                {agent.name[0].toUpperCase()}
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">{agent.name}</h2>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${categoryColor}`}>
                    {agent.category}
                  </span>
                  <span className="text-xs text-gray-400">{agent.owner_email}</span>
                  <span className="text-xs text-gray-300">•</span>
                  <span className="text-xs text-gray-400">{agent.llm_model}</span>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-3 mt-4">
            <StarRating rating={Math.round(agent.average_rating)} />
            <span className="font-semibold text-gray-900">{agent.average_rating.toFixed(1)}</span>
            <span className="text-sm text-gray-500">({agent.review_count} reviews)</span>
          </div>

          {agent.description && (
            <p className="mt-3 text-gray-600 text-sm leading-relaxed">{agent.description}</p>
          )}

          <div className="flex gap-3 mt-4">
            <button
              onClick={() => router.push(`/widget/${agent.id}`)}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white text-sm font-medium rounded-lg hover:bg-primary-600 transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
              Try Agent
            </button>
            <button
              onClick={handleCopyLink}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Leave a review */}
          <div className="bg-gray-50 rounded-xl p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Leave a Review</h3>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-500 mb-1">Your rating</p>
                <StarRating rating={newRating} interactive onRate={setNewRating} />
              </div>
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Share your experience (optional)..."
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none bg-white"
              />
              {submitError && <p className="text-xs text-red-600">{submitError}</p>}
              <button
                onClick={handleSubmitReview}
                disabled={submitting}
                className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white text-sm font-medium rounded-lg hover:bg-primary-600 disabled:opacity-50 transition-colors"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {submitting ? 'Submitting...' : 'Submit Review'}
              </button>
            </div>
          </div>

          {/* Reviews list */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">
              Reviews{reviews.length > 0 && <span className="text-gray-400 font-normal ml-1">({reviews.length})</span>}
            </h3>
            {loadingReviews ? (
              <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
            ) : reviews.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No reviews yet. Be the first!</p>
            ) : (
              <div className="space-y-3">
                {reviews.map((review) => (
                  <div key={review.id} className="p-4 bg-gray-50 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 text-xs font-bold">
                          {review.reviewer_email[0].toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-gray-700">{review.reviewer_email}</span>
                      </div>
                      <StarRating rating={review.rating} />
                    </div>
                    {review.comment && <p className="text-sm text-gray-600 leading-relaxed">{review.comment}</p>}
                    <p className="text-xs text-gray-400 mt-2">
                      {new Date(review.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// Agent Card
// ─────────────────────────────────────────
function MarketplaceCard({ agent, onClick }: { agent: MarketplaceAgent; onClick: () => void }) {
  const categoryColor = CATEGORY_COLORS[agent.category] || CATEGORY_COLORS['General'];
  return (
    <div
      onClick={onClick}
      className="group bg-white rounded-2xl border border-gray-100 p-5 cursor-pointer hover:border-primary-200 hover:shadow-lg hover:shadow-primary-50 transition-all duration-200"
    >
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-xl font-bold shadow-md shadow-primary-100 flex-shrink-0 group-hover:scale-105 transition-transform">
          {agent.name[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-gray-900 truncate group-hover:text-primary-600 transition-colors">
              {agent.name}
            </h3>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${categoryColor}`}>
              {agent.category}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1 line-clamp-2 leading-relaxed">
            {agent.description || 'No description provided.'}
          </p>
        </div>
      </div>
      <div className="mt-4 pt-4 border-t border-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StarRating rating={Math.round(agent.average_rating)} />
          <span className="text-sm font-semibold text-gray-700">{agent.average_rating.toFixed(1)}</span>
          <span className="text-xs text-gray-400">({agent.review_count})</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <Zap className="w-3 h-3" />
          {agent.llm_model}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────
export default function MarketplacePage() {
  const router = useRouter();
  const [agents, setAgents] = useState<MarketplaceAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [sortBy, setSortBy] = useState('newest');
  const [selectedAgent, setSelectedAgent] = useState<MarketplaceAgent | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

  useEffect(() => { setToken(localStorage.getItem('token')); }, []);

  const loadAgents = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ sort_by: sortBy });
      if (search) params.append('search', search);
      if (activeCategory !== 'All') params.append('category', activeCategory);
      const res = await fetch(`${API}/marketplace?${params}`);
      const data = await res.json();
      setAgents(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load marketplace:', err);
    } finally {
      setIsLoading(false);
    }
  }, [search, activeCategory, sortBy, API]);

  useEffect(() => {
    const debounce = setTimeout(loadAgents, 300);
    return () => clearTimeout(debounce);
  }, [loadAgents]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-primary-500 rounded-lg flex items-center justify-center">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900 leading-none">Agent Marketplace</h1>
                <p className="text-xs text-gray-500 mt-0.5">Discover community-built AI agents</p>
              </div>
            </div>
            {token && (
              <button
                onClick={() => router.push('/dashboard')}
                className="ml-auto text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                My Dashboard →
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero */}
        <div className="text-center mb-10">
          <h2 className="text-4xl font-extrabold text-gray-900 mb-3 tracking-tight">
            Find the Right Agent
          </h2>
          <p className="text-gray-500 text-lg max-w-xl mx-auto">
            Browse, try, and rate AI agents built by the community — for free.
          </p>
        </div>

        {/* Search + Sort */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search agents by name or description..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {SORT_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setSortBy(value)}
                className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                  sortBy === value
                    ? 'bg-primary-500 text-white border-primary-500'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex gap-2 flex-wrap mb-8">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeCategory === cat
                  ? 'bg-primary-500 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Bot className="w-10 h-10 text-gray-300" />
            </div>
            <h3 className="text-lg font-semibold text-gray-700 mb-1">No agents found</h3>
            <p className="text-gray-400 text-sm">
              {search ? `No results for "${search}". Try a different search.` : 'No agents have been published yet.'}
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-4">
              {agents.length} agent{agents.length !== 1 ? 's' : ''} available
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {agents.map((agent) => (
                <MarketplaceCard key={agent.id} agent={agent} onClick={() => setSelectedAgent(agent)} />
              ))}
            </div>
          </>
        )}
      </main>

      {selectedAgent && (
        <AgentDetailModal agent={selectedAgent} onClose={() => setSelectedAgent(null)} token={token} />
      )}
    </div>
  );
}
