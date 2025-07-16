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
  filename?: string; //2025.7.15 Mod（attachment files）
  sourceDb?: string; //2025.7.16 Mod（source db）
}

const ProductRecommendation: React.FC<ProductRecommendationProps> = ({ userId }) => {
  const [query, setQuery] = useState('');
  const [recommendations, setRecommendations] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
// 2025.7.15 Add（attachment files）START
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [recommendationText, setRecommendationText] = useState<string | null>(null);
  const [hasUploaded, setHasUploaded] = useState(false);

  // ① ファイルアップロード関数をコンポーネント内に切り出し
  const uploadFile = async (file: File) => {
    const formData = new FormData();
    formData.append("session_id", userId);
    formData.append("file", file);

    try {
      const res = await fetch("http://localhost:8000/recommend/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      console.log("✅ アップロード結果:", data.message);
      setUploadMessage(data.message); // 状態にセットしてUIに表示できる
      setHasUploaded(true);
    } catch (err) {
      console.error("❌ アップロードエラー:", err);
      setUploadMessage("ファイルのアップロードに失敗しました。");
    }
  };
// 2025.7.15 Add（attachment files）END

  const handleRecommend = async () => {
    if (!query.trim()) return;

    setHasUploaded(false); // 2025.7.15 Add（attachment files）
    setUploadMessage(null); // 2025.7.15 Add（attachment files）
    setRecommendationText(null); // 2025.7.15 Add（attachment files）
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
      // 2025.7.15 Add（attachment files）START
      setRecommendationText(data.recommendation_text || null);
      // 2025.7.15 Add（attachment files）END

    } catch (err) {
      console.error('Recommendation error:', err);
      setError('推薦処理中にエラーが発生しました。');
      setRecommendations([]);
    } finally {
      setIsLoading(false);
    }
  };

  // 2025.7.15 Mod（attachment files）START
  // 改行を保持してテキストを表示するためのヘルパー関数
  const formatTextWithLineBreaks = (text?: string) => {
    if (!text) return null;

    return text.split('\n').map((line, index) => (
      <span key={index}>
        {line}
        {index < text.split('\n').length - 1 && <br />}
      </span>
    ));
  };
  // 2025.7.15 Mod（attachment files）END

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
            placeholder="商品検索時は、特徴や用途を入力し「推薦」、商品登録時は「登録」ボタンを押下しファイルを選択してください。"
            className="recommendation-input"
            rows={3}
          />
          {/* 2025.7.15 Mod（attachment files）START */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button
              onClick={handleRecommend}
              disabled={isLoading || !query.trim()}
              className="recommend-button"
            >
              {isLoading ? '推薦中...' : '推薦'}
            </button>
            <label
              className={`file-upload-button ${query.trim() ? 'disabled' : ''}`}
            >
              <span>登録</span>
              <input
                type="file"
                style={{ display: 'none' }}
                disabled={!!query.trim()} // ← 実際の file input もブロック
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    console.log('選択されたファイル:', file.name);
                    uploadFile(file);
                  }
                }}
              />
            </label>          </div>
          {uploadMessage && (
            <div className="upload-message" style={{ color: 'green', marginTop: '8px' }}>
              {uploadMessage}
            </div>
          )}
          {/* 2025.7.15 Mod（attachment files）END */}
        </div>
      </div>

      {error && (
        <div className="error-message">
          <p style={{ color: 'red' }}>{error}</p>
        </div>
      )}
      {/* 2025.7.15 Mod（attachment files）START */}
      {!hasUploaded && recommendationText && (
        <div className="recommendation-text">
          <h3>AIからの提案</h3>
          <div>{formatTextWithLineBreaks(recommendationText)}</div>
        </div>
      )}
      {/* 2025.7.15 Mod（attachment files）END */}
      {!hasUploaded && recommendations.length > 0 && (
        <div className="recommendations-list">
          <h3>該当商品 ({recommendations.length}件)</h3>
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
                {/* 2025.7.16 Mod（product ID）START */}
                <div className="product-id">ID: {product.id}</div>
                {/* 2025.7.16 Mod（product ID）END */}
                <div className="product-category">
                  カテゴリ: {product.category}
                </div>
                <div className="product-description">
                  {formatTextWithLineBreaks(product.description)}
                </div>
                <div className="product-price">
                  ¥{product.price.toLocaleString()}
                </div>
                {/* 2025.7.16 Mod（source db）START */}
                {product.sourceDb && (
                  <div className="product-source-db" style={{ fontSize: '0.9em', color: '#666', marginBottom: '4px' }}>
                    参照元DB: {product.sourceDb}
                  </div>
                )}
                {/* 2025.7.16 Mod（source db）END */}
                {/* 2025.7.15 Mod（attachment files）START */}
                {product.filename && (
                  <a
                    href={`http://localhost:8000/recommend/download?filename=${encodeURIComponent(product.filename)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="download-link"
                  >
                    {product.filename} をダウンロード
                  </a>
                )}
                {/* 2025.7.15 Mod（attachment files）END */}
              </div>
            ))}
          </div>
        </div>
      )}

      {!isLoading && !hasUploaded && recommendations.length === 0 && !error && (
        <p>推薦結果がありません。</p>
      )}
    </div>
  );
};

export default ProductRecommendation;