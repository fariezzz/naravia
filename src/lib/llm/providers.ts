import { cleanCharacterOutput, cleanRawOutput, cleanStoryOutput, estimateTokens } from './cleaner';
import { LLMMessage, LLMOutputMode, LLMProtocol, LLMResponse, ProviderEndpoint, StreamOutcome } from './types';

function applyOutputCleaner(raw: string, mode: LLMOutputMode = 'character'): string {
  if (mode === 'raw') return cleanRawOutput(raw);
  if (mode === 'story') return cleanStoryOutput(raw);
  return cleanCharacterOutput(raw);
}

export const DEFAULT_LLM_TIMEOUT_MS = 90_000;

const GOOGLE_SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' },
];

export function resolveProtocol(providerSetting: string, baseUrl: string): LLMProtocol {
  const urlLower = baseUrl.toLowerCase();

  if (providerSetting === 'openai' || providerSetting === 'openai_compatible') {
    return 'openai_compatible';
  }
  if (providerSetting === 'google' && !urlLower.includes('/openai')) {
    if (urlLower.includes('generativelanguage.googleapis.com') || !urlLower) {
      return 'google';
    }
  }
  if (providerSetting === 'ollama' || providerSetting === 'ollama_native') {
    if (urlLower.includes('/v1') || urlLower.includes('ollama.com')) {
      return 'openai_compatible';
    }
    return 'ollama_native';
  }

  if (urlLower.includes('generativelanguage.googleapis.com') && !urlLower.includes('/openai')) {
    return 'google';
  }

  if (
    (urlLower.includes(':11434') || urlLower.endsWith('/api/chat') || urlLower.endsWith('/api')) &&
    !urlLower.includes('/v1')
  ) {
    return 'ollama_native';
  }

  return 'openai_compatible';
}

function buildOpenAIEndpoint(baseUrl: string): string {
  let endpoint = baseUrl.trim().replace(/\/+$/, '');
  if (!endpoint) throw new Error('Base URL provider belum diisi di menu Pengaturan.');
  if (!endpoint.endsWith('/chat/completions')) {
    if (endpoint.endsWith('/v1') || endpoint.endsWith('/openai')) {
      endpoint = `${endpoint}/chat/completions`;
    } else {
      endpoint = `${endpoint}/v1/chat/completions`;
    }
  }
  return endpoint;
}

function inlineSystemMessages(messages: LLMMessage[]): LLMMessage[] {
  const sysText = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content.trim())
    .filter(Boolean)
    .join('\n\n');
  const nonSys = messages.filter((m) => m.role !== 'system');
  if (!sysText) return messages;
  if (nonSys.length > 0 && nonSys[0].role === 'user') {
    return [
      {
        role: 'user',
        content: `[INSTRUKSI SISTEM]\n${sysText}\n[AKHIR INSTRUKSI SISTEM]\n\n${nonSys[0].content}`,
      },
      ...nonSys.slice(1),
    ];
  }
  return [
    {
      role: 'user',
      content: `[INSTRUKSI SISTEM]\n${sysText}\n[AKHIR INSTRUKSI SISTEM]`,
    },
    ...nonSys,
  ];
}

function buildGoogleContents(messages: LLMMessage[], inlineSystem: boolean) {
  const systemText = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content.trim())
    .filter(Boolean)
    .join('\n\n');
  const conversationMessages = messages.filter((m) => m.role !== 'system');

  const rawTurns: Array<{ role: 'user' | 'model'; text: string }> = [];
  for (const msg of conversationMessages) {
    const mappedRole = msg.role === 'assistant' ? 'model' : 'user';
    const content = (msg.content || '').trim();
    if (!content) continue;
    if (rawTurns.length > 0 && rawTurns[rawTurns.length - 1].role === mappedRole) {
      rawTurns[rawTurns.length - 1].text += `\n\n${content}`;
    } else {
      rawTurns.push({ role: mappedRole, text: content });
    }
  }

  if (rawTurns.length === 0) {
    rawTurns.push({ role: 'user', text: 'Mulai.' });
  }

  if (inlineSystem && systemText) {
    if (rawTurns[0].role === 'user') {
      rawTurns[0].text = `[INSTRUKSI SISTEM]\n${systemText}\n[AKHIR INSTRUKSI SISTEM]\n\n${rawTurns[0].text}`;
    } else {
      rawTurns.unshift({
        role: 'user',
        text: `[INSTRUKSI SISTEM]\n${systemText}\n[AKHIR INSTRUKSI SISTEM]`,
      });
    }
  } else if (rawTurns[0].role === 'model') {
    rawTurns.unshift({ role: 'user', text: '(Mulai.)' });
  }

  return {
    systemText,
    contents: rawTurns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
  };
}

