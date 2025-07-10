const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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

interface ProductQuery {
  session_id?: string;
  query: string;
  export_format?: string;
  category?: string;
  date_range?: string[];
}

interface RecommendationResponse {
  user_id: string;
  message: string;
  keywords: string[];
  recommendations: string;
  used_history?: string[];
}

interface HashtagRequest {
  text: string;
}

interface HashtagResponse {
  user_id: string;
  original: string;
  results: Record<string, any>;
}

class ApiService {
  private async request<T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error(`API request failed for ${endpoint}:`, error);
      throw error;
    }
  }

  // Chat API
  chat = {
    sendMessage: (data: ChatRequest): Promise<ChatResponse> =>
      this.request('/chat', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    getHistory: (userId: string, category?: string, dateRange?: string): Promise<any> => {
      const params = new URLSearchParams();
      if (category) params.append('category', category);
      if (dateRange) params.append('date_range', dateRange);
      
      const query = params.toString();
      return this.request(`/history/${userId}${query ? `?${query}` : ''}`);
    },
  };

  // Product API
  product = {
    getRecommendations: (data: ProductQuery): Promise<RecommendationResponse> =>
      this.request('/recommend', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    searchDocuments: (data: ProductQuery): Promise<any> =>
      this.request('/search_documents', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    exportResults: (data: ProductQuery): Promise<any> =>
      this.request('/export_results', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  };

  // Hashtag API
  hashtag = {
    process: (data: HashtagRequest): Promise<HashtagResponse> =>
      this.request('/process', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  };
}

export const api = new ApiService();
export const chatApi = api.chat;
export const productApi = api.product;
export const hashtagApi = api.hashtag;