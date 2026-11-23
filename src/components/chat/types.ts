export interface MessageItem {
  id: string;
  chat_id: string;
  role: 'user' | 'character';
  content: string;
  alternatives: string[];
  active_alt_index: number;
  is_pinned_memory: boolean;
  created_at: string;
}

export interface PersonaItem {
  id?: string;
  display_name: string;
  avatar: string;
  is_default?: boolean;
}

export interface MatchedLoreBadge {
  id: string;
  title: string;
  matchedKeywords?: string[];
}

export interface ChatContextSnapshot {
  systemTokens: number;
  historyTokens: number;
  estimatedTotalInputTokens: number;
  maxOutputTokens: number;
  temperature: number;
  historyLimit: number;
  includedMessages: number;
  totalMessages: number;
  hasSummary: boolean;
  matchedLore: MatchedLoreBadge[];
  activeMemories: Array<{
    id: string;
    type: string;
    content: string;
    is_auto: boolean;
  }>;
  memoryMode: 'recency' | 'lexical' | 'semantic';
  quota: {
    used: number;
    calls: number;
    budget: number;
    unlimited: boolean;
    remaining: number | null;
  };
}
