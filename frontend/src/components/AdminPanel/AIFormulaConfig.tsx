import React, { useEffect, useState } from 'react';
import appConfig from '../../config';
import './AIFormulaConfig.css';
import { fieldOptions } from '../Utils/fieldOptions';

const AIFormulaConfig: React.FC = () => {
    const [formula, setFormula] = useState('');
    const [enabledFields, setEnabledFields] = useState<string[]>([]);
    const [weights, setWeights] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
    const [isManualEdit, setIsManualEdit] = useState(false);

    // 初期状態の保存用
    const [initialData, setInitialData] = useState<{ formula: string, enabled_fields: string[], weights: Record<string, number> }>({
        formula: '',
        enabled_fields: [],
        weights: {}
    });

    const rebuildFormula = () => {
        return enabledFields
        .map(f => `${f} * ${weights[f] ?? 1}`)
        .join(' + ');
    };

    useEffect(() => {
        fetch(`${appConfig.API_BASE_URL}/admin/ai-formula?key=default`)
        .then(res => res.json())
        .then(data => {
            setFormula(data.formula);
            setEnabledFields(data.enabled_fields);
            setWeights(data.weights ?? {});
            setInitialData({
            formula: data.formula,
            enabled_fields: data.enabled_fields,
            weights: data.weights ?? {}
            });
            setLoading(false);
        })
        .catch(() => {
            setStatus('error');
            setLoading(false);
        });
    }, []);

    useEffect(() => {
        if (!isManualEdit) {
        setFormula(rebuildFormula());
        }
    }, [enabledFields, weights, isManualEdit]);

    const handleSave = async () => {
        setStatus('saving');
        try {
        await fetch(`${appConfig.API_BASE_URL}/admin/ai-formula?key=default`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
            formula,
            enabled_fields: enabledFields,
            weights,
            updated_by: 'admin'
            })
        });
        setStatus('success');
        } catch {
        setStatus('error');
        }
    };

    const handleClear = () => {
        setFormula(initialData.formula);
        setEnabledFields([...initialData.enabled_fields]);
        setWeights({ ...initialData.weights });
        setStatus('idle');
        setIsManualEdit(false);
    };

    const handleFieldChange = (i: number, value: string) => {
        const updated = [...enabledFields];
        updated[i] = value;
        setEnabledFields(updated);
    };

    const addField = () => {
        setEnabledFields([...enabledFields, fieldOptions[0].value]);
    };

    const removeField = (i: number) => {
        const updated = [...enabledFields];
        updated.splice(i, 1);
        setEnabledFields(updated);
    };

    if (loading) return <p>読み込み中...</p>;

    return (
        <div className="aifc-container">
        <h2 className="aifc-title">AIスコア計算式</h2>

        <div className="aifc-toggle">
            <label>
            <input
                type="checkbox"
                checked={isManualEdit}
                onChange={() => setIsManualEdit(!isManualEdit)}
            />
            ✏️ 手動編集モードを有効にする
            </label>
        </div>

        <div className="aifc-formula-box">
            <label className="aifc-label">現在保存されている数式：</label>
            <pre className="aifc-current-formula">
                {initialData.formula || '（未設定）'}
            </pre>

            <label className="aifc-label">数式：</label>
            <textarea
                value={formula}
                onChange={(e) => setFormula(e.target.value)}
                rows={4}
                className="aifc-textarea"
                readOnly={!isManualEdit}
            />

            {isManualEdit ? (
                <div className="aifc-warning">
                ⚠️ 手動編集モードでは、<strong>数式と一致するように使用フィールドと重みも手動で調整し保存してください。</strong><br />

                <div className="aifc-helpbox">
                    <strong>使用可能なフィールド：</strong>
                    <ul>
                    {fieldOptions.map(opt => (
                        <li key={opt.value}><code>{opt.value}</code>（{opt.label}）</li>
                    ))}
                    </ul>
                    <strong>使用可能な演算子：</strong>
                    <ul>
                    <li><code>+</code> 加算</li>
                    <li><code>-</code> 減算</li>
                    <li><code>*</code> 乗算</li>
                    <li><code>/</code> 除算</li>
                    <li><code>()</code> カッコによるグループ化</li>
                    </ul>

                    <strong>数式のサンプル：</strong>

                    <div className="aifc-formula-sample-section">
                        <p className="aifc-sample-title">✅ 正常に動作する数式例：</p>
                        <ul>
                            <li><code>score_notes * 1.0 + experience * 0.8 + logical_thinking * 1.2</code></li>
                            <li><code>(score_notes + experience) * 0.5 + leadership * 1.5</code></li>
                            <li><code>((execution - communication) * 0.6) + (organization_contribution / 2)</code></li>
                            <li><code>(score_notes * 1.0 + experience * 1.0 + motivation * 1.0) / 3</code></li>
                            <li><code>(score_notes * 1.0 + experience * 1.0) * 1.02</code></li>
                        </ul>

                        <p className="aifc-sample-title">⚠️ 正しく動作しない数式例：</p>
                        <ul>
                            <li><code>score_notes * 1.0 + UNKNOWN_FIELD * 0.5</code>（未定義のフィールド名）</li>
                            <li><code>score_notes ** experience</code>（未対応の構文：<code>**</code>は使えません）</li>
                            <li><code>score_notes +</code>（不完全な数式）</li>
                        </ul>

                        <p className="aifc-sample-note">
                            ※ 数式に使うフィールド名は、上の「使用可能なフィールド」一覧にあるものを使ってください。
                        </p>
                    </div>
                </div>
                </div>
            ) : (
                <p className="aifc-preview">
                🧮 自動生成中：<code>{rebuildFormula() || '（未設定）'}</code>
                </p>
            )}
        </div>

        <div className="aifc-fields">
            <label className="aifc-label">使用フィールドと重み：</label>
            {enabledFields.map((field, i) => (
            <div key={i} className="aifc-field-row">
                <select
                value={field}
                onChange={(e) => handleFieldChange(i, e.target.value)}
                className="aifc-select"
                >
                {fieldOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
                </select>
                <input
                type="number"
                step="0.01"
                value={weights[field] ?? 1}
                onChange={(e) => {
                    const w = { ...weights };
                    w[field] = parseFloat(e.target.value);
                    setWeights(w);
                }}
                className="aifc-weight"
                />
                <button onClick={() => removeField(i)} className="aifc-btn aifc-btn-delete">削除</button>
            </div>
            ))}
            <button onClick={addField} className="aifc-btn aifc-btn-add">＋ フィールド追加</button>
        </div>

        <div className="aifc-actions">
            <button onClick={handleSave} className="aifc-btn aifc-btn-save" disabled={status === 'saving'}>
                保存
            </button>
            <button onClick={handleClear} className="aifc-btn aifc-btn-cancle" disabled={status === 'saving'}>
                キャンセル
            </button>
        </div>

        {status === 'success' && <p className="aifc-msg-success">保存しました。</p>}
        {status === 'error' && <p className="aifc-msg-error">保存に失敗しました。</p>}
        </div>
    );
};

export default AIFormulaConfig;