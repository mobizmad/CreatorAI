'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Brain, CheckCircle, Copy, Download, FileText, Globe, ImageIcon, Loader2, MessageSquare, Paperclip, Plus, Save, Send, Trash2, XCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  modelLabel?: string;
}

interface LocalSession {
  id: string;
  title: string;
  messages: Message[];
  last_message_at: string;
}

interface AttachedFile {
  id?: string;
  name: string;
  type: 'document' | 'image';
  text?: string;
  imageData?: string;
  chunkCount?: number;
  previewUrl?: string;
  size?: number;
  createdAt?: string;
}

const STORAGE_KEY = 'agentbuilder_default_chat_sessions';
const ATTACHMENT_HISTORY_KEY = 'agentbuilder_default_chat_attachments';
const API = process.env.NEXT_PUBLIC_API_URL || 'https://aicreateback.ibechamp.com';
const CHAT_MODELS = [
  { label: 'Free gemma4', provider: 'ollama', model: 'gemma4:latest', isFree: true },
  { label: 'Free llama3.2 3B', provider: 'ollama', model: 'llama3.2:3b', isFree: true },
  { label: 'Free qwen3 8B', provider: 'ollama', model: 'qwen3:8b', isFree: true },
  { label: 'Free gemma3', provider: 'ollama', model: 'gemma3:latest', isFree: true },
  { label: 'Free llava', provider: 'ollama', model: 'llava:latest', isFree: true },
  { label: 'Free kimi k2.5 cloud', provider: 'ollama', model: 'kimi-k2.5:cloud', isFree: true },
  { label: 'OpenAI gpt-4o-mini', provider: 'openai', model: 'gpt-4o-mini', isFree: false },
];
const VISION_MODEL = CHAT_MODELS.find((model) => model.provider === 'ollama' && model.model === 'llava:latest') || CHAT_MODELS[0];
const GEMMA_MODEL = CHAT_MODELS.find((model) => model.model === 'gemma4:latest') || CHAT_MODELS[0];
const CODING_MODEL = CHAT_MODELS.find((model) => model.model === 'qwen3:8b') || GEMMA_MODEL;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const isSimplePrompt = (message: string) => {
  const text = message.trim().toLowerCase();
  if (/^(hi|hello|hey|yo|sup|thanks|thank you|ok|okay|yes|no)[!.?\s]*$/.test(text)) return true;
  return /^[\d\s+\-*/().=xX?]+$/.test(text) && /\d/.test(text);
};

const shouldKeepHistoryMessage = (message: Message) => {
  const content = message.content.trim();
  if (!content) return false;
  if (content === 'Something went wrong while answering.') return false;
  if (content === 'Generation canceled.') return false;
  if (content.startsWith('🔍 Searching through web')) return false;
  if (content.includes('Chat API route is not available')) return false;
  if (content.includes("we've established that you're saying hello")) return false;
  if (content.includes("Are you looking for information on Adele")) return false;
  if (content.includes('I am still under development')) return false;
  return true;
};

