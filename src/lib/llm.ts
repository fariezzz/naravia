import { getSettingsMap, recordTokenUsage } from './db';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMCallOptions {
  temperature?: number;
  maxTokens?: number;
  characterId?: string | null;
  chatId?: string | null;
  actionType?: 'chat' | 'generate' | 'research' | 'summary' | 'memory' | 'group_chat' | 'preview';
  jsonMode?: boolean;
}

export interface LLMResponse {
  text: string;
  tokensIn: number;
  tokensOut: number;
  modelUsed: string;
  providerUsed: string;
}

function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export async function generateLLMResponse(
  messages: LLMMessage[],
  options: LLMCallOptions = {}
): Promise<LLMResponse> {
  const settings = getSettingsMap();
  const rawProvider = (settings.provider || 'auto').toLowerCase();
  const baseUrl = (
    settings.llm_base_url ||
    process.env.LLM_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    settings.ollama_base_url ||
    'https://generativelanguage.googleapis.com/v1beta'
  ).trim();

  const apiKey = (
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
    settings.model ||
    settings.ollama_model ||
    process.env.LLM_MODEL ||
    'gemma-4-26b-a4b-it'
  ).trim();

  const temperature = options.temperature ?? (parseFloat(settings.temperature || '0.9') || 0.9);
  const maxTokens = options.maxTokens ?? (parseInt(settings.max_tokens || '1024', 10) || 1024);

  const detectedProtocol = resolveProtocol(rawProvider, baseUrl);
  let result: LLMResponse;

  if (detectedProtocol === 'google') {
    if (!apiKey) {
      throw new Error(
        'API Key belum diatur. Silakan buka menu Pengaturan -> Model AI & Konteks untuk mengisi Base URL, Model, dan API Key provider Anda.'
      );
    }
    result = await callGoogleAIStudio(messages, {
      baseUrl,
      apiKey,
      model,
      temperature,
      maxTokens,
      jsonMode: options.jsonMode,
    });
  } else if (detectedProtocol === 'ollama_native') {
    result = await callOllama(messages, {
      baseUrl,
      model,
      apiKey,
      temperature,
      maxTokens,
      jsonMode: options.jsonMode,
    });
  } else {
    result = await callOpenAICompatible(messages, {
      baseUrl,
      apiKey,
      model,
      temperature,
      maxTokens,
      jsonMode: options.jsonMode,
    });
  }

  recordTokenUsage({
    characterId: options.characterId || null,
    chatId: options.chatId || null,
    actionType: options.actionType || 'chat',
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
  });

  return result;
}

