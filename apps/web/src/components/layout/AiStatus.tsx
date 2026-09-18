'use client';

import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { IconSparkles } from '../ui/Icons';
import { Tooltip } from '../ui/Primitives';

/**
 * Live AI-service indicator. Polls health so a developer/operator can see at a
 * glance whether the FastAPI service and FAISS index are up, and whether Gemini
 * or the deterministic fallback is answering.
 */
export function AiStatusPill({ compact = false }: { compact?: boolean }) {
  const { data, loading } = useAsync(() => api.aiHealth(), []);

  const reachable = data?.reachable ?? false;
  const online = 'bg-emerald-500';
  const offline = 'bg-rose-500';

  const label = loading
    ? 'Checking AI service'
    : reachable
      ? data?.geminiEnabled || data?.provider === 'gemini'
        ? 'Gemini connected'
        : 'AI online · offline mode'
      : 'AI service offline';

  const detail = loading
    ? 'Contacting the AI microservice…'
    : reachable
      ? `Provider: ${data?.provider ?? 'unknown'} · ${data?.indexSize ?? 0} candidates indexed${
          data?.geminiEnabled === false ? ' · set GEMINI_API_KEY for LLM prose' : ''
        }`
      : `FastAPI service unreachable at the configured AI_SERVICE_URL${data?.reason ? ` (${data.reason})` : ''}`;

  return (
    <Tooltip content={detail}>
      <span className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-2.5 py-1 text-xs font-semibold text-ink-600">
        <span className="relative flex h-2 w-2">
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${reachable ? online : offline}`} />
          <span className={`relative inline-flex h-2 w-2 rounded-full ${reachable ? online : offline}`} />
        </span>
        {compact ? <IconSparkles width={13} height={13} /> : label}
      </span>
    </Tooltip>
  );
}
