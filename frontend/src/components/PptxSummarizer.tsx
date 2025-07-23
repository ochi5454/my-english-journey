import React, { useState } from 'react';
import './PptxSummarizer.css';

interface PptxSummarizerProps {
  userId: string;
}

interface SearchResult {
  filename: string;
  summary: string;
  slide_index: number;
}

const PptxSummarizer: React.FC<PptxSummarizerProps> = ({ userId }) => {
  const [summary, setSummary] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  const handleUpload = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    setIsUploading(true);
    setError(null);
    setSummary(null);

    try {
      const res = await fetch("/upload_and_index_pptx/", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        startStream();
      } else {
        setError("アップロードに失敗しました。");
        setIsUploading(false);
      }
    } catch (err) {
      console.error(err);
      setError("アップロード中にエラーが発生しました。");
      setIsUploading(false);
    }
  };

  const startStream = () => {
    const eventSource = new EventSource(`/summarize_pptx_stream/`);

    eventSource.onmessage = (event) => {
      const data = event.data;
      if (data === "[DONE]") {
        eventSource.close();
        setIsUploading(false);
      } else {
        setSummary((prev) => (prev ? prev + "\n" + data : data));
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      setError("ストリーミング中にエラーが発生しました。");
      setIsUploading(false);
    };
  };

  const handleSearch = async () => {
    setIsSearching(true);
    setError(null);
    setSearchResults([]);

    try {
      const res = await fetch(`/search_summaries/?query=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      setSearchResults(data);
    } catch (err) {
      console.error(err);
      setError("検索中にエラーが発生しました。");
    } finally {
      setIsSearching(false);
    }
  };

  const highlightQuery = (text: string, query: string) => {
    if (!query) return text;
    const regex = new RegExp(`(${query})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? <mark key={i}>{part}</mark> : <span key={i}>{part}</span>
    );
  };

  return (
    <div className="pptx-summarizer">
      <section className="pptx-upload">
        <h2>📄 PowerPoint スライドの要約</h2>
        <input type="file" accept=".pptx" onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
        }} />
        {isUploading && <p>🔄 要約中です...</p>}
        {error && <p className="error-message">{error}</p>}
        <div className="summary-result">
          <h3>📝 要約結果</h3>
          <p>{(summary || "まだ要約はありません。").split('\n').map((line, i) => (
            <span key={i}>{line}<br /></span>
          ))}</p>
        </div>
      </section>

      <hr />

      <section className="pptx-search">
        <h2>🔍 スライド要約のスマート検索</h2>
        <p className="search-hint">意味ベースで検索ができます（例：売上の変化、プロジェクト概要など）</p>
        <div className="search-box">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="例：マーケティング戦略"
          />
          <button className="search-button" onClick={handleSearch}>この内容で検索する</button>
        </div>

        {isSearching && <p>🔍 検索中です...</p>}

        <div className="search-results">
          {searchResults.length === 0 && !isSearching && <p>該当する要約が見つかりませんでした。</p>}
          {searchResults.map((result, index) => (
            <div key={index} className="result-card">
              <strong>{result.filename}（スライド {result.slide_index}）</strong>
              <p>{highlightQuery(result.summary, searchQuery)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default PptxSummarizer;