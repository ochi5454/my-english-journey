import React, { useEffect, useState } from 'react';
import './RoleMaster.css';
import appConfig from '../../config.ts';

type Role = {
    id: number;
    value: string;
    label: string;
    order?: number;
};

const RoleMaster: React.FC = () => {
    const [roles, setRoles] = useState<Role[]>([]);
    const [newValue, setNewValue] = useState('');
    const [newLabel, setNewLabel] = useState('');
    const [newOrder, setNewOrder] = useState<number | ''>('');
    const [loading, setLoading] = useState(false);

    // 編集用ステート（個別管理）
    const [editingLabelId, setEditingLabelId] = useState<number | null>(null);
    const [editedLabel, setEditedLabel] = useState('');
    const [editingOrderId, setEditingOrderId] = useState<number | null>(null);
    const [editedOrder, setEditedOrder] = useState<number | ''>('');

    useEffect(() => {
        fetchRoles();
    }, []);

    const fetchRoles = async () => {
        try {
            const res = await fetch(`${appConfig.API_BASE_URL}/admin/roles`);
            if (!res.ok) throw new Error('ロール一覧取得失敗');
            const data = await res.json();
            setRoles(data);
        } catch (err) {
            console.error('ロール一覧取得エラー:', err);
            alert('ロール一覧の取得に失敗しました');
        }
    };

    const addRole = async () => {
        if (!newValue.trim() || !newLabel.trim()) return;
        setLoading(true);
        try {
            const body = {
                value: newValue.trim(),
                label: newLabel.trim(),
                order: newOrder === '' ? null : Number(newOrder),
            };
            const res = await fetch(`${appConfig.API_BASE_URL}/admin/roles`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error('登録失敗');
            setNewValue('');
            setNewLabel('');
            setNewOrder('');
            await fetchRoles();
        } catch (err) {
            console.error('追加失敗:', err);
            alert('ロールの追加に失敗しました');
        } finally {
            setLoading(false);
        }
    };

    const updateRoleField = async (id: number, field: 'label' | 'order', value: string | number | null) => {
        try {
            const body: any = { [field]: value };
            const res = await fetch(`${appConfig.API_BASE_URL}/admin/roles/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error('更新失敗');
            await fetchRoles();
            setEditingLabelId(null);
            setEditingOrderId(null);
        } catch (err) {
            alert('ロール情報の更新に失敗しました');
        }
    };

    const deleteRole = async (id: number) => {
        if (!window.confirm('このロールを削除しますか？')) return;
        try {
            const res = await fetch(`${appConfig.API_BASE_URL}/admin/roles/${id}`, {
                method: 'DELETE',
            });
            if (!res.ok) throw new Error('削除失敗');
            await fetchRoles();
        } catch (err) {
            console.error('削除失敗:', err);
            alert('ロールの削除に失敗しました');
        }
    };

    return (
        <div className="role-master">
            <h2>ロール管理</h2>

            {/* 追加フォーム */}
            <div className="role-form">
                <input
                    type="text"
                    placeholder="プレフィックス（例: SM）"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                />
                <input
                    type="text"
                    placeholder="ロール名（例: 部長）"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                />
                <input
                    type="number"
                    placeholder="順序（例: 1）"
                    value={newOrder}
                    onChange={(e) => setNewOrder(e.target.value === '' ? '' : Number(e.target.value))}
                    style={{ width: '100px' }}
                />
                <button onClick={addRole} disabled={loading || !newValue.trim() || !newLabel.trim()}>
                    追加
                </button>
            </div>

            <p className="role-warning">
                ※ロール名や順序を変更すると関連設定に影響します。意味の異なるロールは
                <strong> 新規追加 </strong>してください。
            </p>

            <table className="role-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>プレフィックス</th>
                        <th>ロール名</th>
                        <th>順序</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>
                    {roles.map((r) => (
                        <tr key={r.id}>
                            <td>{r.id}</td>
                            <td>
                                <code>{r.value}</code>
                            </td>

                            {/* --- ロール名セル --- */}
                            <td>
                                {editingLabelId === r.id ? (
                                    <>
                                        <input
                                            value={editedLabel}
                                            onChange={(e) => setEditedLabel(e.target.value)}
                                            style={{ width: '140px', marginRight: '8px' }}
                                        />
                                        <button
                                            onClick={() => updateRoleField(r.id, 'label', editedLabel)}
                                            className="small-button"
                                        >
                                            保存
                                        </button>
                                        <button
                                            onClick={() => setEditingLabelId(null)}
                                            className="small-button"
                                        >
                                            ×
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        {r.label}
                                        <button
                                            onClick={() => {
                                                setEditingLabelId(r.id);
                                                setEditedLabel(r.label);
                                            }}
                                            className="icon-button"
                                        >
                                            🖋️
                                        </button>
                                    </>
                                )}
                            </td>

                            {/* --- 順序セル --- */}
                            <td>
                                {editingOrderId === r.id ? (
                                    <>
                                        <input
                                            type="number"
                                            value={editedOrder}
                                            onChange={(e) =>
                                                setEditedOrder(e.target.value === '' ? '' : Number(e.target.value))
                                            }
                                            style={{ width: '70px', marginRight: '8px' }}
                                        />
                                        <button
                                            onClick={() => updateRoleField(r.id, 'order', editedOrder)}
                                            className="small-button"
                                        >
                                            保存
                                        </button>
                                        <button
                                            onClick={() => setEditingOrderId(null)}
                                            className="small-button"
                                        >
                                            ×
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        {r.order ?? '-'}
                                        <button
                                            onClick={() => {
                                                setEditingOrderId(r.id);
                                                setEditedOrder(r.order ?? '');
                                            }}
                                            className="icon-button"
                                        >
                                            🖋️
                                        </button>
                                    </>
                                )}
                            </td>

                            <td>
                                <button onClick={() => deleteRole(r.id)}>削除</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default RoleMaster;