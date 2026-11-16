// Pintasan isi cepat Base URL provider AI populer untuk panel admin
export const PROVIDER_PRESETS = [
  {
    label: '9Router Lokal (Port 20128)',
    provider: 'openai_compatible',
    baseUrl: 'http://localhost:20128/v1',
    defaultModel: 'oc/deepseek-v4.1-flash-free',
  },
  {
    label: 'OpenRouter',
    provider: 'openai_compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'google/gemma-3-27b-it:free',
  },
  {
    label: 'Groq Cloud',
    provider: 'openai_compatible',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
  },
  {
    label: 'DeepSeek API',
    provider: 'openai_compatible',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
  },
  {
    label: 'Google AI Studio',
    provider: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemma-4-26b-a4b-it',
  },
  {
    label: 'Ollama Lokal',
    provider: 'ollama',
    baseUrl: 'http://localhost:11434',
    defaultModel: 'gemma3:12b',
  },
];
