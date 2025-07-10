import React, { useState } from 'react';
import './ProductRecommendation.css';
import { recommendationApi } from '../services/api';

interface ProductRecommendationProps {
  userId: string;
}

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  score?: number;
}

const ProductRecommendation: React.FC<ProductRecommendationProps> = ({ userId }) => {
  const [query, setQuery] = useState('');
  const [recommendations, setRecommendations] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRecommend = async () => {
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);
    setRecommendations([]); // 結果をリセット

    try {
      console.log('Sending recommendation request:', { session_id: userId, query });

      // ← ここを変更
      const data = await recommendationApi.getRecommendations({
        session_id: userId,
        query: query
      });

      console.log('Response data:', data);

      if (data.recommendations && Array.isArray(data.recommendations)) {
        setRecommendations(data.recommendations);
      } else if (typeof data.recommendations === 'string') {
        setRecommendations([{
          id: '1',
          name: '推薦結果',
          description: data.recommendations,
          price: 0,
          category: '一般'
        }]);
      } else {
        setRecommendations([]);
      }

    } catch (err) {
      console.error('Recommendation error:', err);
      setError('推薦処理中にエラーが発生しました。');
      setRecommendations([]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="product-recommendation">
      <div className="recommendation-header">
        <h2>商品推薦</h2>
        <p>User ID: {userId}</p>
        <p>あなたの好みに合った商品を推薦します</p>
      </div>

      <div className="recommendation-input-section">
        <div className="input-container">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="探している商品の特徴や用途を入力してください..."
            className="recommendation-input"
            rows={3}
          />
          <button
            onClick={handleRecommend}
            disabled={isLoading || !query.trim()}
            className="recommend-button"
          >
            {isLoading ? '推薦中...' : '推薦を取得'}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message">
          <p style={{ color: 'red' }}>{error}</p>
        </div>
      )}

      {recommendations.length > 0 && (
        <div className="recommendations-list">
          <h3>推薦商品 ({recommendations.length}件)</h3>
          <div className="products-grid">
            {recommendations.map((product, index) => (
              <div key={product.id || index} className="product-card">
                <div className="product-header">
                  <h4>{product.name}</h4>
                  {product.score && (
                    <span className="product-score">
                      マッチ度: {(product.score * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
                <div className="product-category">
                  カテゴリ: {product.category}
                </div>
                <div className="product-description">
                  {product.description}
                </div>
                <div className="product-price">
                  ¥{product.price.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isLoading && recommendations.length === 0 && !error && (
        <p>推薦結果がありません。</p>
      )}
    </div>
  );
};

export default ProductRecommendation;