// src/services/api.ts
import config from "../config";

const VITE_API_URL = config.API_BASE_URL;

const getApiBaseUrl = (): string => {
  try {
    // Vite環境変数を安全に取得
    if (typeof import.meta !== 'undefined') {
      return VITE_API_URL || 'http://localhost:8000';
    }
  } catch (error) {
    console.warn('Failed to access import.meta.env:', error);
  }
  
  // フォールバック
  return 'http://localhost:8000';
};

const API_BASE_URL = getApiBaseUrl();

// Chat API
interface ChatRequest {
  user_id: string;
  message?: string;
  question?: string;
}

interface ChatResponse {
  user_id: string;
  assistant_message: string;
  langchain_message?: string;
  summary?: string;
  topics?: string[];
  user_question_inferred?: string;
}

// Search API
interface SearchRequest {
  query: string;
  user_id: string;
}

interface SearchResponse {
  matching_documents: any[];
  matching_products: any[];
}

// Recommendation API
interface RecommendationRequest {
  session_id: string;
  query: string;
  search_level?: 'basic' | 'expanded' | 'conversation';  // 2025.7.17 Mod（radio checkbox）
  include_english: boolean; // 2025.7.17 Mod（radio checkbox）
}

interface RecommendationResponse {
  recommendations: any[];
  recommendation_text?: string;   // 2025.7.15 Mod（attachment files）
  message?: string;               // 2025.7.18 Add（feedback）
  user_id?: string;            // 2025.7.18 Add（feedback）
}

// Chat History API
interface ChatHistoryItem {
  user_message?: string;
  assistant_message?: string;
  message?: string;
  response?: string;
  timestamp?: string;
  summary?: string;
  file_name?: string;
}

interface ChatHistoryResponse {
  messages: ChatHistoryItem[];  // バックエンドの実際のレスポンス形式に修正
  total_count?: number;
  message?: string;
}

class ChatApiService {
  async sendMessage(data: ChatRequest): Promise<ChatResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }
}

class SearchApiService {
  async searchDocuments(data: SearchRequest): Promise<SearchResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/search_documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Search API request failed:', error);
      throw error;
    }
  }
}

class RecommendationApiService {
  async getRecommendations(data: RecommendationRequest): Promise<RecommendationResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/recommend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Recommendation API request failed:', error);
      throw error;
    }
  }
}

class ChatHistoryApiService {
  async getChatHistory(userId: string): Promise<ChatHistoryResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/history/${userId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Chat history API request failed:', error);
      throw error;
    }
  }
}

export const chatApi = new ChatApiService();
export const searchApi = new SearchApiService();
export const recommendationApi = new RecommendationApiService();
export const chatHistoryApi = new ChatHistoryApiService();