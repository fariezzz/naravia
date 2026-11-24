import { HttpError } from '../http';
import { assertTokenBudget, getSettingsMap, getSystemSettings, recordTokenUsage } from '../store';
import { estimateTokens } from './cleaner';
import { callProvider, DEFAULT_LLM_TIMEOUT_MS, resolveProtocol, streamFromProvider } from './providers';
import { LLMCallOptions, LLMMessage, LLMResponse, ProviderEndpoint, StreamOutcome } from './types';

function resolvePrimaryEndpoint(settings: Record<string, string>, isResearchAction: boolean): ProviderEndpoint {
  const rawProvider = (settings.provider || 'auto').toLowerCase();
  const baseUrl = (
    (isResearchAction && settings.research_llm_base_url) ||
    settings.llm_base_url ||
    process.env.LLM_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    settings.ollama_base_url ||
    'https://generativelanguage.googleapis.com/v1beta'
  ).trim();

  const apiKey = (
    (isResearchAction && settings.research_llm_api_key) ||
    settings.llm_api_key ||
    settings.google_api_key ||
    settings.ollama_api_key ||
    process.env.LLM_API_KEY ||
    process.env.GOOGLE_AI_STUDIO_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    ''
  ).trim();

  const model = (
    (isResearchAction && settings.research_model) ||
    settings.model ||
    settings.ollama_model ||
    process.env.LLM_MODEL ||
    'gemma-4-26b-a4b-it'
  ).trim();

  return {
    protocol: resolveProtocol(rawProvider, baseUrl),
    baseUrl,
    apiKey,
    model,
  };
}

function resolveFallbackEndpoint(
  settings: Record<string, string>,
  primary: ProviderEndpoint
): ProviderEndpoint | null {
  const fallbackModel = (settings.fallback_model || process.env.FALLBACK_LLM_MODEL || '').trim();
  const fallbackBaseUrl = (settings.fallback_llm_base_url || process.env.FALLBACK_LLM_BASE_URL || '').trim();
  if (!fallbackModel && !fallbackBaseUrl) return null;

  const baseUrl = fallbackBaseUrl || primary.baseUrl;
  const model = fallbackModel || primary.model;
  if (baseUrl === primary.baseUrl && model === primary.model) return null;

  const apiKey = (
    settings.fallback_llm_api_key ||
    process.env.FALLBACK_LLM_API_KEY ||
    (fallbackBaseUrl ? '' : primary.apiKey)
  ).trim();

  return {
    protocol: resolveProtocol('auto', baseUrl),
    baseUrl,
    apiKey,
    model,
  };
}

function shouldFallback(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return false;
  if (err instanceof HttpError) return false;
  if (err instanceof Error && err.name === 'AbortError') return false;
  return true;
}

export async function generateLLMResponse(
  messages: LLMMessage[],
  options: LLMCallOptions
): Promise<LLMResponse> {
  await assertTokenBudget(options.userId);
  const settings = await getSettingsMap(options.userId);
  const isResearchAction = options.actionType === 'research';

  const primary = resolvePrimaryEndpoint(settings, isResearchAction);
  const fallback = resolveFallbackEndpoint(settings, primary);
  const temperature = options.temperature ?? (parseFloat(settings.temperature || '0.9') || 0.9);
  const maxTokens = options.maxTokens ?? (parseInt(settings.max_tokens || '1024', 10) || 1024);
  const timeoutMs = options.timeoutMs ?? (isResearchAction ? 120_000 : DEFAULT_LLM_TIMEOUT_MS);

  let result: LLMResponse;
  const outputMode = options.outputMode ?? (options.jsonMode ? 'raw' : 'character');
  try {
    result = await callProvider(primary, messages, {
      temperature,
      maxTokens,
      jsonMode: options.jsonMode,
      outputMode,
      timeoutMs,
    });
  } catch (primaryErr) {
    if (fallback && shouldFallback(primaryErr)) {
      console.warn(
        `[llm] Provider utama (${primary.model}) gagal, beralih ke fallback (${fallback.model}):`,
        primaryErr instanceof Error ? primaryErr.message : primaryErr
      );
      result = await callProvider(fallback, messages, {
        temperature,
        maxTokens,
        jsonMode: options.jsonMode,
        outputMode,
        timeoutMs,
      });
    } else {
      throw primaryErr;
    }
  }

  await recordTokenUsage({
    userId: options.userId,
    characterId: options.characterId || null,
    chatId: options.chatId || null,
    storyId: options.storyId || null,
    actionType: options.actionType || 'chat',
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
  });

  return result;
}

