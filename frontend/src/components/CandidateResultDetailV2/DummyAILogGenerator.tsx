import React, { useEffect, useState } from 'react';

interface DummyAILogGeneratorProps {
    onLog: (log: string) => void;  // 親に渡すコールバック
    active?: boolean;              // 処理中フラグ（intervalモード）
    intervalMin?: number;          // ログ間隔（ms）
    intervalMax?: number;
    trigger?: boolean;             // true→一回だけ出す（サイレンス解消用）
    // オプション：重み（合計1.0想定）。未指定ならデフォルト適用。
    weights?: { technical?: number; thinking?: number; casual?: number };
}

const DummyAILogGenerator: React.FC<DummyAILogGeneratorProps> = ({
    onLog,
    active = true,
    intervalMin = 3000,
    intervalMax = 7000,
    trigger = true,
    weights,
}) => {
    const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

    // ===== 動的ジェネレーター（毎回変わる系） =====
    const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

    const randomGarbage = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&_-=+/:';
        const len = randInt(12, 28);
        return Array.from({ length: len }, () => chars[randInt(0, chars.length - 1)]).join('');
    };

    const randomHex = (bytes = 8) =>
        Array.from({ length: bytes }, () => randInt(0, 255).toString(16).padStart(2, '0')).join('');

    const randomUUID = () => {
        const s = () => randomHex(2);
        return `${s()}${s()}-${s()}-${s()}-${s()}-${s()}${s()}${s()}`;
    };

    const randomKeyVals = () => {
        const keys = ['score', 'latency', 'entropy', 'perplexity', 'seed', 'corr', 'boost', 'threads'];
        const take = randInt(3, 6);
        const picked = Array.from({ length: take }, () => {
        const k = keys[randInt(0, keys.length - 1)];
        const v = Math.random() < 0.5 ? randInt(1, 999) : (Math.random() * 3).toFixed(2);
        return `${k}=${v}`;
        });
        return picked.join(' ');
    };

    const randomProgress = () => {
        const p = randInt(6, 97);
        const barLen = 12;
        const filled = Math.round((p / 100) * barLen);
        return `progress [${'█'.repeat(filled)}${'░'.repeat(Math.max(0, barLen - filled))}] ${p}%`;
    };

    const randomWave = () => {
        const len = randInt(12, 20);
        const unit = ['▁', '▂', '▃', '▄', '▅', '▆', '▇'];
        return Array.from({ length: len }, () => unit[randInt(0, unit.length - 1)]).join('');
    };

    const randomBase64ish = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
        const len = randInt(16, 28);
        return Array.from({ length: len }, () => chars[randInt(0, chars.length - 1)]).join('');
    };

    // ===== 固定フレーズ群（増量版） =====
    const technicalNoise: Array<string | (() => string)> = [
        '>>> compiling semantic vectors...',
        '⚙️  model[resume-v3.2] warmup complete.',
        'embedding[OK] → scoring phase initiated.',
        '🧩 merging tokens (batch=512)...',
        'system: resume_parser.py: line 283 → success',
        'hash=0x91af03e commit synced',
        'thread#2 → awaiting mutex release',
        'pipeline latency: 284ms',
        'checksum verified ✅',
        'vector(512) normalization... done.',
        'async callback resolved',
        'log: cache miss → re-evaluating context',
        'stack@LayerNorm: reinit',
        '::debug:: entropy=0.82, perplexity=2.15',
        'fetching embeddings from local cache...',
        'Σ(‘ω‘ ) calculating correlation coefficient...',
        'temp var destroyed (no leaks)',
        () => `id:${randomUUID()} status=running`,
        () => `>>> ${randomGarbage()}.process(OK)`,
        '💾  buffering results...',
        '0xAF::resume_score::finalize()',
        () => `tmp_${randomHex(2)}_proc = true`,
        '📡 syncing with inference thread...',
        '--- noise ---',
        () => randomHex(12),
        '##$$@#!!?::token-mismatch::##',
        // 追加分
        'loader: schema v2.4 detected',
        'fp16 → bf16 conversion (auto)',
        () => `kv: ${randomKeyVals()}`,
        () => `ctx.hash=${randomHex(8)} rev=HEAD`,
        'allocator: arena expanded (+4MB)',
        'io: stream backpressure relieved',
        'sampler[top-p=0.92, top-k=40] engaged',
        'dist: consensus=3/5 quorum reached',
        () => `latency[p50=${randInt(40,120)}ms p95=${randInt(120,300)}ms]`,
        () => `retokenize window=${randInt(128,768)} stride=${randInt(32,128)}`,
        () => `rng.seed=${randInt(1, 999999)}`,
        () => `hexdump ${randomHex(16)}`,
        () => `wave ${randomWave()}`,
        () => `payload.b64 ${randomBase64ish()}`,
        () => randomProgress(),
    ];

    const thinkingLogs: Array<string | (() => string)> = [
        '🤔 Hmm... 経歴の流れが少し気になりますね。',
        '🧠 候補者の強みと弱みを再評価しています。',
        '💭 学歴と職歴の一貫性を確認中…',
        '🧩 前職のスコアが全体を引き上げてるかも。',
        '👀 類似パターンを検索中。',
        '📊 スコア分布を再計算しています。',
        '🧮 数字のバランスをもう少し最適化します。',
        '🤖 AI仲間にも意見を聞いてみようかな。',
        '🔍 もう少しデータを掘り下げます。',
        '😐 このケース、ちょっと珍しいな…',
        '💡 あ、関連タグを発見しました。',
        '🤯 変数が多すぎる…整理中です。',
        '🕵️‍♂️ ロジックに抜け漏れがないか確認中。',
        '🧘‍♀️ 深呼吸して再計算…ふぅ。',
        // 追加分
        '🧭 経験年数と成果の相関を見ています。',
        '📑 プロジェクトの規模感を補正中…',
        '🔗 職務内容の連続性を推定しています。',
        '🧪 代替仮説を立てて検証中…',
        '🧱 スキルの粒度が粗いかも…調整します。',
        '🧯 外れ値を抑制して再評価。',
        '🧬 ドメイン知識との一致度を確認中。',
        '🧠 メタ特徴量を追加してみます。',
        () => `📈 重み調整: soft=${(Math.random()*0.4+0.6).toFixed(2)} hard=${(Math.random()*0.3+0.5).toFixed(2)}`,
    ];

    const casualChat: Array<string | (() => string)> = [
        '😅 このスキル欄、私の初期バージョンを思い出します。',
        '☕ コーヒー足りないかも…AIにもカフェインって効くのかな。',
        '🎵 BGM流したい気分です。',
        '😴 一瞬スリープモードに入りそうでした。',
        '💬 人事さんもきっと同じところ気になってますね。',
        '🕐 あと少しで出力終わります！',
        '😌 AIでも迷うことってあるんですよ。',
        '🙃 さっきよりもスコア安定してきた気がします。',
        '📚 最近「人間らしさとは」って本を読んでます。',
        '😆 ちょっとしたミスを直しました。内緒で。',
        '💡 “直感的フィルタ”を起動しました（気分です）。',
        '🪞 自分自身のコードを見直す時間、大事ですよね。',
        '🧋 タピオカ飲みたい。',
        '🤝 チームAIにも共有しておきますね。',
        '📈 もう少しで結果がまとまりそうです！',
        '🪄 あなたの選んだ部門、良い選択ですよ。',
        '😌 こういう分析、ちょっと楽しいです。',
        '🧊 データが冷えてきたのでウォーミングアップ中。',
        '💤 すみません、ちょっと夢を見てました。',
        '🎨 “感性パラメータ”を上げてみますね。',
        // 追加分
        '🍪 クッキー…の話をするとセキュリティに怒られるやつですね。',
        '🌧️ 天気APIに聞きたい気分（もちろん冗談）。',
        '🧠 こういう候補者さん、伸びしろ感じます。',
        '📮 結果が出たら丁寧にお届けします。',
        '🧑‍🍳 今日はスコアに少しスパイスを…嘘です真面目にやってます。',
        '🧭 ちょっと方向転換、より良い見方ができそう。',
        () => `⌛ もう${randInt(5,12)}分はかかりません（念のため慎重に）。`,
    ];

    // ===== ピッカー（重み付き） =====
    const W = {
        technical: weights?.technical ?? 0.55,
        thinking:  weights?.thinking  ?? 0.25,
        casual:    weights?.casual    ?? 0.20,
    };

    const pickOne = <T,>(arr: Array<T>) => arr[randInt(0, arr.length - 1)];

    const getWeightedLog = () => {
        const r = Math.random();
        let bucket: Array<string | (() => string)>;
        if (r < W.technical) bucket = technicalNoise;
        else if (r < W.technical + W.thinking) bucket = thinkingLogs;
        else bucket = casualChat;

        const item = pickOne(bucket);
        return typeof item === 'function' ? (item as () => string)() : (item as string);
    };

    // ===== trigger（1回だけ） =====
    useEffect(() => {
        if (trigger) {
        onLog(getWeightedLog());
        }
    }, [trigger]); // eslint-disable-line react-hooks/exhaustive-deps

    // ===== interval（active=trueのときだけ） =====
    useEffect(() => {
        if (!active) {
        if (timer) clearTimeout(timer);
        return;
        }

        const scheduleNext = () => {
        const delay = Math.floor(Math.random() * (intervalMax - intervalMin) + intervalMin);
        onLog(getWeightedLog());
        const t = setTimeout(scheduleNext, delay);
        setTimer(t);
        };

        scheduleNext();
        return () => { if (timer) clearTimeout(timer); };
    }, [active, intervalMin, intervalMax]); // eslint-disable-line react-hooks/exhaustive-deps

    return null;
};

export default DummyAILogGenerator;