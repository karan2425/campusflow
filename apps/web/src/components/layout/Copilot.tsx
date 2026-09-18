'use client';

import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { IconSend, IconSparkles, IconX } from '../ui/Icons';
import { Badge, Button, Spinner } from '../ui/Primitives';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  provider?: string;
  latencyMs?: number;
  actions?: string[];
}

const STARTERS: Record<string, string[]> = {
  STUDENT: [
    'Which companies am I eligible for right now?',
    'How do I improve my match score for backend roles?',
    'What is my attendance percentage?',
    'Show my upcoming interviews',
  ],
  STAFF: [
    'How many students are placed so far?',
    'Which companies have hired the most students?',
    'What interviews are scheduled next week?',
    'Summarise this placement season',
  ],
};

/**
 * The AI copilot. The backend injects live campus context (the student's own
 * record, or placement-cell aggregates) into every prompt, so answers reference
 * real postings, deadlines and numbers rather than generic advice.
 */
export function Copilot({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isStudent = user?.role === 'STUDENT';
  const starters = isStudent ? STARTERS.STUDENT : STARTERS.STAFF;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || thinking) return;

    const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content: message };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setThinking(true);

    try {
      const history = messages.slice(-6).map((m) => ({ role: m.role, content: m.content }));
      const response = await api.aiChat(message, history);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: response.answer,
          provider: response.provider,
          latencyMs: response.latencyMs,
          actions: response.suggestedActions,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content:
            err instanceof ApiError && err.code === 'UPSTREAM_UNAVAILABLE'
              ? 'The AI service is not running. Start it with `cd apps/ai && uvicorn app.main:app --port 8000`, then ask again.'
              : err instanceof ApiError
                ? err.message
                : 'Something went wrong generating a response.',
        },
      ]);
    } finally {
      setThinking(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      <div className="absolute inset-0 bg-ink-900/30 backdrop-blur-sm" onClick={onClose} />

      <aside
        className="animate-slide-in-right relative flex h-full w-full max-w-md flex-col border-l border-ink-200 bg-white shadow-pop"
        role="dialog"
        aria-modal="true"
        aria-label="CampusFlow AI copilot"
      >
        <header className="flex items-center justify-between border-b border-ink-100 bg-gradient-to-r from-brand-600 to-violet-600 px-4 py-3 text-white">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15">
              <IconSparkles width={16} height={16} />
            </span>
            <div>
              <p className="text-sm font-semibold">CampusFlow Copilot</p>
              <p className="text-[11px] text-white/75">
                {isStudent ? 'Grounded in your live placement record' : 'Grounded in live campus data'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-white/80 hover:bg-white/15 hover:text-white" aria-label="Close copilot">
            <IconX width={16} height={16} />
          </button>
        </header>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {messages.length === 0 ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4">
                <p className="text-sm font-semibold text-brand-900">
                  Hi {user?.name?.split(' ')[0] ?? 'there'} 👋
                </p>
                <p className="mt-1 text-xs leading-relaxed text-brand-800">
                  I can see your {isStudent ? 'profile, applications, interviews and eligible openings' : 'placement pipeline, recruiter activity and campus statistics'}.
                  Ask me anything about it.
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Try asking</p>
                {starters.map((starter) => (
                  <button
                    key={starter}
                    onClick={() => void send(starter)}
                    className="w-full rounded-lg border border-ink-200 px-3 py-2 text-left text-sm text-ink-700 transition-colors hover:border-brand-300 hover:bg-brand-50"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <div key={message.id} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={`max-w-[90%] ${message.role === 'user' ? 'order-2' : ''}`}>
                  <div
                    className={`rounded-2xl px-3.5 py-2.5 ${
                      message.role === 'user'
                        ? 'rounded-br-sm bg-brand-600 text-sm text-white'
                        : 'rounded-bl-sm border border-ink-200 bg-ink-50 text-ink-800'
                    }`}
                  >
                    <p className="prose-ai">{message.content}</p>
                  </div>

                  {message.role === 'assistant' ? (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      {message.provider ? (
                        <Badge tone={message.provider === 'gemini' ? 'brand' : 'muted'}>
                          {message.provider === 'gemini' ? 'Gemini' : 'grounded mode'}
                        </Badge>
                      ) : null}
                      {message.latencyMs ? <span className="text-[11px] text-ink-400">{message.latencyMs} ms</span> : null}
                    </div>
                  ) : null}

                  {message.actions?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {message.actions.map((action) => (
                        <button
                          key={action}
                          onClick={() => void send(action)}
                          className="rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-ink-600 transition-colors hover:border-brand-300 hover:text-brand-700"
                        >
                          {action}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          )}

          {thinking ? (
            <div className="flex items-center gap-2 text-xs text-ink-500">
              <Spinner size={14} />
              Reading your campus data…
            </div>
          ) : null}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="border-t border-ink-100 bg-white px-3 py-3"
        >
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              rows={1}
              placeholder="Ask about placements, eligibility, interviews…"
              className="input max-h-32 min-h-[40px] resize-none py-2.5"
            />
            <Button type="submit" size="md" disabled={!input.trim() || thinking} aria-label="Send message">
              <IconSend width={16} height={16} />
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-ink-400">
            Answers use live CampusFlow data. Verify deadlines on the posting before acting.
          </p>
        </form>
      </aside>
    </div>
  );
}