function combineSignals(timeoutMs: number, externalSignal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!externalSignal) return timeoutSignal;
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([externalSignal, timeoutSignal]);
  }
  return externalSignal;
}

export async function callProvider(
  endpointCfg: ProviderEndpoint,
  messages: LLMMessage[],
  params: { temperature: number; maxTokens: number; jsonMode?: boolean; outputMode?: LLMOutputMode; timeoutMs?: number }
): Promise<LLMResponse> {
  const timeoutMs = params.timeoutMs || DEFAULT_LLM_TIMEOUT_MS;
  const outputMode = params.outputMode || (params.jsonMode ? 'raw' : 'character');
  if (endpointCfg.protocol === 'google') {
    if (!endpointCfg.apiKey) {
      throw new Error(
        'API Key belum diatur. Silakan buka Panel Admin -> Sistem & AI untuk mengisi Base URL, Model, dan API Key provider.'
      );
    }
    return callGoogleAIStudio(messages, {
      baseUrl: endpointCfg.baseUrl,
      apiKey: endpointCfg.apiKey,
      model: endpointCfg.model,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
      jsonMode: params.jsonMode,
      outputMode,
      timeoutMs,
    });
  }
  if (endpointCfg.protocol === 'ollama_native') {
    return callOllama(messages, {
      baseUrl: endpointCfg.baseUrl,
      model: endpointCfg.model,
      apiKey: endpointCfg.apiKey,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
      jsonMode: params.jsonMode,
      outputMode,
      timeoutMs,
    });
  }
  return callOpenAICompatible(messages, {
    baseUrl: endpointCfg.baseUrl,
    apiKey: endpointCfg.apiKey,
    model: endpointCfg.model,
    temperature: params.temperature,
    maxTokens: params.maxTokens,
    jsonMode: params.jsonMode,
    outputMode,
    timeoutMs,
  });
}

