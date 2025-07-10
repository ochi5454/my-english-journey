import React, { useState } from 'react';
import './HashtagProcessor.css';

interface HashtagProcessorProps {
  userId: string;
}

interface HashtagAction {
  hashtag: string;
  action: string;
  description: string;
}

const HashtagProcessor: React.FC<HashtagProcessorProps> = ({ userId }) => {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [availableHashtags] = useState<HashtagAction[]>([
    { hashtag: '#recommend', action: 'product_recommendation', description: '商品推薦を実行' },
    { hashtag: '#search', action: 'document_search', description: '文書検索を実行' },
    { hashtag: '#history', action: 'chat_history', description: 'チャット履歴を表示' },
    { hashtag: '#export', action: 'export_data', description: 'データをエクスポート' },
    { hashtag: '#help', action: 'show_help', description: 'ヘルプを表示' }
  ]);

  const handleProcess = async () => {
    if (!input.trim()) return;

    setIsLoading(true);
    setResult(null);

    try {
      const response = await fetch('/process_hashtag', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          message: input
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setResult(data.result || '処理が完了しました。');
    } catch (err) {
      setResult('ハッシュタグ処理中にエラーが発生しました。');
      console.error('Hashtag processing error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const insertHashtag = (hashtag: string) => {
    setInput(prev => prev + (prev ? ' ' : '') + hashtag);
  };

  return (
    <div className="hashtag-processor">
      <div className="processor-header">
        <h2>ハッシュタグ処理</h2>
        <p>ハッシュタグを使用して特定のアクションを実行できます</p>
      </div>

      <div className="available-hashtags">
        <h3>利用可能なハッシュタグ</h3>
        <div className="hashtags-grid">
          {availableHashtags.map((item) => (
            <div
              key={item.hashtag}
              className="hashtag-card"
              onClick={() => insertHashtag(item.hashtag)}
            >
              <div className="hashtag-name">{item.hashtag}</div>
              <div className="hashtag-description">{item.description}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="input-section">
        <div className="input-container">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="ハッシュタグを含むメッセージを入力してください... 例: #recommend 軽量なノートパソコン"
            className="hashtag-input"
            rows={3}
          />
          <button
            onClick={handleProcess}
            disabled={isLoading || !input.trim()}
            className="process-button"
          >
            {isLoading ? '処理中...' : '実行'}
          </button>
        </div>
      </div>

      {result && (
        <div className="result-section">
          <h3>実行結果</h3>
          <div className="result-content">
            {result}
          </div>
        </div>
      )}
    </div>
  );
};

export default HashtagProcessor;