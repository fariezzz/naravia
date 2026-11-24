import { HttpError } from '../http';
import {
  acquireTokenBudgetSlot,
  assertTokenBudget,
  clampMaxTokens,
  clampTemperature,
  getSettingsMap,
  getSystemSettings,
  recordTokenUsage,
} from '../store';
import { assertSafeProviderUrlSync, isSameOriginUrl } from '../urlSafety';
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

  const canReusePrimaryKey = !fallbackBaseUrl || isSameOriginUrl(baseUrl, primary.baseUrl);
  const apiKey = (
    settings.fallback_llm_api_key ||
    process.env.FALLBACK_LLM_API_KEY ||
    (canReusePrimaryKey ? primary.apiKey : '')
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
  const settings = await getSettingsMap(options.userId);
  const isResearchAction = options.actionType === 'research';

  const primary = resolvePrimaryEndpoint(settings, isResearchAction);
  assertSafeProviderUrlSync(primary.baseUrl);
  const fallback = resolveFallbackEndpoint(settings, primary);
  if (fallback) assertSafeProviderUrlSync(fallback.baseUrl);

  const temperature = clampTemperature(options.temperature, clampTemperature(settings.temperature, 0.9));
  const maxTokens = clampMaxTokens(options.maxTokens, clampMaxTokens(settings.max_tokens, 1024));
  const timeoutMs = options.timeoutMs ?? (isResearchAction ? 120_000 : DEFAULT_LLM_TIMEOUT_MS);

  const estimatedPromptTokens = estimateTokens(messages.map((m) => m.content).join('\n'));
  const releaseSlot = await acquireTokenBudgetSlot(options.userId, estimatedPromptTokens + maxTokens);

  let result: LLMResponse;
  const outputMode = options.outputMode ?? (options.jsonMode ? 'raw' : 'character');
  try {
    try {
      result = await callProvider(primary, messages, {
        temperature,
        maxTokens,
        jsonMode: options.jsonMode,
        outputMode,
        timeoutMs,
        safetyFilterMode: settings.safety_filter_mode || 'standard',
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
          safetyFilterMode: settings.safety_filter_mode || 'standard',
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
  } finally {
    releaseSlot();
  }

  return result;
}

export async function* streamLLMResponse(
  messages: LLMMessage[],
  options: LLMCallOptions & { signal?: AbortSignal }
): AsyncGenerator<string, { fullText: string; modelUsed: string }, void> {
  const settings = await getSettingsMap(options.userId);

  const primary = resolvePrimaryEndpoint(settings, false);
  assertSafeProviderUrlSync(primary.baseUrl);
  const fallback = resolveFallbackEndpoint(settings, primary);
  if (fallback) assertSafeProviderUrlSync(fallback.baseUrl);

  const temperature = clampTemperature(options.temperature, clampTemperature(settings.temperature, 0.9));
  const maxTokens = clampMaxTokens(options.maxTokens, clampMaxTokens(settings.max_tokens, 1024));

  const estimatedPromptTokens = estimateTokens(messages.map((m) => m.content).join('\n'));
  const releaseSlot = await acquireTokenBudgetSlot(options.userId, estimatedPromptTokens + maxTokens);

  let emittedAny = false;
  let emittedText = '';
  let outcome: StreamOutcome = { fullText: '', modelUsed: primary.model };

  const runStream = async function* (endpoint: ProviderEndpoint) {
    const gen = streamFromProvider(endpoint, messages, {
      temperature,
      maxTokens,
      signal: options.signal,
      timeoutMs: options.timeoutMs,
      safetyFilterMode: settings.safety_filter_mode || 'standard',
    });
    while (true) {
      const step = await gen.next();
      if (step.done) {
        outcome = step.value;
        break;
      }
      emittedAny = true;
      emittedText += step.value;
      yield step.value;
    }
  };

  try {
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
  } finally {
    // Catat token bahkan saat stream dibatalkan klien (AbortError) bila sudah ada chunk yang terkirim
    if (emittedAny) {
      await recordTokenUsage({
        userId: options.userId,
        characterId: options.characterId || null,
        chatId: options.chatId || null,
        storyId: options.storyId || null,
        actionType: options.actionType || 'chat',
        tokensIn: outcome.tokensIn ?? estimatedPromptTokens,
        tokensOut: outcome.tokensOut ?? estimateTokens(outcome.fullText || emittedText),
      }).catch((err) => console.error('[llm] Gagal mencatat pemakaian token stream:', err));
    }
    releaseSlot();
  }

  return { fullText: outcome.fullText || emittedText, modelUsed: outcome.modelUsed };
}

/**
 * Menghasilkan vektor embedding opsional untuk memori semantik.
 * Mengembalikan null bila model embedding belum dikonfigurasi oleh admin atau kuota habis.
 */
export async function generateEmbedding(
  text: string,
  options?: { userId?: string }
): Promise<number[] | null> {
  const input = (text || '').trim().slice(0, 4000);
  if (!input) return null;

  if (options?.userId) {
    try {
      await assertTokenBudget(options.userId);
    } catch {
      return null;
    }
  }

  const settings = await getSystemSettings();
  const model = (settings.embedding_model || process.env.EMBEDDING_MODEL || '').trim();
  if (!model) return null;

  const primaryBaseUrl = (settings.llm_base_url || process.env.LLM_BASE_URL || '').trim().replace(/\/+$/, '');
  const configuredEmbeddingUrl = (settings.embedding_base_url || process.env.EMBEDDING_BASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const baseUrl = configuredEmbeddingUrl || primaryBaseUrl;
  if (!baseUrl) return null;

  try {
    assertSafeProviderUrlSync(baseUrl);
  } catch {
    return null;
  }

  // Hanya pakai ulang llm_api_key utama bila URL embedding sama origin-nya dengan llm_base_url
  const canReusePrimaryKey = !configuredEmbeddingUrl || isSameOriginUrl(baseUrl, primaryBaseUrl);
  const apiKey = (
    settings.embedding_api_key ||
    process.env.EMBEDDING_API_KEY ||
    (canReusePrimaryKey ? settings.llm_api_key || process.env.LLM_API_KEY || '' : '')
  ).trim();

  const protocol = resolveProtocol('auto', baseUrl);
  const recordUsage = () => {
    if (!options?.userId) return;
    recordTokenUsage({
      userId: options.userId,
      actionType: 'embedding',
      tokensIn: estimateTokens(input),
      tokensOut: 0,
    }).catch(() => undefined);
  };

  try {
    if (protocol === 'google') {
      if (!apiKey) return null;
      const baseWithVer = baseUrl.includes('/v1') ? baseUrl : `${baseUrl}/v1beta`;
      const url = `${baseWithVer}/models/${encodeURIComponent(model)}:embedContent`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          model: model.startsWith('models/') ? model : `models/${model}`,
          content: { parts: [{ text: input }] },
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const vec = data?.embedding?.values;
      if (Array.isArray(vec) && vec.length > 0) {
        recordUsage();
        return vec.map(Number);
      }
      return null;
    }

    if (protocol === 'ollama_native') {
      const res = await fetch(`${baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({ model, input }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const vec = data?.embeddings?.[0] || data?.embedding;
      if (Array.isArray(vec) && vec.length > 0) {
        recordUsage();
        return vec.map(Number);
      }
      return null;
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
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ model, input }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const vec = data?.data?.[0]?.embedding;
    if (Array.isArray(vec) && vec.length > 0) {
      recordUsage();
      return vec.map(Number);
    }
    return null;
  } catch {
    return null;
  }
}
