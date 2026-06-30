// User types
export interface User {
  id: string;
  email: string;
  token_balance: number;
  plan_name?: string;
  monthly_credit_limit?: number;
  subscription_status?: string;
  plan_expires_at?: string | null;
  created_at: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
}

export interface AuthToken {
  access_token: string;
  token_type: string;
}

// Agent types
export interface Agent {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  system_prompt?: string;
  llm_provider: string;
  llm_model: string;
  ollama_endpoint?: string;
  temperature: number;
  is_training: boolean;
  created_at: string;
  web_search_enabled: boolean;
  search_provider: string;
  multi_agent_enabled: boolean;
  is_public: boolean;
  output_template?: string;
  memory_enabled?: boolean;
  memory_window?: number;
  tavily_api_key?: string;
}

export interface AgentCreate {
  name: string;
  description?: string;
  system_prompt?: string;
  llm_provider?: string;
  llm_model?: string;
  ollama_endpoint?: string;
  api_key?: string;
  temperature?: number;
}

export interface AgentUpdate {
  name?: string;
  description?: string;
  system_prompt?: string;
  llm_provider?: string;
  llm_model?: string;
  ollama_endpoint?: string;
  api_key?: string;
  temperature?: number;
}

// Knowledge Base types
export interface KnowledgeBase {
  id: string;
  agent_id: string;
  filename: string;
  file_type: string;
  chunk_count: number;
  uploaded_at: string;
}

// Chat types
export interface ChatMessage {
  message: string;
}

export interface ChatResponse {
  response: string;
  sources?: Source[];
}

export interface Source {
  text: string;
  source: string;
  image_urls?: string[];
  generation_id?: string;
}

export interface ChatLog {
  id: string;
  agent_id: string;
  user_message: string;
  agent_response: string;
  sources?: any;
  created_at: string;
}

// Correction types
export interface Correction {
  id: string;
  agent_id: string;
  user_query: string;
  incorrect_response: string;
  corrected_response: string;
  context?: string;
  created_at: string;
  is_active: boolean;
}

export interface CorrectionCreate {
  user_query: string;
  incorrect_response: string;
  corrected_response: string;
  context?: string;
}
