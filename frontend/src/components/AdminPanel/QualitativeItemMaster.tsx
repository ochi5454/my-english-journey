import React, { useEffect, useState } from 'react';
import './QualitativeItemMaster.css';
import appConfig from '../../config.ts';

type QualitativeItem = {
    id: string;
    key: string;
    label: string;
    placeholder: string;
    order?: number | null; 
    pay_type?: 'daily_monthly' | 'hourly';
    is_active?: boolean;
};

const QualitativeItemMaster: React.FC = () => {
    const [items, setItems] = useState<QualitativeItem[]>([]);
    const [newKey, setNewKey] = useState('');
    const [newLabel, setNewLabel] = useState('');
    const [newPlaceholder, setNewPlaceholder] = useState('');
    const [newOrder, setNewOrder] = useState<number | ''>('');
    const [newPayType, setNewPayType] = useState<'daily_monthly' | 'hourly'>('daily_monthly');
    const [loading, setLoading] = useState(false);

    // --- 編集対象管理（ラベル／プレースホルダー別） ---
    const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
    const [editedLabel, setEditedLabel] = useState('');
    const [editingPlaceholderId, setEditingPlaceholderId] = useState<string | null>(null);
    const [editedPlaceholder, setEditedPlaceholder] = useState('');
    const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
    const [editedOrder, setEditedOrder] = useState<number | ''>('');
    const [editingPayTypeId, setEditingPayTypeId] = useState<string | null>(null);
    const [editedPayType, setEditedPayType] = useState<'daily_monthly' | 'hourly'>('daily_monthly');

    // --- モーダル編集用 ---
    const [modalItem, setModalItem] = useState<QualitativeItem | null>(null);
    const [modalField, setModalField] = useState<'label' | 'placeholder' | null>(null);
    const [modalValue, setModalValue] = useState('');

    useEffect(() => {
        fetchItems();
    }, []);

    const fetchItems = async () => {
        try {
            const res = await fetch(`${appConfig.API_BASE_URL}/admin/qualitative-items`);
            if (!res.ok) throw new Error('一覧取得失敗');
            const data = await res.json();
            setItems(data);
        } catch (err) {
            console.error('定性評価一覧取得エラー:', err);
            alert('定性評価項目の取得に失敗しました');
        }
    };

    const addItem = async () => {
        if (!newKey.trim() || !newLabel.trim()) return;
        setLoading(true);
        try {
            const body = {
                key: newKey.trim(),
                label: newLabel.trim(),
                placeholder: newPlaceholder.trim(),
                order: newOrder === '' ? null : Number(newOrder),
                pay_type: newPayType,
                is_active: true, // ← デフォルトで有効
            };
            const res = await fetch(`${appConfig.API_BASE_URL}/admin/qualitative-items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                // ✅ サーバーからのエラーメッセージを取得
                const errData = await res.json().catch(() => ({}));
                const message = errData?.detail || '登録失敗';
                throw new Error(message);
            }

            setNewKey('');
            setNewLabel('');
            setNewPlaceholder('');
            await fetchItems();
        } catch (err: any) {
            console.error('追加失敗:', err);
            // ✅ detail内容をアラートに表示
            alert(`項目の追加に失敗しました：${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const updateItemField = async (
        id: string,
        field: 'label' | 'placeholder' | 'is_active' | 'order' | 'pay_type',
        value: any
    ) => {
        try {
            const body: any = { [field]: value };
            const res = await fetch(`${appConfig.API_BASE_URL}/admin/qualitative-items/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error('更新失敗');
            await fetchItems();
            setEditingLabelId(null);
            setEditingPlaceholderId(null);
        } catch (err) {
            alert('定性評価項目の更新に失敗しました');
        }
    };

    const deleteItem = async (id: string) => {
        if (!window.confirm('この項目を削除しますか？')) return;
        try {
            const res = await fetch(`${appConfig.API_BASE_URL}/admin/qualitative-items/${id}`, {
                method: 'DELETE',
            });
            if (!res.ok) throw new Error('削除失敗');
            await fetchItems();
        } catch (err) {
            console.error('削除失敗:', err);
            alert('定性評価項目の削除に失敗しました');
        }
    };

    return (
        <div className="qualitative-master">
            <h2>定性評価項目管理</h2>

            {/* 追加フォーム */}
            <div className="qualitative-form">
                <input
                    type="text"
                    placeholder="key（例: careerGoals）"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                />
                <input
                    type="text"
                    placeholder="ラベル（例: 本人希望・キャリアゴール等）"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                />
                <input
                    type="text"
                    placeholder="プレースホルダー（例: やりたい役割...）"
                    value={newPlaceholder}
                    onChange={(e) => setNewPlaceholder(e.target.value)}
                    style={{ width: '300px' }}
                />
                <input
                    type="number"
                    placeholder="順序"
                    value={newOrder}
                    onChange={(e) => setNewOrder(e.target.value === '' ? '' : Number(e.target.value))}
                    style={{ width: '80px' }}
                />

                <select value={newPayType} onChange={(e) => setNewPayType(e.target.value as 'daily_monthly' | 'hourly')}>
                    <option value="daily_monthly">日給月給者向け</option>
                    <option value="hourly">時給者向け</option>
                </select>
                <button onClick={addItem} disabled={loading || !newKey.trim() || !newLabel.trim()}>
                    追加
                </button>
            </div>

            <p className="qualitative-warning">
                ※ラベル名の変更は、全く意味の異なるものへに編集しないようご注意ください。
                異なる場合は<strong> 新規追加 </strong>をしてください。
            </p>

            <table className="qualitative-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>key</th>
                        <th>ラベル</th>
                        <th>プレースホルダー</th>
                        <th>順序</th>
                        <th>区分</th>
                        <th>有効</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>
                    {items
                        .slice() // 元配列を破壊しない
                        .sort((a, b) => {
                            // ① is_active: false を下へ
                            if (a.is_active && !b.is_active) return -1;
                            if (!a.is_active && b.is_active) return 1;

                            // ② pay_type: 日給月給 → 時給
                            if (a.pay_type !== b.pay_type) {
                                return a.pay_type === 'daily_monthly' ? -1 : 1;
                            }

                            // ③ order: 昇順（nullは一番下に）
                            const orderA = a.order ?? Infinity;
                            const orderB = b.order ?? Infinity;
                            return orderA - orderB;
                        })
                        .map((item) => (
                        <tr key={item.id} className={!item.is_active ? 'inactive' : ''}>
                            <td>{item.id}</td>
                            <td><code>{item.key}</code></td>

                            {/* --- ラベルセル --- */}
                            <td>
                                {editingLabelId === item.id ? (
                                    <>
                                        <input
                                            value={editedLabel}
                                            onChange={(e) => setEditedLabel(e.target.value)}
                                            style={{ width: '220px', marginRight: '8px' }}
                                        />
                                        <button
                                            onClick={() => updateItemField(item.id, 'label', editedLabel)}
                                            className="qualitative-small-button"
                                        >
                                            保存
                                        </button>
                                        <button
                                            onClick={() => setEditingLabelId(null)}
                                            className="qualitative-small-button"
                                        >
                                            ×
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        {item.label}
                                        <button
                                            onClick={() => {
                                                setModalItem(item);
                                                setModalField('label');
                                                setModalValue(item.label);
                                            }}
                                            className="qualitative-icon-button"
                                            >
                                            🖋️
                                        </button>
                                    </>
                                )}
                            </td>

                            {/* --- プレースホルダーセル --- */}
                            <td>
                                {editingPlaceholderId === item.id ? (
                                    <>
                                        <input
                                            value={editedPlaceholder}
                                            onChange={(e) => setEditedPlaceholder(e.target.value)}
                                            style={{ width: '320px', marginRight: '8px' }}
                                        />
                                        <button
                                            onClick={() => updateItemField(item.id, 'placeholder', editedPlaceholder)}
                                            className="qualitative-small-button"
                                        >
                                            保存
                                        </button>
                                        <button
                                            onClick={() => setEditingPlaceholderId(null)}
                                            className="qualitative-small-button"
                                        >
                                            ×
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        {item.placeholder}
                                        <button
                                            onClick={() => {
                                                setModalItem(item);
                                                setModalField('placeholder');
                                                setModalValue(item.placeholder);
                                            }}
                                            className="qualitative-icon-button"
                                            >
                                            🖋️
                                        </button>
                                    </>
                                )}
                            </td>
                            {/* --- order（順序） --- */}
                            <td>
                                {editingOrderId === item.id ? (
                                    <>
                                    <input
                                        type="number"
                                        value={editedOrder}
                                        onChange={(e) => setEditedOrder(e.target.value === '' ? '' : Number(e.target.value))}
                                        style={{ width: '60px', textAlign: 'center', marginRight: '6px' }}
                                    />
                                    <button
                                        onClick={() => {
                                        updateItemField(item.id, 'order', Number(editedOrder));
                                        setEditingOrderId(null);
                                        }}
                                        className="qualitative-small-button"
                                    >
                                        保存
                                    </button>
                                    <button
                                        onClick={() => setEditingOrderId(null)}
                                        className="qualitative-small-button"
                                    >
                                        ×
                                    </button>
                                    </>
                                ) : (
                                    <>
                                    {item.order ?? '-'}
                                    <button
                                        onClick={() => {
                                        setEditingOrderId(item.id);
                                        setEditedOrder(item.order ?? '');
                                        }}
                                        className="qualitative-icon-button"
                                    >
                                        🖋️
                                    </button>
                                    </>
                                )}
                            </td>
                            {/* --- pay_type（日給月給 or 時給） --- */}
                            <td>
                                {editingPayTypeId === item.id ? (
                                    <>
                                    <select
                                        value={editedPayType}
                                        onChange={(e) => setEditedPayType(e.target.value as 'daily_monthly' | 'hourly')}
                                        style={{ marginRight: '6px' }}
                                    >
                                        <option value="daily_monthly">日給月給</option>
                                        <option value="hourly">時給</option>
                                    </select>
                                    <button
                                        onClick={() => {
                                        updateItemField(item.id, 'pay_type', editedPayType);
                                        setEditingPayTypeId(null);
                                        }}
                                        className="qualitative-small-button"
                                    >
                                        保存
                                    </button>
                                    <button
                                        onClick={() => setEditingPayTypeId(null)}
                                        className="qualitative-small-button"
                                    >
                                        ×
                                    </button>
                                    </>
                                ) : (
                                    <>
                                    {item.pay_type === 'hourly' ? '時給' : '日給月給'}
                                    <button
                                        onClick={() => {
                                        setEditingPayTypeId(item.id);
                                        setEditedPayType(item.pay_type || 'daily_monthly');
                                        }}
                                        className="qualitative-icon-button"
                                    >
                                        🖋️
                                    </button>
                                    </>
                                )}
                            </td>
                            <td>
                                <input
                                    type="checkbox"
                                    checked={item.is_active}
                                    onChange={(e) => updateItemField(item.id, 'is_active', e.target.checked)}
                                />
                            </td>
                            <td>
                                <button onClick={() => deleteItem(item.id)}>削除</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {modalItem && modalField && (
                <div className="qualitative-modal-overlay" onClick={() => setModalItem(null)}>
                    <div className="qualitative-modal-box" onClick={(e) => e.stopPropagation()}>
                    <h3>
                        「{modalItem.key}」の
                        {modalField === 'label' ? 'ラベル' : 'プレースホルダー'}を編集
                    </h3>
                    <textarea
                        value={modalValue}
                        onChange={(e) => setModalValue(e.target.value)}
                        className="qualitative-modal-textarea"
                    />
                    <div className="qualitative-modal-actions">
                        <button
                        onClick={() => {
                            updateItemField(modalItem.id, modalField, modalValue);
                            setModalItem(null);
                        }}
                        className="qualitative-modal-save"
                        >
                        保存
                        </button>
                        <button onClick={() => setModalItem(null)} className="qualitative-modal-cancel">
                        閉じる
                        </button>
                    </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default QualitativeItemMaster;