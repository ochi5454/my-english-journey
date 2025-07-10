import React, { useState } from 'react';
import { chatApi } from '../services/api';
import './DocumentSearch.css';

interface DocumentSearchProps {
  userId: string;
}

interface SearchResult {
  title: string;
  content: string;
  score: number;
  source?: string;
}

const DocumentSearch: React.FC<DocumentSearchProps> = ({ userId }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      // APIコールの例（実際のエンドポイントに合わせて調整）
      const response = await fetch('/api/search_documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query,
          user_id: userId
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setResults(data.results || []);
    } catch (err) {
      setError('検索中にエラーが発生しました。');
      console.error('Search error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="document-search">
      <div className="search-header">
        <h2>文書検索</h2>
        <p>知識ベースから関連文書を検索します</p>
      </div>

      <div className="search-input-section">
        <div className="search-input-container">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="検索キーワードを入力してください..."
            className="search-input"
          />
          <button
            onClick={handleSearch}
            disabled={isLoading || !query.trim()}
            className="search-button"
          >
            {isLoading ? '検索中...' : '検索'}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {results.length > 0 && (
        <div className="search-results">
          <h3>検索結果 ({results.length}件)</h3>
          {results.map((result, index) => (
            <div key={index} className="search-result-item">
              <div className="result-header">
                <h4>{result.title}</h4>
                <span className="result-score">スコア: {result.score.toFixed(2)}</span>
              </div>
              <div className="result-content">
                {result.content}
              </div>
              {result.source && (
                <div className="result-source">
                  出典: {result.source}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!isLoading && results.length === 0 && query && !error && (
        <div className="no-results">
          検索結果が見つかりませんでした。
        </div>
      )}
    </div>
  );
};

export default DocumentSearch;