export async function* streamLLMResponse(
  messages: LLMMessage[],
  options: LLMCallOptions & { signal?: AbortSignal }
): AsyncGenerator<string, { fullText: string; modelUsed: string }, void> {
  await assertTokenBudget(options.userId);
  const settings = await getSettingsMap(options.userId);

  const primary = resolvePrimaryEndpoint(settings, false);
  const fallback = resolveFallbackEndpoint(settings, primary);
  const temperature = options.temperature ?? (parseFloat(settings.temperature || '0.9') || 0.9);
  const maxTokens = options.maxTokens ?? (parseInt(settings.max_tokens || '1024', 10) || 1024);

  let emittedAny = false;
  let outcome: StreamOutcome = { fullText: '', modelUsed: primary.model };

  const runStream = async function* (endpoint: ProviderEndpoint) {
    const gen = streamFromProvider(endpoint, messages, {
      temperature,
      maxTokens,
      signal: options.signal,
      timeoutMs: options.timeoutMs,
    });
    while (true) {
      const step = await gen.next();
      if (step.done) {
        outcome = step.value;
        break;
      }
      emittedAny = true;
      yield step.value;
    }
  };

  try {
    for await (const chunk of runStream(primary)) {
      yield chunk;
    }
  } catch (primaryErr) {
    // Hanya beralih ke fallback jika belum ada chunk yang terkirim ke klien
    if (!emittedAny && fallback && shouldFallback(primaryErr, options.signal)) {
      console.warn(
        `[llm] Stream utama (${primary.model}) gagal sebelum chunk pertama, beralih ke fallback (${fallback.model}):`,
        primaryErr instanceof Error ? primaryErr.message : primaryErr
      );
      for await (const chunk of runStream(fallback)) {
        yield chunk;
      }
    } else {
      throw primaryErr;
    }
  }

  await recordTokenUsage({
    userId: options.userId,
    characterId: options.characterId || null,
    chatId: options.chatId || null,
    storyId: options.storyId || null,
    actionType: options.actionType || 'chat',
    tokensIn: outcome.tokensIn ?? estimateTokens(messages.map((m) => m.content).join('\n')),
    tokensOut: outcome.tokensOut ?? estimateTokens(outcome.fullText),
  });

  return { fullText: outcome.fullText, modelUsed: outcome.modelUsed };
}

/**
 * Menghasilkan vektor embedding opsional untuk memori semantik.
 * Mengembalikan null bila model embedding belum dikonfigurasi oleh admin.
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const input = (text || '').trim().slice(0, 4000);
  if (!input) return null;

  const settings = await getSystemSettings();
  const model = (settings.embedding_model || process.env.EMBEDDING_MODEL || '').trim();
  if (!model) return null;

  const baseUrl = (
    settings.embedding_base_url ||
    process.env.EMBEDDING_BASE_URL ||
    settings.llm_base_url ||
    process.env.LLM_BASE_URL ||
    ''
  )
    .trim()
    .replace(/\/+$/, '');
  if (!baseUrl) return null;

  const apiKey = (
    settings.embedding_api_key ||
    process.env.EMBEDDING_API_KEY ||
    settings.llm_api_key ||
    process.env.LLM_API_KEY ||
    ''
  ).trim();

  const protocol = resolveProtocol('auto', baseUrl);

  try {
    if (protocol === 'google') {
      if (!apiKey) return null;
      const baseWithVer = baseUrl.includes('/v1') ? baseUrl : `${baseUrl}/v1beta`;
      const url = `${baseWithVer}/models/${encodeURIComponent(model)}:embedContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          model: model.startsWith('models/') ? model : `models/${model}`,
          content: { parts: [{ text: input }] },
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const vec = data?.embedding?.values;
      return Array.isArray(vec) && vec.length > 0 ? vec.map(Number) : null;
    }

    if (protocol === 'ollama_native') {
      const res = await fetch(`${baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({ model, input }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const vec = data?.embeddings?.[0] || data?.embedding;
      return Array.isArray(vec) && vec.length > 0 ? vec.map(Number) : null;
    }

    let endpoint = baseUrl;
    if (!endpoint.endsWith('/embeddings')) {
      endpoint =
        endpoint.endsWith('/v1') || endpoint.endsWith('/openai')
          ? `${endpoint}/embeddings`
          : `${endpoint}/v1/embeddings`;
    }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ model, input }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const vec = data?.data?.[0]?.embedding;
    return Array.isArray(vec) && vec.length > 0 ? vec.map(Number) : null;
  } catch {
    return null;
  }
}
