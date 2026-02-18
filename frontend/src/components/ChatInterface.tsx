'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, AlertCircle, Plus, MessageSquare, Trash2, Brain, ThumbsUp, ThumbsDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { Source } from '@/lib/types';

interface ChatInterfaceProps {
  agentId: string;
  onCorrect?: (userMessage: string, agentResponse: string) => void;
}

interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  rating?: number;
}

interface Session {
  id: string;
  title: string;
  created_at: string;
  last_message_at: string;
  message_count: number;
}

export default function ChatInterface({ agentId, onCorrect }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    fetchSessions();
  }, [agentId]);

  const fetchSessions = async () => {
    setIsLoadingSessions(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/agents/${agentId}/chat/sessions`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );
      if (response.ok) {
        const data = await response.json();
        setSessions(data);
      }
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const startNewSession = () => {
    setCurrentSessionId(null);
    setMessages([]);
    setError(null);
  };

  const loadSession = async (sessionId: string) => {
    setCurrentSessionId(sessionId);
    setError(null);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/agents/${agentId}/chat/sessions/${sessionId}/messages`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const loadedMessages: Message[] = [];
        for (const log of data) {
          loadedMessages.push({ role: 'user', content: log.user_message });
          loadedMessages.push({
            role: 'assistant',
            content: log.agent_response,
            sources: log.sources?.sources || [],
          });
        }
        setMessages(loadedMessages);
      }
    } catch (err) {
      console.error('Failed to load session:', err);
    }
  };

  const deleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this conversation?')) return;

    try {
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/agents/${agentId}/chat/sessions/${sessionId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );

      setSessions(sessions.filter((s) => s.id !== sessionId));
      if (currentSessionId === sessionId) {
        startNewSession();
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  };

  const handleRateMessage = async (messageId: string, rating: number) => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/agents/${agentId}/chat/${messageId}/rate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
          body: JSON.stringify({ rating }),
        }
      );

      if (!response.ok) throw new Error('Failed to rate message');

      // Update UI locally to show the new rating
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, rating } : msg
        )
      );
    } catch (err) {
      console.error('Error rating message:', err);
    }
  };


  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setError(null);

    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/agents/${agentId}/chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
          body: JSON.stringify({
            message: userMessage,
            // Pass session_id if memory is enabled and we have a session
            session_id: memoryEnabled ? currentSessionId : null,
          }),
        }
      );

      if (!response.ok) {
        const errorDetails = await response.text();
        alert("🚨 BACKEND ERROR: " + errorDetails);
        throw new Error('Failed to send message');
      }

      const data = await response.json();

      if (data.session_id && !currentSessionId) {
        setCurrentSessionId(data.session_id);
        fetchSessions();
      } else if (data.session_id) {
        fetchSessions();
      }

      setMessages((prev) => [
        ...prev,
        {
          id: data.message_id,
          role: 'assistant',
          content: data.response,
          sources: data.sources,
          rating: 0,
        },
      ]);
    } catch (err) {
      setError('Failed to send message. Please try again.');
      console.error('Chat error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="flex h-full bg-white rounded-lg shadow overflow-hidden">

      {/* ── Sidebar: Conversation History ── */}
      <div className="w-64 border-r border-gray-200 flex flex-col bg-gray-50">
        {/* Sidebar header */}
        <div className="p-3 border-b border-gray-200 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">Conversations</span>
          <button
            onClick={startNewSession}
            className="p-1.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
            title="New conversation"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Memory toggle */}
        <div className="px-3 py-2 border-b border-gray-200 flex items-center gap-2">
          <Brain className="w-4 h-4 text-purple-500" />
          <span className="text-xs text-gray-600 flex-1">Memory</span>
            <button
              onClick={() => setMemoryEnabled(!memoryEnabled)}
              className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${
                memoryEnabled ? 'bg-purple-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${
                  memoryEnabled ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
        </div>

        {/* Sessions list */}
        <div className="flex-1 overflow-y-auto">
          {isLoadingSessions ? (
            <div className="flex justify-center p-4">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center p-4 text-gray-400 text-xs">
              No conversations yet
            </div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => loadSession(session.id)}
                className={`group flex items-start gap-2 p-3 cursor-pointer border-b border-gray-100 hover:bg-white transition-colors ${
                  currentSessionId === session.id ? 'bg-white border-l-2 border-l-primary-500' : ''
                }`}
              >
                <MessageSquare className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">
                    {session.title || 'New Conversation'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatTime(session.last_message_at)} · {session.message_count} msgs
                  </p>
                </div>
                <button
                  onClick={(e) => deleteSession(session.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 rounded"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Main Chat Area ── */}
      <div className="flex-1 flex flex-col">

        {/* Memory indicator */}
        {memoryEnabled && currentSessionId && (
          <div className="px-4 py-1.5 bg-purple-50 border-b border-purple-100 flex items-center gap-2">
            <Brain className="w-3.5 h-3.5 text-purple-500" />
            <span className="text-xs text-purple-700">
              Memory active — agent remembers this conversation
            </span>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 mt-8">
              <p className="text-lg">Start a conversation with your agent</p>
              <p className="text-sm mt-2">Ask questions about your knowledge base</p>
              {memoryEnabled && (
                <p className="text-xs mt-2 text-purple-500 flex items-center justify-center gap-1">
                  <Brain className="w-3 h-3" />
                  Memory is on — the agent will remember this chat
                </p>
              )}
            </div>
          )}

          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-4 ${
                  message.role === 'user'
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-100 text-gray-900'
                }`}
              >
                <div className="prose prose-sm max-w-none">
                  {message.role === 'assistant' ? (
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  ) : (
                    <p>{message.content}</p>
                  )}
                </div>

                {/* Sources */}
                {message.sources && message.sources.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-xs font-semibold mb-2">Sources:</p>
                    {message.sources.map((source, idx) => (
                      <div key={idx} className="text-xs mb-1">
                        <span className="font-medium">{source.source}</span>:{' '}
                        {source.text}
                      </div>
                    ))}
                  </div>
                )}

                {/* Correct button & Rating Buttons */}
                {message.role === 'assistant' && (
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200/50">
                    {onCorrect ? (
                      <button
                        onClick={() => {
                          const userMsg = messages[index - 1]?.content || '';
                          onCorrect(userMsg, message.content);
                        }}
                        className="text-xs underline hover:text-primary-600"
                      >
                        Correct this response
                      </button>
                    ) : (
                      <span /> /* Empty spacer if no correct button */
                    )}

                    {/* Rating Buttons */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleRateMessage(message.id!, 1)}
                        className={`p-1 rounded hover:bg-gray-200 transition-colors ${
                          message.rating === 1 ? 'text-green-600 bg-green-50' : 'text-gray-400'
                        }`}
                        disabled={!message.id}
                        title="Helpful"
                      >
                        <ThumbsUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleRateMessage(message.id!, -1)}
                        className={`p-1 rounded hover:bg-gray-200 transition-colors ${
                          message.rating === -1 ? 'text-red-600 bg-red-50' : 'text-gray-400'
                        }`}
                        disabled={!message.id}
                        title="Not helpful"
                      >
                        <ThumbsDown className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-lg p-4">
                <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
              <AlertCircle className="w-5 h-5" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t p-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask your agent a question..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              disabled={isLoading}
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
