// ユーザーID（本来はサーバーから取得する）
let userId = null;

const chatLog = document.getElementById('chat-log');
const messageInput = document.getElementById('message');
const sendBtn = document.getElementById('send-btn');

// ログ表示
function appendLog(role, text) {
  const prefix = role === 'user' ? '🧑 あなた: ' :
                 role === 'assistant' ? '🤖 AI: ' :
                 '💡 システム: ';
  chatLog.textContent += prefix + text + '\n';
  chatLog.scrollTop = chatLog.scrollHeight;
}

// メッセージ送信関数
async function sendMessage(message) {
  if (!message) return;

  if (!userId) {
    userId = 'interquest_1';  // 固定ID（実運用では取得処理を追加）
    appendLog('system', 'ユーザーIDを設定しました: ' + userId);
  }

  appendLog('user', message);

  try {
    const response = await fetch('http://localhost:8000/chat', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'X-User-ID': userId  // 任意。FastAPIでヘッダー確認してるなら必要
    },
    body: JSON.stringify({
        user_id: userId,
        message: message      // または question: message でもOK
    })
    });

    if (!response.ok) {
      appendLog('system', 'サーバーエラー: ' + response.status);
      return;
    }

    const data = await response.json();

    if (data.error) {
      appendLog('system', 'エラー: ' + data.error);
    } else {
      appendLog('assistant', data.assistant_message || '(応答なし)');
    }

  } catch (error) {
    appendLog('system', '通信エラー: ' + error.message);
  }
}

// イベント設定
sendBtn.addEventListener('click', () => {
  const msg = messageInput.value.trim();
  if (msg) {
    sendMessage(msg);
    messageInput.value = '';
    messageInput.focus();
  }
});

messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    sendBtn.click();
  }
});