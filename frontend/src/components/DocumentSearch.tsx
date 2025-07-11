import React, { useState } from 'react';
import './DocumentSearch.css';
import { searchApi } from '../services/api'; // ← 変更

interface DocumentSearchProps {
  userId: string;
}

const DocumentSearch: React.FC<DocumentSearchProps> = ({ userId }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);
    setResults([]);

    try {
      console.log('Sending request:', { query, user_id: userId });

      // ← ここを変更
      const data = await searchApi.searchDocuments({
        query: query,
        user_id: userId,
      });

      console.log('Response data:', data);

      if (data.matching_documents || data.matching_products) {
        const allResults = [
          ...(data.matching_documents || []),
          ...(data.matching_products || [])
        ];
        setResults(allResults);
      } else {
        setResults([]);
      }

    } catch (err) {
      console.error('Search error:', err);
      setError('検索中にエラーが発生しました。');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  // 改行を保持してテキストを表示するためのヘルパー関数
  const formatTextWithLineBreaks = (text: string) => {
    return text.split('\n').map((line, index) => (
      <span key={index}>
        {line}
        {index < text.split('\n').length - 1 && <br />}
      </span>
    ));
  };

  return (
    <div className="document-search">
      <div className="search-header">
        <h2>文書検索</h2>
        <p>User ID: {userId}</p>
      </div>
      
      <div className="search-input">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="検索キーワードを入力してください..."
        />
        <button onClick={handleSearch} disabled={isLoading || !query.trim()}>
          {isLoading ? '検索中' : '検索'}
        </button>
      </div>
      
      {error && (
        <div className="error-message">
          <p>{error}</p>
        </div>
      )}
      
      <div className="results">
        {results.length > 0 ? (
          <div>
            <h3>検索結果 ({results.length}件)</h3>
            {results.map((result, index) => (
              <div key={index} className="result-item">
                <h4>{result.title || result.name || `結果 ${index + 1}`}</h4>
                <div className="result-content">
                  {/* 改行を保持してテキストを表示 */}
                  {formatTextWithLineBreaks(result.description || result.content || JSON.stringify(result))}
                </div>
                {result.keywords && (
                  <div>
                    <strong>キーワード:</strong> {Array.isArray(result.keywords) ? result.keywords.join(', ') : result.keywords}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          !isLoading && <p>検索結果がありません。</p>
        )}
      </div>
    </div>
  );
};

export default DocumentSearch;