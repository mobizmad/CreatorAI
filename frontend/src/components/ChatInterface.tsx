'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, AlertCircle, Plus, MessageSquare, Trash2, Brain, ThumbsUp, ThumbsDown, XCircle, Copy, Download, Save, CheckCircle, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { Source } from '@/lib/types';

interface ChatInterfaceProps {
  agentId: string;
  onCorrect?: (userMessage: string, agentResponse: string) => void;
}

interface Message {
  id?: string;               // RESTORED: Needed for ratings
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  rating?: number;           // RESTORED: Needed for ratings
  isStreaming?: boolean;     // NEW: For streaming UI
}

interface Session {
  id: string;
  title: string;
  created_at: string;
  last_message_at: string;
  message_count: number;
}

interface AgentHealth {
  model_ok: boolean;
  ollama_connected: boolean | null;
  knowledge_files_ready: boolean;
  knowledge_file_count: number;
  provider: string;
  model: string;
  message: string;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'https://aicreateback.ibechamp.com';

const getErrorMessage = (details: string) => {
  try {
    const parsed = JSON.parse(details);
    if (typeof parsed.detail === 'string') return parsed.detail;
    if (typeof parsed.error === 'string') return parsed.error;
  } catch {
    // Plain text backend responses are fine.
  }
  const lowered = details.toLowerCase();
  if (lowered.includes('ollama') && (lowered.includes('404') || lowered.includes('not found'))) {
    return 'This agent is using a model that is not available. I switched it to gemma4. Please try again.';
  }
  if (lowered.includes('host.docker.internal') || lowered.includes('connection') || lowered.includes('connect')) {
    return 'Ollama is not reachable. Please make sure Ollama is running, then try again.';
  }
  return details;
};

const generatedImageUrls = (sources?: Source[]) =>
  Array.from(
    new Set(
      (sources || [])
        .flatMap((source) => source.image_urls || [])
        .filter((url): url is string => Boolean(url))
    )
  );

const escapePdfText = (text: string) =>
  text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '?');

const wrapPdfLine = (line: string, max = 88) => {
  const words = line.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (!word) continue;
    if (`${current} ${word}`.trim().length > max) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  }
  return lines.length || current ? [...lines, current].filter(Boolean) : [''];
};

const createPdfBlob = (content: string) => {
  const lines = content.replace(/\r/g, '').split('\n').flatMap((line) => wrapPdfLine(line));
  const chunks: string[][] = [];
  for (let i = 0; i < lines.length; i += 44) chunks.push(lines.slice(i, i + 44));
  if (!chunks.length) chunks.push(['']);

  const objects: string[] = [
    '',
    '<< /Type /Catalog /Pages 2 0 R >>',
    '',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const pageRefs: string[] = [];

  chunks.forEach((chunk, pageIndex) => {
    const pageObjectId = objects.length;
    const contentObjectId = pageObjectId + 1;
    pageRefs.push(`${pageObjectId} 0 R`);
    const text = ['BT', '/F1 11 Tf', '14 TL', '50 760 Td', ...chunk.map((line, index) => `${index ? 'T* ' : ''}(${escapePdfText(line)}) Tj`), 'ET'].join('\n');
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectId} 0 R >>`);
    objects.push(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`);
  });

  objects[2] = `<< /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${pageRefs.length} >>`;
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 1; i < objects.length; i += 1) {
    offsets[i] = pdf.length;
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Blob([pdf], { type: 'application/pdf' });
};