const getErrorMessage = (details: string) => {
  if (details.trim().startsWith('<!DOCTYPE') || details.includes('__next_error__')) {
    return 'Chat API route is not available. Please refresh and try again.';
  }
  try {
    const parsed = JSON.parse(details);
    if (typeof parsed.detail === 'string') return parsed.detail;
    if (typeof parsed.error === 'string') return parsed.error;
  } catch {
    // Plain text backend responses are fine.
  }
  return details;
};

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

  chunks.forEach((chunk) => {
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

export default function DefaultChatInterface() {
  const [sessions, setSessions] = useState<LocalSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [selectedModel, setSelectedModel] = useState(CHAT_MODELS[0]);
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [attachmentHistory, setAttachmentHistory] = useState<AttachedFile[]>([]);
  const [compareAttachmentId, setCompareAttachmentId] = useState('');
  const [isExtractingFile, setIsExtractingFile] = useState(false);
  const [copiedMessageKey, setCopiedMessageKey] = useState<string | null>(null);
  const [savedMessageKeys, setSavedMessageKeys] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const [isLoaded, setIsLoaded] = useState(false);

  const currentSession = useMemo(
    () => sessions.find((session) => session.id === currentSessionId) || null,
    [sessions, currentSessionId]
  );

  const messages = currentSession?.messages || [];

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setSessions(parsed);
          setCurrentSessionId(parsed[0]?.id || null);
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    const savedAttachments = localStorage.getItem(ATTACHMENT_HISTORY_KEY);
    if (savedAttachments) {
      if (savedAttachments.length > 1_000_000) {
        localStorage.removeItem(ATTACHMENT_HISTORY_KEY);
        setAttachmentHistory([]);
        setIsLoaded(true);
        return;
      }

      try {
        const parsed = JSON.parse(savedAttachments);
        if (Array.isArray(parsed)) {
          const documentAttachments = parsed
            .filter((item) => item.type === 'document' && item.text)
            .slice(0, 5);
          setAttachmentHistory(documentAttachments);
          localStorage.setItem(ATTACHMENT_HISTORY_KEY, JSON.stringify(documentAttachments));
        }
      } catch {
        localStorage.removeItem(ATTACHMENT_HISTORY_KEY);
      }
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    }
  }, [sessions, isLoaded]);

  useEffect(() => {
    if (isLoaded) {
      const persistentAttachments = attachmentHistory.filter((item) => item.type === 'document' && item.text);
      localStorage.setItem(ATTACHMENT_HISTORY_KEY, JSON.stringify(persistentAttachments));
    }
  }, [attachmentHistory, isLoaded]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const createSession = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsLoading(false);

    const now = new Date().toISOString();
    const session: LocalSession = {
      id: crypto.randomUUID(),
      title: 'New conversation',
      messages: [],
      last_message_at: now,
    };
    setSessions((prev) => [session, ...prev]);
    setCurrentSessionId(session.id);
    setError(null);
  };

  const handleCancelGeneration = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsLoading(false);

    if (!currentSessionId) return;
    updateSessionMessages(currentSessionId, (prev) =>
      prev.map((message) =>
        message.isStreaming
          ? { ...message, content: message.content || 'Generation canceled.', isStreaming: false }
          : message
      )
    );
  };

  const ensureSession = () => {
    if (currentSessionId) return currentSessionId;

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const session: LocalSession = {
      id,
      title: 'New conversation',
      messages: [],
      last_message_at: now,
    };
    setSessions((prev) => [session, ...prev]);
    setCurrentSessionId(id);
    return id;
  };

  const updateSessionMessages = (sessionId: string, updater: (messages: Message[]) => Message[]) => {
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== sessionId) return session;

        const nextMessages = updater(session.messages);
        const firstUserMessage = nextMessages.find((message) => message.role === 'user')?.content;
        return {
          ...session,
          title: firstUserMessage ? firstUserMessage.slice(0, 60) : session.title,
          messages: nextMessages,
          last_message_at: new Date().toISOString(),
        };
      })
    );
  };

  const deleteSession = (sessionId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setSessions((prev) => prev.filter((session) => session.id !== sessionId));
    if (currentSessionId === sessionId) {
      const nextSession = sessions.find((session) => session.id !== sessionId);
      setCurrentSessionId(nextSession?.id || null);
    }
  };

  const rememberAttachment = (file: AttachedFile) => {
    if ((file.type === 'document' && !file.text) || (file.type === 'image' && !file.imageData)) return;

    setAttachmentHistory((prev) => {
      const nextFile = {
        ...file,
        id: file.id || crypto.randomUUID(),
        createdAt: file.createdAt || new Date().toISOString(),
      };
      return [nextFile, ...prev.filter((item) => item.name !== nextFile.name)].slice(0, 5);
    });
  };

  const clearAttachedFile = () => {
    setAttachedFile((current) => {
      if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
      return null;
    });
    setCompareAttachmentId('');
  };

  const formatFileSize = (size?: number) => {
    if (!size) return '';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const recommendModel = (message: string, file: AttachedFile | null, images: string[]) => {
    if (images.length > 0 || file?.type === 'image') return VISION_MODEL;
    if (file?.type === 'document') return GEMMA_MODEL;
    if (/\b(code|coding|bug|error|fix|python|typescript|javascript|sql|api|docker|function|component|html|css)\b/i.test(message)) {
      return CODING_MODEL;
    }
    return selectedModel || GEMMA_MODEL;
  };

  const messageKey = (message: Message, index: number) => `${index}-${message.content.slice(0, 24)}`;

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
      source: 'default-chat',
    });
    localStorage.setItem('agentbuilder_saved_answers', JSON.stringify(saved.slice(0, 50)));
    setSavedMessageKeys((prev) => ({ ...prev, [key]: true }));
  };

  const downloadMessage = (message: Message) => {
    const blob = createPdfBlob(message.content);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `agentbuilder-answer-${new Date().toISOString().slice(0, 10)}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleFileAttach = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || isLoading || isExtractingFile) return;

    setError(null);
    setIsExtractingFile(true);

    try {
      clearAttachedFile();
      if (IMAGE_TYPES.includes(file.type)) {
        const previewUrl = URL.createObjectURL(file);
        const formData = new FormData();
        formData.append('file', file);

        const ocrResponse = await fetch(`${API}/default-chat/attachments`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
          body: formData,
        });
        const ocrData = await ocrResponse.json().catch(() => ({}));

        if (ocrResponse.ok && ocrData.text) {
          const documentAttachment = {
            id: crypto.randomUUID(),
            name: ocrData.filename,
            type: 'document',
            text: ocrData.text,
            chunkCount: ocrData.chunk_count,
            previewUrl,
            size: file.size,
            createdAt: new Date().toISOString(),
          } satisfies AttachedFile;

          setAttachedFile(documentAttachment);
          rememberAttachment(documentAttachment);
          return;
        }

        const imageData = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = String(reader.result || '');
            const base64 = result.includes(',') ? result.split(',')[1] : result;
            resolve(base64);
          };
          reader.onerror = () => reject(new Error('Could not read this image.'));
          reader.readAsDataURL(file);
        });

        const imageAttachment = {
          id: crypto.randomUUID(),
          name: file.name,
          type: 'image',
          imageData,
          previewUrl,
          size: file.size,
          createdAt: new Date().toISOString(),
        } satisfies AttachedFile;

        setAttachedFile(imageAttachment);
        rememberAttachment(imageAttachment);
        return;
      }

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API}/default-chat/attachments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: formData,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || 'Could not read this file.');
      }

      const documentAttachment = {
        id: crypto.randomUUID(),
        name: data.filename,
        type: 'document',
        text: data.text,
        chunkCount: data.chunk_count,
        size: file.size,
        createdAt: new Date().toISOString(),
      } satisfies AttachedFile;

      setAttachedFile(documentAttachment);
      rememberAttachment(documentAttachment);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not read this file.';
      setError(message);
    } finally {
      setIsExtractingFile(false);
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && !attachedFile) || isLoading || isExtractingFile) return;

    const sessionId = ensureSession();
    const hasAttachment = Boolean(attachedFile);
    const plainUserMessage = input.trim() || 'Please summarize the attached file.';
    const compareAttachment = attachmentHistory.find((item) => item.id === compareAttachmentId);
    const shouldCompareDocuments =
      attachedFile?.type === 'document' &&
      compareAttachment?.type === 'document' &&
      Boolean(compareAttachment.text) &&
      compareAttachment.name !== attachedFile.name;
    const shouldCompareImages =
      attachedFile?.type === 'image' &&
      compareAttachment?.type === 'image' &&
      Boolean(compareAttachment.imageData) &&
      compareAttachment.name !== attachedFile.name;
    const userMessage = attachedFile?.type === 'document'
      ? shouldCompareDocuments
        ? `${plainUserMessage}\n\nCompare only the two attached files below. Do not use older chat messages or web search.\n\n--- FILE A: ${compareAttachment.name} ---\n${compareAttachment.text}\n--- END FILE A ---\n\n--- FILE B: ${attachedFile.name} ---\n${attachedFile.text}\n--- END FILE B ---`
        : `${plainUserMessage}\n\nUse only the attached file below for this answer. Do not use previous chat messages unless I explicitly ask you to compare files.\n\n--- ATTACHED FILE: ${attachedFile.name} ---\n${attachedFile.text}\n--- END ATTACHED FILE ---`
      : attachedFile?.type === 'image'
        ? shouldCompareImages
          ? `${plainUserMessage}\n\nCompare only the two attached images. Treat the first image as Image A (${compareAttachment.name}) and the second image as Image B (${attachedFile.name}). Do not use older chat messages or web search.`
          : `${plainUserMessage}\n\nUse only the attached image for this answer. Do not use previous chat messages unless I explicitly ask you to compare files.`
      : plainUserMessage;
    const visibleUserMessage = attachedFile
      ? shouldCompareDocuments || shouldCompareImages
        ? `${plainUserMessage}\n\nComparing: ${compareAttachment.name} vs ${attachedFile.name}`
        : `${plainUserMessage}\n\nAttached: ${attachedFile.name}`
      : plainUserMessage;
    const history = memoryEnabled && !hasAttachment && !isSimplePrompt(plainUserMessage)
      ? messages.filter(shouldKeepHistoryMessage).slice(-8)
      : [];
    const images =
      shouldCompareImages && compareAttachment?.imageData && attachedFile?.imageData
        ? [compareAttachment.imageData, attachedFile.imageData]
        : attachedFile?.type === 'image' && attachedFile.imageData
          ? [attachedFile.imageData]
          : [];
    const requestModel = recommendModel(plainUserMessage, attachedFile, images);

    setInput('');
    if (attachedFile?.previewUrl) URL.revokeObjectURL(attachedFile.previewUrl);
    setAttachedFile(null);
    setCompareAttachmentId('');
    setError(null);
    setIsLoading(true);

    updateSessionMessages(sessionId, (prev) => [
      ...prev,
      { role: 'user', content: visibleUserMessage },
      { role: 'assistant', content: '', isStreaming: true, modelLabel: requestModel.label },
    ]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(`${API}/default-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          message: userMessage,
          history,
          stream: true,
          provider: requestModel.provider,
          model: requestModel.model,
          web_search: hasAttachment || isSimplePrompt(plainUserMessage) ? false : webSearchEnabled,
          images,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const details = await response.text();
        throw new Error(getErrorMessage(details) || 'Failed to send message');
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/event-stream')) {
        const details = await response.text();
        throw new Error(getErrorMessage(details) || 'Chat API returned an invalid response.');
      }

      if (!response.body) {
        throw new Error('Backend did not return a response stream');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantResponse = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          const data = line.slice(6);
          if (data === '[DONE]') {
            window.dispatchEvent(new Event('token-balance-refresh'));
            updateSessionMessages(sessionId, (prev) =>
              prev.map((message, index) =>
                index === prev.length - 1 ? { ...message, isStreaming: false } : message
              )
            );
            return;
          }

          let parsed: any;
          try {
            parsed = JSON.parse(data);
          } catch {
            throw new Error(getErrorMessage(data) || 'Chat API returned an invalid stream.');
          }
          if (parsed.error) throw new Error(parsed.error);
          if (parsed.token) {
            assistantResponse += parsed.token;
            updateSessionMessages(sessionId, (prev) =>
              prev.map((message, index) =>
                index === prev.length - 1 ? { ...message, content: assistantResponse } : message
              )
            );
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        updateSessionMessages(sessionId, (prev) =>
          prev.map((message, index) =>
            index === prev.length - 1
              ? { ...message, content: message.content || 'Generation canceled.', isStreaming: false }
              : message
          )
        );
        return;
      }
      console.error('Default chat error:', err);
      const message = err instanceof Error ? err.message : 'Failed to send message. Please try again.';
      setError(message);
      updateSessionMessages(sessionId, (prev) =>
        prev.map((message, index) =>
          index === prev.length - 1
            ? { ...message, content: 'Something went wrong while answering.', isStreaming: false }
            : message
        )
      );
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setIsLoading(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const formatDate = (value: string) => {
    const date = new Date(value);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex h-full min-h-0 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <aside className="hidden md:flex w-72 shrink-0 flex-col border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
        <div className="p-3 border-b border-gray-200 dark:border-gray-800">
          <button
            onClick={createSession}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary-500 px-3 py-2 text-sm font-medium text-white hover:bg-primary-600"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>
        </div>

        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-800 flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary-500" />
          <span className="text-xs text-gray-600 dark:text-gray-400 flex-1">Memory</span>
          <button
            onClick={() => setMemoryEnabled((enabled) => !enabled)}
            className={`relative w-10 h-6 rounded-full transition-colors ${
              memoryEnabled ? 'bg-primary-500' : 'bg-gray-300'
            }`}
            aria-label="Toggle memory"
          >
            <span
              className={`absolute top-1 left-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                memoryEnabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-800 flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary-500" />
          <span className="text-xs text-gray-600 dark:text-gray-400 flex-1">Web Search</span>
          <button
            onClick={() => setWebSearchEnabled((enabled) => !enabled)}
            className={`relative w-10 h-6 rounded-full transition-colors ${
              webSearchEnabled ? 'bg-primary-500' : 'bg-gray-300'
            }`}
            aria-label="Toggle web search"
          >
            <span
              className={`absolute top-1 left-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                webSearchEnabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {sessions.length === 0 ? (
            <div className="p-4 text-center text-xs text-gray-400">No conversations yet</div>
          ) : (
            sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => setCurrentSessionId(session.id)}
                className={`group w-full flex items-start gap-2 border-b border-gray-100 dark:border-gray-800/50 p-3 text-left transition-colors hover:bg-white dark:hover:bg-gray-800 ${
                  currentSessionId === session.id ? 'bg-white dark:bg-gray-800 border-l-2 border-l-primary-500' : ''
                }`}
              >
                <MessageSquare className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-gray-800 dark:text-gray-200">{session.title}</span>
                  <span className="block text-xs text-gray-400 dark:text-gray-500 mt-0.5">{formatDate(session.last_message_at)}</span>
                </span>
                <span
                  onClick={(event) => deleteSession(session.id, event)}
                  className="opacity-0 group-hover:opacity-100 rounded p-1 text-gray-400 hover:text-red-500"
                >
                  <Trash2 className="w-3 h-3" />
                </span>
              </button>
            ))
          )}
        </div>
      </aside>

      <section className="flex-1 min-w-0 flex flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
          {messages.length === 0 ? (
            <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-center py-12">
              <h2 className="text-3xl font-semibold text-gray-900 dark:text-white">How can I help?</h2>
              <p className="mt-3 text-gray-500 dark:text-gray-400">
                Ask anything here, or use the sidebar to create and manage custom agents.
              </p>
              <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">Using {selectedModel.label}</p>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-6">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                      message.role === 'user'
                        ? 'bg-primary-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                    }`}
                  >
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
                            <div className="prose prose-sm max-w-none">
                              <ReactMarkdown>{content}</ReactMarkdown>
                              {message.isStreaming && !isThinking && (
                                <span className="inline-block h-4 w-2 bg-primary-500 align-middle animate-pulse" />
                              )}
                            </div>
                          )}
                          {!message.isStreaming && (
                            <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-gray-200/70 pt-2 text-xs dark:border-gray-700/70">
                              <button
                                onClick={() => copyMessage(message, index)}
                                className="flex items-center gap-1 rounded px-2 py-1 text-gray-500 hover:bg-gray-200 hover:text-gray-800 dark:hover:bg-gray-700 dark:hover:text-gray-100"
                              >
                                {copiedMessageKey === messageKey(message, index) ? <CheckCircle className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                                Copy
                              </button>
                              <button
                                onClick={() => saveMessage(message, index)}
                                className="flex items-center gap-1 rounded px-2 py-1 text-gray-500 hover:bg-gray-200 hover:text-gray-800 dark:hover:bg-gray-700 dark:hover:text-gray-100"
                              >
                                <Save className={`h-3.5 w-3.5 ${savedMessageKeys[messageKey(message, index)] ? 'text-green-600' : ''}`} />
                                Save
                              </button>
                              <button
                                onClick={() => downloadMessage(message)}
                                className="flex items-center gap-1 rounded px-2 py-1 text-gray-500 hover:bg-gray-200 hover:text-gray-800 dark:hover:bg-gray-700 dark:hover:text-gray-100"
                              >
                                <Download className="h-3.5 w-3.5" />
                                Download
                              </button>
                              {message.modelLabel && (
                                <span className="ml-auto text-gray-400">{message.modelLabel}</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })() : (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    )}
                  </div>
                </div>
              ))}
              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          {attachedFile && (
            <div className="mx-auto mb-2 max-w-3xl rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
              <div className="flex items-center gap-3">
                {attachedFile.previewUrl ? (
                  <img src={attachedFile.previewUrl} alt="" className="h-11 w-11 rounded-lg border border-gray-200 object-cover dark:border-gray-700" />
                ) : attachedFile.type === 'image' ? (
                  <ImageIcon className="h-5 w-5 text-primary-500" />
                ) : (
                  <FileText className="h-5 w-5 text-primary-500" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{attachedFile.name}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                    <span>{attachedFile.type === 'image' ? 'image' : attachedFile.previewUrl ? 'OCR text' : 'document'}</span>
                    {attachedFile.chunkCount ? <span>{attachedFile.chunkCount} chunks</span> : null}
                    {attachedFile.size ? <span>{formatFileSize(attachedFile.size)}</span> : null}
                    <span className="rounded-full bg-primary-50 px-2 py-0.5 text-primary-700 dark:bg-primary-900/30 dark:text-primary-200">isolated context</span>
                  </span>
                </span>
                <button
                  onClick={clearAttachedFile}
                  className="rounded-lg p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                  aria-label="Remove attachment"
                  title="Remove attachment"
                >
                  <XCircle className="h-4 w-4" />
                </button>
              </div>
              {attachmentHistory.some((item) => item.type === attachedFile.type && item.name !== attachedFile.name) && (
                <div className="mt-2 flex items-center gap-2 border-t border-gray-200 pt-2 dark:border-gray-700">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Compare with</span>
                  <select
                    value={compareAttachmentId}
                    onChange={(event) => setCompareAttachmentId(event.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                    aria-label="Compare with previous attachment"
                  >
                    <option value="">No comparison</option>
                    {attachmentHistory
                      .filter((item) => item.type === attachedFile.type && item.name !== attachedFile.name)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>
          )}
          <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-2 shadow-sm">
            <div className="hidden sm:flex min-h-[40px] shrink-0 items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3">
              {selectedModel.isFree && <span className="h-2 w-2 rounded-full bg-green-500" />}
              <select
                value={`${selectedModel.provider}:${selectedModel.model}`}
                onChange={(event) => {
                  const next = CHAT_MODELS.find((model) => `${model.provider}:${model.model}` === event.target.value);
                  if (next) setSelectedModel(next);
                }}
                className="max-w-[180px] bg-transparent text-xs font-medium text-gray-700 dark:text-gray-300 outline-none dark:bg-gray-800"
                aria-label="Select chat model"
              >
                {CHAT_MODELS.map((model) => (
                  <option key={`${model.provider}:${model.model}`} value={`${model.provider}:${model.model}`}>
                    {model.label}
                  </option>
                ))}
              </select>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.xlsx,.xls,.txt,.csv,.md,.png,.jpg,.jpeg,.webp,text/plain,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleFileAttach}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || isExtractingFile}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              aria-label="Attach file"
              title="Attach file"
            >
              {isExtractingFile ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
            </button>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message AgentBuilder..."
              rows={1}
              disabled={isLoading}
              className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent border-0 px-3 py-2 text-sm outline-none focus:ring-0 dark:text-white"
            />
            {isLoading ? (
              <button
                onClick={handleCancelGeneration}
                className="flex h-10 shrink-0 items-center gap-2 rounded-xl border border-red-200 px-3 text-sm font-medium text-red-600 hover:bg-red-50"
                aria-label="Cancel generation"
                title="Cancel generation"
              >
                <XCircle className="h-5 w-5" />
                <span className="hidden sm:inline">Cancel</span>
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim() && !attachedFile}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-500 text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Send message"
              >
                <Send className="h-5 w-5" />
              </button>
            )}
          </div>
          <div className="mx-auto mt-2 flex max-w-3xl sm:hidden">
            <select
              value={`${selectedModel.provider}:${selectedModel.model}`}
              onChange={(event) => {
                const next = CHAT_MODELS.find((model) => `${model.provider}:${model.model}` === event.target.value);
                if (next) setSelectedModel(next);
              }}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 outline-none focus:ring-2 focus:ring-primary-500"
              aria-label="Select chat model"
            >
              {CHAT_MODELS.map((model) => (
                <option key={`${model.provider}:${model.model}`} value={`${model.provider}:${model.model}`}>
                  {model.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>
    </div>
  );
}