async function callOpenAICompatible(
  messages: LLMMessage[],
  params: {
    baseUrl: string;
    apiKey: string;
    model: string;
    temperature: number;
    maxTokens: number;
    jsonMode?: boolean;
    outputMode: LLMOutputMode;
    timeoutMs: number;
  }
): Promise<LLMResponse> {
  const endpoint = buildOpenAIEndpoint(params.baseUrl);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (params.apiKey) headers['Authorization'] = `Bearer ${params.apiKey}`;

  const buildPayload = (inlineSystem: boolean, includeResponseFormat: boolean) => {
    const finalMessages = inlineSystem ? inlineSystemMessages(messages) : messages;
    const isGlm = params.model.toLowerCase().includes('glm');
    const effectiveTemp = isGlm ? Math.min(params.temperature, 0.7) : params.temperature;

    const body: Record<string, unknown> = {
      model: params.model,
      messages: finalMessages,
      temperature: effectiveTemp,
      max_tokens: params.maxTokens,
      top_p: isGlm ? 0.8 : 0.9,
    };

    if (isGlm) {
      body.presence_penalty = 0.1;
      body.frequency_penalty = 0.1;
    }

    if (includeResponseFormat && params.jsonMode) {
      body.response_format = { type: 'json_object' };
    }
    return body;
  };

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(params.timeoutMs),
      body: JSON.stringify(buildPayload(false, Boolean(params.jsonMode))),
    });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'TimeoutError';
    const msg = isTimeout ? `Waktu tunggu habis (${Math.round(params.timeoutMs / 1000)} detik)` : err instanceof Error ? err.message : String(err);
    throw new Error(`Tidak dapat menghubungi Base URL (${endpoint}): ${msg}`);
  }

  if (!res.ok && (res.status === 400 || res.status === 422)) {
    res = await fetch(endpoint, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(params.timeoutMs),
      body: JSON.stringify(buildPayload(true, false)),
    });
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Provider API Error (${res.status}) dari ${endpoint}: ${errText.slice(0, 300)}`);
  }

  const rawBody = await res.text();
  let data: any;
  try {
    data = JSON.parse(rawBody);
  } catch {
    throw new Error(
      `Provider mengembalikan respons non-JSON (HTTP ${res.status}): ${rawBody.replace(/\s+/g, ' ').slice(0, 180)}`
    );
  }
  const choice = data?.choices?.[0];
  const rawContent =
    choice?.message?.content ?? choice?.text ?? data?.message?.content ?? data?.response ?? '';

  const cleanedText = applyOutputCleaner(String(rawContent), params.outputMode);
  if (!cleanedText) {
    if (choice?.finish_reason === 'length') {
      throw new Error('Model kehabisan batas token sebelum menyelesaikan jawaban. Coba naikkan Max Tokens atau coba lagi.');
    }
    throw new Error('Provider mengembalikan balasan kosong. Periksa nama model atau coba kirim ulang.');
  }

  return {
    text: cleanedText,
    tokensIn: data?.usage?.prompt_tokens ?? estimateTokens(messages.map((m) => m.content).join('\n')),
    tokensOut: data?.usage?.completion_tokens ?? estimateTokens(cleanedText),
    modelUsed: data?.model || params.model,
    providerUsed: endpoint,
  };
}

async function callGoogleAIStudio(
  messages: LLMMessage[],
  params: {
    baseUrl?: string;
    apiKey: string;
    model: string;
    temperature: number;
    maxTokens: number;
    jsonMode?: boolean;
    outputMode: LLMOutputMode;
    timeoutMs: number;
  }
): Promise<LLMResponse> {
  const cleanBase = (params.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').trim().replace(/\/+$/, '');
  const baseWithVersion = cleanBase.includes('/v1') ? cleanBase : `${cleanBase}/v1beta`;

  const modelsToTry = [params.model];
  if (params.model === 'gemma-4-26b-a4b-it') {
    modelsToTry.push('gemma-3-27b-it', 'gemini-2.5-flash');
  }

  let lastError = '';

  for (const modelName of modelsToTry) {
    const isGemma = modelName.toLowerCase().includes('gemma');
    const tryStrategies = isGemma ? [true, false] : [false, true];

    for (const inlineSystem of tryStrategies) {
      const url = `${baseWithVersion}/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(
        params.apiKey
      )}`;

      const generationConfig: Record<string, unknown> = {
        temperature: params.temperature,
        maxOutputTokens: params.maxTokens,
        topP: 0.95,
      };
      if (params.jsonMode && !isGemma) {
        generationConfig.responseMimeType = 'application/json';
      }

      const { systemText, contents } = buildGoogleContents(messages, inlineSystem);
      const payload: Record<string, unknown> = {
        contents,
        generationConfig,
        safetySettings: GOOGLE_SAFETY_SETTINGS,
      };
      if (!inlineSystem && systemText) {
        payload.systemInstruction = { parts: [{ text: systemText }] };
      }

      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(params.timeoutMs),
          body: JSON.stringify(payload),
        });
      } catch (err) {
        const isTimeout = err instanceof Error && err.name === 'TimeoutError';
        throw new Error(
          isTimeout
            ? `Google AI Studio melewati batas waktu (${Math.round(params.timeoutMs / 1000)} detik).`
            : `Gagal menghubungi Google AI Studio: ${err instanceof Error ? err.message : String(err)}`
        );
      }

      if (!res.ok) {
        const errBody = await res.text();
        lastError = `Status ${res.status} (${modelName}): ${errBody}`;
        if (res.status === 400 && !inlineSystem) continue;
        if (res.status === 404) break;
        if (res.status === 401 || res.status === 403) {
          throw new Error(`API Key Google AI Studio ditolak (${res.status}). Periksa kembali kunci API Anda.`);
        }
        if (res.status === 429) {
          throw new Error('Batas permintaan (rate limit) Google AI Studio tercapai. Tunggu beberapa detik lalu coba kembali.');
        }
        throw new Error(`Gagal memanggil Google AI Studio (${res.status}): ${errBody.slice(0, 280)}`);
      }

      const data = await res.json();
      const promptBlockReason = data?.promptFeedback?.blockReason;
      if (promptBlockReason) {
        throw new Error(`Permintaan ditolak oleh batas keamanan penyedia model (Alasan: ${promptBlockReason}).`);
      }

      const candidate = data?.candidates?.[0];
      if (!candidate) {
        throw new Error('Model tidak mengembalikan kandidat balasan. Coba kirim ulang pesan Anda.');
      }
      if (candidate.finishReason && ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST'].includes(candidate.finishReason)) {
        throw new Error(`Balasan dihentikan oleh filter penyedia model (${candidate.finishReason}).`);
      }

      const textParts = (candidate?.content?.parts || []).map((p: { text?: string }) => p.text || '').join('');
      const cleanedText = applyOutputCleaner(textParts, params.outputMode);
      if (!cleanedText) {
        throw new Error('Model mengembalikan teks kosong. Silakan coba regenerate balasan.');
      }

      return {
        text: cleanedText,
        tokensIn: data?.usageMetadata?.promptTokenCount ?? estimateTokens(messages.map((m) => m.content).join('\n')),
        tokensOut: data?.usageMetadata?.candidatesTokenCount ?? estimateTokens(cleanedText),
        modelUsed: modelName,
        providerUsed: 'google',
      };
    }
  }

  throw new Error(`Gagal menghubungi Google AI Studio. Detail terakhir: ${lastError}`);
}

async function callOllama(
  messages: LLMMessage[],
  params: {
    baseUrl: string;
    model: string;
    apiKey: string;
    temperature: number;
    maxTokens: number;
    jsonMode?: boolean;
    outputMode: LLMOutputMode;
    timeoutMs: number;
  }
): Promise<LLMResponse> {
  const cleanUrl = params.baseUrl.trim().replace(/\/+$/, '');
  const isOpenAICompat = cleanUrl.endsWith('/v1') || cleanUrl.includes('ollama.com');

  if (isOpenAICompat) {
    const endpoint = `${cleanUrl}/chat/completions`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (params.apiKey) headers['Authorization'] = `Bearer ${params.apiKey}`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(params.timeoutMs),
      body: JSON.stringify({
        model: params.model,
        messages,
        temperature: params.temperature,
        max_tokens: params.maxTokens,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gagal memanggil endpoint Ollama OpenAI-compatible (${res.status}): ${errText.slice(0, 240)}`);
    }

    const data = await res.json();
    const cleaned = applyOutputCleaner(data?.choices?.[0]?.message?.content || '', params.outputMode);
    return {
      text: cleaned,
      tokensIn: data?.usage?.prompt_tokens ?? estimateTokens(messages.map((m) => m.content).join('\n')),
      tokensOut: data?.usage?.completion_tokens ?? estimateTokens(cleaned),
      modelUsed: params.model,
      providerUsed: 'ollama',
    };
  }

  const endpoint = `${cleanUrl}/api/chat`;
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(params.timeoutMs),
      body: JSON.stringify({
        model: params.model,
        messages,
        stream: false,
        ...(params.jsonMode ? { format: 'json' } : {}),
        options: { temperature: params.temperature, num_predict: params.maxTokens },
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Tidak dapat terhubung ke server Ollama lokal di ${cleanUrl}. Pastikan aplikasi Ollama sedang berjalan (${msg}).`);
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Ollama mengembalikan status ${res.status}: ${errText.slice(0, 240)}`);
  }

  const data = await res.json();
  const cleaned = applyOutputCleaner(data?.message?.content || '', params.outputMode);
  return {
    text: cleaned,
    tokensIn: data?.prompt_eval_count ?? estimateTokens(messages.map((m) => m.content).join('\n')),
    tokensOut: data?.eval_count ?? estimateTokens(cleaned),
    modelUsed: params.model,
    providerUsed: 'ollama',
  };
}

