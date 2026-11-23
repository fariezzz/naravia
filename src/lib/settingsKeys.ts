// Daftar kunci setelan. Modul murni tanpa akses database agar aman diimpor dari mana saja.

// Setelan global yang hanya boleh dibaca/diubah admin (provider AI, kunci API, pendaftaran, kuota)
export const SYSTEM_SETTING_KEYS = [
  'provider',
  'llm_base_url',
  'llm_api_key',
  'model',
  'fallback_llm_base_url',
  'fallback_llm_api_key',
  'fallback_model',
  'research_llm_base_url',
  'research_llm_api_key',
  'research_model',
  'embedding_base_url',
  'embedding_api_key',
  'embedding_model',
  'google_api_key',
  'ollama_base_url',
  'ollama_model',
  'ollama_api_key',
  'search_provider',
  'search_api_key',
  'registration_mode',
  'default_daily_token_budget',
] as const;

export const SECRET_SETTING_KEYS = new Set<string>([
  'llm_api_key',
  'fallback_llm_api_key',
  'research_llm_api_key',
  'embedding_api_key',
  'google_api_key',
  'ollama_api_key',
  'search_api_key',
]);

// Setelan pribadi tiap pengguna (parameter percakapan)
export const USER_SETTING_DEFAULTS: Record<string, string> = {
  temperature: '0.9',
  max_tokens: '1024',
  default_reply_style: 'sedang',
  history_limit: '20',
  auto_summarize_threshold: '30',
  auto_extract_memory: 'true',
};

// Nilai awal setelan global saat database pertama kali dibuat (diambil dari environment)
export function systemDefaultsFromEnv(): Record<string, string> {
  return {
    provider: 'auto',
    llm_base_url:
      process.env.LLM_BASE_URL || process.env.OPENAI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
    llm_api_key: process.env.LLM_API_KEY || process.env.GOOGLE_AI_STUDIO_API_KEY || process.env.OPENAI_API_KEY || '',
    model: process.env.LLM_MODEL || 'gemma-4-26b-a4b-it',
    fallback_llm_base_url: process.env.FALLBACK_LLM_BASE_URL || '',
    fallback_llm_api_key: process.env.FALLBACK_LLM_API_KEY || '',
    fallback_model: process.env.FALLBACK_LLM_MODEL || '',
    research_llm_base_url: process.env.RESEARCH_LLM_BASE_URL || '',
    research_llm_api_key: process.env.RESEARCH_LLM_API_KEY || '',
    research_model: process.env.RESEARCH_LLM_MODEL || '',
    embedding_base_url: process.env.EMBEDDING_BASE_URL || '',
    embedding_api_key: process.env.EMBEDDING_API_KEY || '',
    embedding_model: process.env.EMBEDDING_MODEL || '',
    google_api_key: process.env.GOOGLE_AI_STUDIO_API_KEY || '',
    ollama_base_url: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    ollama_model: process.env.OLLAMA_MODEL || 'gemma3:12b',
    ollama_api_key: process.env.OLLAMA_API_KEY || '',
    search_provider: process.env.TAVILY_API_KEY ? 'tavily' : process.env.BRAVE_SEARCH_API_KEY ? 'brave' : 'model',
    search_api_key: process.env.TAVILY_API_KEY || process.env.BRAVE_SEARCH_API_KEY || '',
    registration_mode: process.env.REGISTRATION_MODE === 'closed' ? 'closed' : 'open',
    default_daily_token_budget: process.env.DEFAULT_DAILY_TOKEN_BUDGET || '200000',
  };
}

export function maskSecret(value: string): string {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';
  if (trimmed.length <= 8) return '••••••••';
  return `${trimmed.slice(0, 4)}••••••••${trimmed.slice(-4)}`;
}
