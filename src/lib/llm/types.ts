export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type LLMActionType =
  | 'chat'
  | 'generate'
  | 'research'
  | 'summary'
  | 'memory'
  | 'group_chat'
  | 'preview'
  | 'title';

export type LLMProtocol = 'openai_compatible' | 'google' | 'ollama_native';

export interface LLMCallOptions {
  // Pemilik permintaan: menentukan setelan pribadi, kuota harian, dan pencatatan pemakaian token
  userId: string;
  temperature?: number;
  maxTokens?: number;
  characterId?: string | null;
  chatId?: string | null;
  actionType?: LLMActionType;
  jsonMode?: boolean;
  timeoutMs?: number;
}

export interface LLMResponse {
  text: string;
  tokensIn: number;
  tokensOut: number;
  modelUsed: string;
  providerUsed: string;
}

export interface ProviderEndpoint {
  protocol: LLMProtocol;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface StreamOutcome {
  fullText: string;
  modelUsed: string;
  tokensIn?: number;
  tokensOut?: number;
}