export async function* streamFromProvider(
  endpointCfg: ProviderEndpoint,
  messages: LLMMessage[],
  params: { temperature: number; maxTokens: number; signal?: AbortSignal; timeoutMs?: number }
): AsyncGenerator<string, StreamOutcome, void> {
  let accumulated = '';
  let modelUsed = endpointCfg.model;
  let tokensIn: number | undefined;
  let tokensOut: number | undefined;
  const signal = combineSignals(params.timeoutMs || 180_000, params.signal);

  if (endpointCfg.protocol === 'google') {
    const cleanBase = endpointCfg.baseUrl.replace(/\/+$/, '');
    const baseWithVer = cleanBase.includes('/v1') ? cleanBase : `${cleanBase}/v1beta`;
    const isGemma = endpointCfg.model.toLowerCase().includes('gemma');
    const url = `${baseWithVer}/models/${encodeURIComponent(endpointCfg.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(
      endpointCfg.apiKey
    )}`;

    const { systemText, contents } = buildGoogleContents(messages, isGemma);
    const body: Record<string, unknown> = {
      contents,
      safetySettings: GOOGLE_SAFETY_SETTINGS,
      generationConfig: {
        temperature: params.temperature,
        maxOutputTokens: params.maxTokens,
      },
    };
    if (!isGemma && systemText) {
      body.systemInstruction = { parts: [{ text: systemText }] };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Google API Stream Error (${res.status}): ${errText.slice(0, 200)}`);
    }
    if (!res.body) throw new Error('Response body stream tidak tersedia.');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6).trim();
            if (jsonStr && jsonStr !== '[DONE]') {
              try {
                const parsed = JSON.parse(jsonStr);
                if (parsed?.usageMetadata?.promptTokenCount) tokensIn = parsed.usageMetadata.promptTokenCount;
                if (parsed?.usageMetadata?.candidatesTokenCount) tokensOut = parsed.usageMetadata.candidatesTokenCount;
                const chunkText = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
                if (chunkText) {
                  accumulated += chunkText;
                  yield chunkText;
                }
              } catch {}
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  } else if (endpointCfg.protocol === 'ollama_native') {
    const cleanUrl = endpointCfg.baseUrl.replace(/\/+$/, '');
    const res = await fetch(`${cleanUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        model: endpointCfg.model,
        messages,
        stream: true,
        options: { temperature: params.temperature, num_predict: params.maxTokens },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Ollama Stream Error (${res.status}): ${errText.slice(0, 200)}`);
    }
    if (!res.body) throw new Error('Response body stream tidak tersedia.');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            try {
              const parsed = JSON.parse(trimmed);
              if (parsed.prompt_eval_count) tokensIn = parsed.prompt_eval_count;
              if (parsed.eval_count) tokensOut = parsed.eval_count;
              const chunk = parsed.message?.content || '';
              if (chunk) {
                accumulated += chunk;
                yield chunk;
              }
            } catch {}
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  } else {
    const endpoint = buildOpenAIEndpoint(endpointCfg.baseUrl);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (endpointCfg.apiKey) headers['Authorization'] = `Bearer ${endpointCfg.apiKey}`;

    const isGlm = endpointCfg.model.toLowerCase().includes('glm');
    const effectiveTemp = isGlm ? Math.min(params.temperature, 0.7) : params.temperature;

    const buildBody = (includeUsage: boolean, inlineSystem: boolean) => ({
      model: endpointCfg.model,
      messages: inlineSystem ? inlineSystemMessages(messages) : messages,
      temperature: effectiveTemp,
      max_tokens: params.maxTokens,
      stream: true,
      top_p: isGlm ? 0.8 : 0.9,
      ...(includeUsage ? { stream_options: { include_usage: true } } : {}),
      ...(isGlm ? { presence_penalty: 0.1, frequency_penalty: 0.1 } : {}),
    });

    let res = await fetch(endpoint, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify(buildBody(true, false)),
    });

    // Beberapa provider OpenAI-compatible lama menolak stream_options atau system role
    if (!res.ok && res.status === 400) {
      res = await fetch(endpoint, {
        method: 'POST',
        headers,
        signal,
        body: JSON.stringify(buildBody(false, false)),
      });
      if (!res.ok && res.status === 400) {
        res = await fetch(endpoint, {
          method: 'POST',
          headers,
          signal,
          body: JSON.stringify(buildBody(false, true)),
        });
      }
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI Stream Error (${res.status}): ${errText.slice(0, 200)}`);
    }
    if (!res.body) throw new Error('Response body stream tidak tersedia.');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.slice(6).trim();
            if (dataStr === '[DONE]') break;
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.model) modelUsed = parsed.model;
              if (parsed.usage?.prompt_tokens) tokensIn = parsed.usage.prompt_tokens;
              if (parsed.usage?.completion_tokens) tokensOut = parsed.usage.completion_tokens;
              const delta = parsed.choices?.[0]?.delta?.content || '';
              if (delta) {
                accumulated += delta;
                yield delta;
              }
            } catch {}
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  return { fullText: accumulated, modelUsed, tokensIn, tokensOut };
}
