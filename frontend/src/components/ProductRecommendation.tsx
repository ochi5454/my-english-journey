import React, { useState } from 'react';
import './ProductRecommendation.css';

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

    try {
      const response = await fetch('/api/recommend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          query: query
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setRecommendations(data.recommendations || []);
    } catch (err) {
      setError('推薦処理中にエラーが発生しました。');
      console.error('Recommendation error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="product-recommendation">
      <div className="recommendation-header">
        <h2>商品推薦</h2>
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
          {error}
        </div>
      )}

      {recommendations.length > 0 && (
        <div className="recommendations-list">
          <h3>推薦商品 ({recommendations.length}件)</h3>
          <div className="products-grid">
            {recommendations.map((product) => (
              <div key={product.id} className="product-card">
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
    </div>
  );
};

export default ProductRecommendation;