function resolveProtocol(
  providerSetting: string,
  baseUrl: string
): 'openai_compatible' | 'google' | 'ollama_native' {
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

  if (
    urlLower.includes('generativelanguage.googleapis.com') &&
    !urlLower.includes('/openai')
  ) {
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

async function callOpenAICompatible(
  messages: LLMMessage[],
  params: {
    baseUrl: string;
    apiKey: string;
    model: string;
    temperature: number;
    maxTokens: number;
    jsonMode?: boolean;
  }
): Promise<LLMResponse> {
  let endpoint = params.baseUrl.trim().replace(/\/+$/, '');
  if (!endpoint) {
    throw new Error('Base URL provider belum diisi di menu Pengaturan.');
  }

  if (!endpoint.endsWith('/chat/completions')) {
    if (endpoint.endsWith('/v1') || endpoint.endsWith('/openai')) {
      endpoint = `${endpoint}/chat/completions`;
    } else {
      endpoint = `${endpoint}/v1/chat/completions`;
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (params.apiKey) {
    headers['Authorization'] = `Bearer ${params.apiKey}`;
  }

  const buildPayload = (inlineSystem: boolean, includeResponseFormat: boolean) => {
    let finalMessages = messages;
    if (inlineSystem) {
      const sysText = messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content.trim())
        .filter(Boolean)
        .join('\n\n');
      const nonSys = messages.filter((m) => m.role !== 'system');
      if (sysText) {
        if (nonSys.length > 0 && nonSys[0].role === 'user') {
          finalMessages = [
            {
              role: 'user',
              content: `[INSTRUKSI SISTEM DAN PERAN KARAKTER]\n${sysText}\n[AKHIR INSTRUKSI SISTEM]\n\n${nonSys[0].content}`,
            },
            ...nonSys.slice(1),
          ];
        } else {
          finalMessages = [
            {
              role: 'user',
              content: `[INSTRUKSI SISTEM DAN PERAN KARAKTER]\n${sysText}\n[AKHIR INSTRUKSI SISTEM]`,
            },
            ...nonSys,
          ];
        }
      }
    }

    const body: Record<string, unknown> = {
      model: params.model,
      messages: finalMessages,
      temperature: params.temperature,
      max_tokens: params.maxTokens,
    };

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
      body: JSON.stringify(buildPayload(false, Boolean(params.jsonMode))),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Tidak dapat menghubungi Base URL (${endpoint}): ${msg}`);
  }

  if (!res.ok && res.status === 400) {
    res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(buildPayload(true, false)),
    });
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Provider API Error (${res.status}) dari ${endpoint}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const choice = data?.choices?.[0];
  const rawContent =
    choice?.message?.content ??
    choice?.text ??
    data?.message?.content ??
    data?.response ??
    '';

  const cleanedText = cleanCharacterOutput(String(rawContent));
  if (!cleanedText) {
    throw new Error('Provider mengembalikan balasan kosong. Periksa nama model atau coba kirim ulang.');
  }

  return {
    text: cleanedText,
    tokensIn:
      data?.usage?.prompt_tokens ??
      estimateTokens(messages.map((m) => m.content).join('\n')),
    tokensOut:
      data?.usage?.completion_tokens ??
      estimateTokens(cleanedText),
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
  }
): Promise<LLMResponse> {
  const cleanBase = (params.baseUrl || 'https://generativelanguage.googleapis.com/v1beta')
    .trim()
    .replace(/\/+$/, '');
  const baseWithVersion = cleanBase.includes('/v1') ? cleanBase : `${cleanBase}/v1beta`;
  const systemParts = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content.trim())
    .filter(Boolean);
  const systemText = systemParts.join('\n\n');

  const conversationMessages = messages.filter((m) => m.role !== 'system');

  const safetySettings = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' },
  ];

  // Rakit daftar giliran (contents) dengan urutan bergantian user/model yang valid
  const buildContents = (inlineSystem: boolean) => {
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
        rawTurns[0].text = `[INSTRUKSI SISTEM DAN PERAN KARAKTER]\n${systemText}\n[AKHIR INSTRUKSI SISTEM]\n\n${rawTurns[0].text}`;
      } else {
        rawTurns.unshift({
          role: 'user',
          text: `[INSTRUKSI SISTEM DAN PERAN KARAKTER]\n${systemText}\n[AKHIR INSTRUKSI SISTEM]`,
        });
      }
    } else if (rawTurns[0].role === 'model') {
      rawTurns.unshift({
        role: 'user',
        text: '(Percakapan dimulai)',
      });
    }

    return rawTurns.map((t) => ({
      role: t.role,
      parts: [{ text: t.text }],
    }));
  };

  const modelsToTry = [params.model];
  if (params.model === 'gemma-4-26b-a4b-it') {
    modelsToTry.push('gemma-3-27b-it', 'gemini-2.5-flash');
  }

  let lastError = '';

  for (const modelName of modelsToTry) {
    const isGemma = modelName.toLowerCase().includes('gemma');
    // Model keluarga Gemma pada endpoint v1beta sering meminta instruksi digabung ke turn user pertama
    const tryStrategies = isGemma ? [true, false] : [false, true];

    for (const inlineSystem of tryStrategies) {
      const url = `${baseWithVersion}/models/${encodeURIComponent(
        modelName
      )}:generateContent?key=${encodeURIComponent(params.apiKey)}`;

      const generationConfig: Record<string, unknown> = {
        temperature: params.temperature,
        maxOutputTokens: params.maxTokens,
        topP: 0.95,
      };

      if (params.jsonMode && !isGemma) {
        generationConfig.responseMimeType = 'application/json';
      }

      const payload: Record<string, unknown> = {
        contents: buildContents(inlineSystem),
        generationConfig,
        safetySettings,
      };

      if (!inlineSystem && systemText) {
        payload.systemInstruction = {
          parts: [{ text: systemText }],
        };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errBody = await res.text();
        lastError = `Status ${res.status} (${modelName}): ${errBody}`;
        // Jika gagal karena developer instruction tidak diizinkan pada model ini, coba inlineSystem
        if (res.status === 400 && !inlineSystem) {
          continue;
        }
        // Jika model 404 tidak ditemukan, coba kandidat model berikutnya
        if (res.status === 404) {
          break;
        }
        if (res.status === 401 || res.status === 403) {
          throw new Error(`API Key Google AI Studio ditolak (${res.status}). Periksa kembali kunci API Anda di menu Pengaturan.`);
        }
        if (res.status === 429) {
          throw new Error('Batas permintaan (rate limit) free tier Google AI Studio tercapai. Tunggu beberapa detik lalu coba kembali.');
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

      const textParts = (candidate?.content?.parts || [])
        .map((p: { text?: string }) => p.text || '')
        .join('');

      const cleanedText = cleanCharacterOutput(textParts);
      if (!cleanedText) {
        throw new Error('Model mengembalikan teks kosong. Silakan coba regenerate balasan.');
      }

      const tokensIn =
        data?.usageMetadata?.promptTokenCount ??
        estimateTokens(messages.map((m) => m.content).join('\n'));
      const tokensOut =
        data?.usageMetadata?.candidatesTokenCount ??
        estimateTokens(cleanedText);

      return {
        text: cleanedText,
        tokensIn,
        tokensOut,
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
    const rawText = data?.choices?.[0]?.message?.content || '';
    const cleaned = cleanCharacterOutput(rawText);
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
      body: JSON.stringify({
        model: params.model,
        messages,
        stream: false,
        ...(params.jsonMode ? { format: 'json' } : {}),
        options: {
          temperature: params.temperature,
          num_predict: params.maxTokens,
        },
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
  const rawText = data?.message?.content || '';
  const cleaned = cleanCharacterOutput(rawText);

  return {
    text: cleaned,
    tokensIn: data?.prompt_eval_count ?? estimateTokens(messages.map((m) => m.content).join('\n')),
    tokensOut: data?.eval_count ?? estimateTokens(cleaned),
    modelUsed: params.model,
    providerUsed: 'ollama',
  };
}

export function cleanCharacterOutput(raw: string, characterName?: string): string {
  if (!raw) return '';
  let text = raw.trim();
  // Bersihkan blok berpikir internal jika model menyertakannya
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (characterName) {
    const escaped = characterName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const prefixRegex = new RegExp(`^\\*{0,2}${escaped}\\*{0,2}\\s*:\\s*`, 'i');
    text = text.replace(prefixRegex, '').trim();
  }
  return text;
}
