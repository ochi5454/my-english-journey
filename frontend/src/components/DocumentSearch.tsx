import React, { useState } from 'react';

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

    try {
      const response = await fetch(`http://localhost:8000/search_documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query,
          user_id: userId,
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

  return (
    <div className="document-search">
      <h2>文書検索</h2>
      <p>User ID: {userId}</p>
      <div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="検索キーワードを入力してください..."
        />
        <button onClick={handleSearch} disabled={isLoading}>
          {isLoading ? '検索中...' : '検索'}
        </button>
      </div>
      {error && <p>{error}</p>}
      <div>
        {results.length > 0 ? (
          results.map((result, index) => (
            <div key={index}>
              <h3>{result.title}</h3>
              <p>{result.content}</p>
            </div>
          ))
        ) : (
          <p>検索結果がありません。</p>
        )}
      </div>
    </div>
  );
};

export default DocumentSearch;