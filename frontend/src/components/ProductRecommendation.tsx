import React, { useState } from 'react';
import { productApi } from '../services/api';
import './ProductRecommendation.css';

interface Props {
  userId: string;
}

interface RecommendationResult {
  user_id: string;
  message: string;
  keywords: string[];
  recommendations: string;
  used_history?: string[];
}

const ProductRecommendation: React.FC<Props> = ({ userId }) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [exportFormat, setExportFormat] = useState<'json' | 'csv'>('json');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<RecommendationResult | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setIsLoading(true);
    try {
      const response = await productApi.getRecommendations({
        session_id: userId,
        query: query,
        category: category || undefined,
        export_format: exportFormat
      });

      setResult(response);
    } catch (error) {
      console.error('商品推薦エラー:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="product-recommendation">
      <h2>商品推薦</h2>
      
      <div className="search-form">
        <div className="form-group">
          <label>検索クエリ:</label>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="商品を検索してください..."
            rows={3}
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>カテゴリ:</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="カテゴリ (オプション)"
            />
          </div>

          <div className="form-group">
            <label>エクスポート形式:</label>
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as 'json' | 'csv')}
            >
              <option value="json">JSON</option>
              <option value="csv">CSV</option>
            </select>
          </div>
        </div>

        <button 
          onClick={handleSearch} 
          disabled={isLoading || !query.trim()}
          className="search-button"
        >
          {isLoading ? '検索中...' : '商品推薦を取得'}
        </button>
      </div>

      {result && (
        <div className="results">
          <div className="keywords-section">
            <h3>抽出されたキーワード:</h3>
            <div className="keywords">
              {result.keywords.map((keyword, index) => (
                <span key={index} className="keyword-tag">
                  {keyword}
                </span>
              ))}
            </div>
          </div>

          <div className="recommendations-section">
            <h3>推薦結果:</h3>
            <div className="recommendations">
              {result.recommendations}
            </div>
          </div>

          {result.used_history && result.used_history.length > 0 && (
            <div className="history-section">
              <h3>参考にした履歴:</h3>
              <ul>
                {result.used_history.map((history, index) => (
                  <li key={index}>{history}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ProductRecommendation;