export default function ChatInterface({ agentId, onCorrect }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [streamingEnabled, setStreamingEnabled] = useState(true); // NEW: Streaming toggle state
  const [health, setHealth] = useState<AgentHealth | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [copiedMessageKey, setCopiedMessageKey] = useState<string | null>(null);
  const [savedMessageKeys, setSavedMessageKeys] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const extractThinking = (text: string) => {
    let thinking = null;
    let content = text;
    let isThinking = false;

    const tagRegex = /<(thinking|thought|think)>([\s\S]*?)<\/\1>/i;
    const match = text.match(tagRegex);

    if (match) {
        thinking = match[2].trim();
        content = text.replace(tagRegex, '').trim();
    } else {
        const startMatch = text.match(/<(thinking|thought|think)>/i);
        if (startMatch) {
            const parts = text.split(startMatch[0]);
            content = parts[0].trim();
            thinking = parts.slice(1).join(startMatch[0]).trim();
            isThinking = true;
        }
    }

    return { thinking, content, isThinking };
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    fetchSessions();
    fetchHealth();
  }, [agentId]);

  const fetchHealth = async () => {
    setIsCheckingHealth(true);
    try {
      const response = await fetch(`${API}/agents/${agentId}/chat/health`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (response.ok) {
        setHealth(await response.json());
      }
    } catch (err) {
      console.error('Failed to check agent health:', err);
    } finally {
      setIsCheckingHealth(false);
    }
  };

  const fetchSessions = async () => {
    setIsLoadingSessions(true);
    try {
      const response = await fetch(
        `${API}/agents/${agentId}/chat/sessions`,
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
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setCurrentSessionId(null);
    setMessages([]);
    setError(null);
    setIsLoading(false);
  };

  const handleCancelGeneration = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsLoading(false);
    setMessages((prev) =>
      prev.map((msg) =>
        msg.isStreaming
          ? { ...msg, content: msg.content || 'Generation canceled.', isStreaming: false }
          : msg
      )
    );
  };

  const loadSession = async (sessionId: string) => {
    setCurrentSessionId(sessionId);
    setError(null);

    try {
      const response = await fetch(
        `${API}/agents/${agentId}/chat/sessions/${sessionId}/messages`,
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
            id: log.id,                 // RESTORED
            role: 'assistant',
            content: log.agent_response,
            sources: log.sources?.sources || [],
            rating: log.rating || 0,    // RESTORED
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
        `${API}/agents/${agentId}/chat/sessions/${sessionId}`,
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

  // RESTORED: Rating function
  const handleRateMessage = async (messageId: string, rating: number) => {
    try {
      const response = await fetch(
        `${API}/agents/${agentId}/chat/${messageId}/rate`,
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

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const url = `${API}/agents/${agentId}/chat`;
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      };
      const body = JSON.stringify({
        message: userMessage,
        session_id: memoryEnabled ? currentSessionId : null,
        stream: streamingEnabled, // NEW
      });

      if (streamingEnabled) {
        // Streaming mode
        await handleStreamingResponse(url, headers, body, userMessage, controller.signal);
      } else {
        // Non-streaming mode (Original behavior)
        const response = await fetch(url, { method: 'POST', headers, body, signal: controller.signal });

        if (!response.ok) {
          const errorDetails = await response.text();
          throw new Error(getErrorMessage(errorDetails) || 'Failed to send message');
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
            id: data.message_id, // RESTORED
            role: 'assistant',
            content: data.response,
            sources: data.sources,
            rating: 0,           // RESTORED
          },
        ]);
        window.dispatchEvent(new Event('token-balance-refresh'));
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      const message = err instanceof Error ? err.message : 'Failed to send message. Please try again.';
      setError(message);
      console.error('Chat error:', err);
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setIsLoading(false);
    }
  };

  const messageKey = (message: Message, index: number) => message.id || `${index}-${message.content.slice(0, 24)}`;

  const copyMessage = async (message: Message, index: number) => {
    const key = messageKey(message, index);
    await navigator.clipboard.writeText(message.content);
    setCopiedMessageKey(key);
    window.setTimeout(() => setCopiedMessageKey((current) => (current === key ? null : current)), 1800);
  };

  const saveMessage = (message: Message, index: number) => {
    const key = messageKey(message, index);
    const saved = JSON.parse(localStorage.getItem('agentbuilder_saved_answers') || '[]');
    saved.unshift({
      id: crypto.randomUUID(),
      content: message.content,
      created_at: new Date().toISOString(),
      source: 'agent-chat',
    });
    localStorage.setItem('agentbuilder_saved_answers', JSON.stringify(saved.slice(0, 50)));
    setSavedMessageKeys((prev) => ({ ...prev, [key]: true }));
  };

  const downloadMessage = (message: Message) => {
    const blob = createPdfBlob(message.content);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `agent-answer-${new Date().toISOString().slice(0, 10)}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleStreamingResponse = async (
    url: string,
    headers: any,
    body: string,
    userMessage: string,
    signal: AbortSignal
  ) => {
    // Add placeholder streaming message
    const placeholderIndex = messages.length + 1;
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: '', isStreaming: true, rating: 0 },
    ]);

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal,
    });

    if (!response.ok) {
      const errorDetails = await response.text();
      throw new Error(getErrorMessage(errorDetails) || 'Failed to send message');
    }

    if (!response.body) throw new Error('No response body');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullResponse = '';
    let sources: any[] = [];
    let responseSessionId: string | null = currentSessionId;
    let responseMessageId: string | undefined;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              // Stream complete
              setMessages((prev) =>
                prev.map((msg, idx) =>
                  idx === placeholderIndex
                    ? { ...msg, id: responseMessageId, content: fullResponse, sources, isStreaming: false }
                    : msg
                )
              );

              // Update session
              if (responseSessionId) {
                setCurrentSessionId(responseSessionId);
                fetchSessions();
              }
              window.dispatchEvent(new Event('token-balance-refresh'));
              return;
            }

            try {
              const parsed = JSON.parse(data);
              if (parsed.error) throw new Error(parsed.error);
              if (parsed.token) {
                fullResponse += parsed.token;
                setMessages((prev) =>
                  prev.map((msg, idx) =>
                    idx === placeholderIndex ? { ...msg, content: fullResponse } : msg
                  )
                );
              }
              if (parsed.sources) {
                sources = parsed.sources;
              }
              if (parsed.session_id) {
                responseSessionId = parsed.session_id;
                setCurrentSessionId(parsed.session_id);
              }
              if (parsed.message_id) {
                responseMessageId = parsed.message_id;
              }
            } catch (e) {
              if (e instanceof SyntaxError) continue;
              throw e;
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setMessages((prev) =>
          prev.map((msg, idx) =>
            idx === placeholderIndex
              ? { ...msg, content: fullResponse || 'Generation canceled.', isStreaming: false }
              : msg
          )
        );
        return;
      }
      console.error('Streaming error:', err);
      const message = err instanceof Error ? err.message : 'Error during streaming';
      setMessages((prev) =>
        prev.map((msg, idx) =>
          idx === placeholderIndex
            ? { ...msg, content: fullResponse || message, isStreaming: false }
            : msg
        )
      );
      throw err;
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
    <div className="flex h-full bg-white dark:bg-gray-900 rounded-lg shadow overflow-hidden text-gray-900 dark:text-gray-100">
      {/* Sidebar */}
      <div className="w-64 border-r border-gray-200 dark:border-gray-800 flex flex-col bg-gray-50 dark:bg-gray-900/50">
        <div className="p-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Conversations</span>
          <button
            onClick={startNewSession}
            className="p-1.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
            title="New conversation"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Memory toggle */}
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-800 flex items-center gap-2">
          <Brain className="w-4 h-4 text-purple-500" />
          <span className="text-xs text-gray-600 dark:text-gray-400 flex-1">Memory</span>
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
            <div className="text-center p-4 text-gray-400 text-xs">No conversations yet</div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => loadSession(session.id)}
                className={`group flex items-start gap-2 p-3 cursor-pointer border-b border-gray-100 dark:border-gray-800/50 hover:bg-white dark:hover:bg-gray-800 transition-colors ${
                  currentSessionId === session.id
                    ? 'bg-white dark:bg-gray-800 border-l-2 border-l-primary-500'
                    : ''
                }`}
              >
                <MessageSquare className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                    {session.title || 'New Conversation'}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
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

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Memory indicator */}
        {health && (
          <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/70 flex flex-wrap items-center gap-3 text-xs text-gray-600 dark:text-gray-300">
            <span className="font-medium">{health.provider} • {health.model}</span>
            <span className="flex items-center gap-1">
              <span className={`h-2 w-2 rounded-full ${health.model_ok ? 'bg-green-500' : 'bg-red-500'}`} />
              Model {health.model_ok ? 'OK' : 'needs check'}
            </span>
            {health.ollama_connected !== null && (
              <span className="flex items-center gap-1">
                <span className={`h-2 w-2 rounded-full ${health.ollama_connected ? 'bg-green-500' : 'bg-red-500'}`} />
                Ollama {health.ollama_connected ? 'connected' : 'offline'}
              </span>
            )}
            <span className="flex items-center gap-1">
              <span className={`h-2 w-2 rounded-full ${health.knowledge_files_ready ? 'bg-green-500' : 'bg-yellow-500'}`} />
              Knowledge files {health.knowledge_file_count}
            </span>
            <button
              onClick={fetchHealth}
              disabled={isCheckingHealth}
              className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-gray-500 hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-gray-800"
              title="Refresh health check"
            >
              {isCheckingHealth ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Refresh
            </button>
          </div>
        )}
        {memoryEnabled && currentSessionId && (
          <div className="px-4 py-1.5 bg-purple-50 dark:bg-purple-900/20 border-b border-purple-100 dark:border-purple-900/30 flex items-center gap-2">
            <Brain className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" />
            <span className="text-xs text-purple-700 dark:text-purple-300">
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
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                }`}
              >
                <div className="prose prose-sm max-w-none">
                  {message.role === 'assistant' ? (() => {
                    if (message.isStreaming && !message.content.trim()) {
                      return (
                        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                          <Loader2 className="h-4 w-4 animate-spin text-primary-500" />
                          <span>Thinking....</span>
                        </div>
                      );
                    }

                    const { thinking, content, isThinking } = extractThinking(message.content);
                    return (
                      <div className="flex flex-col">
                        {thinking && (
                          <details className="group mb-3 text-sm text-gray-500 dark:text-gray-400">
                            <summary className="flex cursor-pointer list-none items-center gap-2 font-medium hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                              <span className="flex items-center gap-2">
                                 <Brain className="h-4 w-4" />
                                 {isThinking ? "Thinking..." : "Thinking Process"}
                              </span>
                              <span className="text-[10px] transition-transform duration-200 group-open:rotate-180">▼</span>
                            </summary>
                            <div className="mt-2 rounded bg-gray-50 p-3 text-xs dark:bg-gray-800/50 whitespace-pre-wrap font-mono opacity-80 border-l-2 border-gray-300 dark:border-gray-600">
                               {thinking}
                               {isThinking && <span className="inline-block w-1.5 h-3 ml-1 bg-gray-400 animate-pulse" />}
                            </div>
                          </details>
                        )}
                        
                        {(content || !isThinking) && (
                          <>
                            <ReactMarkdown
                              components={{
                                img: ({ src, alt }) => (
                                  <a href={src || '#'} target="_blank" rel="noreferrer" className="mt-3 block">
                                    <img
                                      src={src || ''}
                                      alt={alt || 'Generated image'}
                                      className="max-h-96 w-full rounded-lg border border-gray-200 bg-white object-contain shadow-sm dark:border-gray-700"
                                    />
                                  </a>
                                ),
                              }}
                            >
                              {content}
                            </ReactMarkdown>
                            {message.isStreaming && !isThinking && (
                              <span className="inline-block w-2 h-4 ml-1 bg-primary-500 animate-pulse" />
                            )}
                          </>
                        )}
                      </div>
                    );
                  })() : (
                    <p>{message.content}</p>
                  )}
                </div>

                {/* Sources */}
                {message.sources && message.sources.length > 0 && !message.isStreaming && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    {generatedImageUrls(message.sources).filter((url) => !message.content.includes(url)).length > 0 && (
                      <div className="mb-3 grid gap-3">
                        {generatedImageUrls(message.sources).filter((url) => !message.content.includes(url)).map((url) => (
                          <a key={url} href={url} target="_blank" rel="noreferrer" className="block">
                            <img
                              src={url}
                              alt="Generated image"
                              className="max-h-96 w-full rounded-lg border border-gray-200 bg-white object-contain shadow-sm dark:border-gray-700"
                            />
                          </a>
                        ))}
                      </div>
                    )}
                    <p className="text-xs font-semibold mb-2">Sources:</p>
                    {message.sources.map((source, idx) => (
                      <div key={idx} className="text-xs mb-1">
                        <span className="font-medium">{source.source}</span>: {source.text}
                      </div>
                    ))}
                  </div>
                )}

                {/* RESTORED: Correct button & Rating Buttons */}
                {message.role === 'assistant' && !message.isStreaming && (
                  <div className="flex flex-wrap items-center justify-between gap-2 mt-2 pt-2 border-t border-gray-200/50 dark:border-gray-700/50">
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
                      <span /> /* Empty spacer */
                    )}

                    {/* RESTORED: Rating Buttons */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => copyMessage(message, index)}
                        className="p-1 rounded text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                        title="Copy"
                      >
                        {copiedMessageKey === messageKey(message, index) ? <CheckCircle className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => saveMessage(message, index)}
                        className="p-1 rounded text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                        title="Save"
                      >
                        <Save className={`w-4 h-4 ${savedMessageKeys[messageKey(message, index)] ? 'text-green-600' : ''}`} />
                      </button>
                      <button
                        onClick={() => downloadMessage(message)}
                        className="p-1 rounded text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleRateMessage(message.id!, 1)}
                        className={`p-1 rounded hover:bg-gray-200 transition-colors ${
                          message.rating === 1 ? 'text-green-600 bg-green-50' : 'text-gray-400'
                        }`}
                        disabled={!message.id}
                        title={!message.id ? "Rating available after refresh" : "Helpful"}
                      >
                        <ThumbsUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleRateMessage(message.id!, -1)}
                        className={`p-1 rounded hover:bg-gray-200 transition-colors ${
                          message.rating === -1 ? 'text-red-600 bg-red-50' : 'text-gray-400'
                        }`}
                        disabled={!message.id}
                        title={!message.id ? "Rating available after refresh" : "Not helpful"}
                      >
                        <ThumbsDown className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Show loader only if NOT streaming (fallback) */}
          {isLoading && !messages.some(m => m.isStreaming) && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-lg p-4 text-sm text-gray-500 dark:text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
                <span>Thinking....</span>
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
        <div className="border-t border-gray-200 dark:border-gray-800 p-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask your agent a question..."
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              disabled={isLoading}
            />
            {isLoading ? (
              <button
                onClick={handleCancelGeneration}
                className="flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-red-600 hover:bg-red-50"
                title="Cancel generation"
              >
                <XCircle className="w-5 h-5" />
                Cancel
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Send className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
