import React, { useEffect, useState } from 'react';
import appConfig from '../../config';

const AIFormulaConfig: React.FC = () => {
    const [formula, setFormula] = useState('');
    const [enabledFields, setEnabledFields] = useState<string[]>([]);
    const [weights, setWeights] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

    useEffect(() => {
        fetch(`${appConfig.API_BASE_URL}/admin/ai-formula?key=default`)
            .then(res => res.json())
            .then(data => {
                setFormula(data.formula);
                setEnabledFields(data.enabled_fields);
                setWeights(data.weights ?? {});
                setLoading(false);
            })
            .catch(() => {
                setStatus('error');
                setLoading(false);
            });
    }, []);

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
        } catch (err) {
            setStatus('error');
        }
    };

    const handleFieldChange = (i: number, value: string) => {
        const updated = [...enabledFields];
        updated[i] = value;
        setEnabledFields(updated);
    };

    const addField = () => setEnabledFields([...enabledFields, '']);
    const removeField = (i: number) => {
        const updated = [...enabledFields];
        updated.splice(i, 1);
        setEnabledFields(updated);
    };

    if (loading) return <p>読み込み中...</p>;

    return (
        <div className="ai-formula-config">
            <h2>AIスコア計算式 設定</h2>

            <label>数式：</label>
            <textarea
                value={formula}
                onChange={(e) => setFormula(e.target.value)}
                rows={4}
                style={{ width: '100%' }}
            />

            <label>使用フィールド：</label>
            {enabledFields.map((field, i) => (
                <div key={i} style={{ display: 'flex', marginBottom: 4 }}>
                    <input
                        type="text"
                        value={field}
                        onChange={(e) => handleFieldChange(i, e.target.value)}
                        style={{ flex: 1 }}
                    />
                    <input
                        type="number"
                        step="0.01"
                        value={weights[field] ?? 1.0}
                        onChange={(e) => {
                            const w = { ...weights };
                            w[field] = parseFloat(e.target.value);
                            setWeights(w);
                        }}
                        style={{ width: 80, marginLeft: 8 }}
                    />
                    <button onClick={() => removeField(i)}>削除</button>
                </div>
            ))}
            <button onClick={addField}>＋フィールド追加</button>

            <br /><br />
            <button onClick={handleSave} disabled={status === 'saving'}>
                保存
            </button>

            {status === 'success' && <p style={{ color: 'green' }}>保存しました。</p>}
            {status === 'error' && <p style={{ color: 'red' }}>保存に失敗しました。</p>}
        </div>
    );
};

export default AIFormulaConfig;