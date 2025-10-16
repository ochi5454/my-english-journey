import React, { useEffect, useState } from 'react';
import './QATagMaster.css';
import appConfig from '../../config.ts';


type Role = {
    id: number;
    value: string;
    label: string;
};

type FocusItem = {
    id: number;
    division: string;
    role: string;
    focus_id: string;
    focus_label: string;
};

const QATagMaster: React.FC = () => {
    const [divisions, setDivisions] = useState<{ name: string; prefix: string | null }[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [focusItems, setFocusItems] = useState<FocusItem[]>([]);
    const [newDivision, setNewDivision] = useState('');
    const [newRole, setNewRole] = useState('');
    const [newFocusLabel, setNewFocusLabel] = useState('');
    const [loading, setLoading] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editedLabel, setEditedLabel] = useState('');
    const [filterDivision, setFilterDivision] = useState('');
    const [filterRole, setFilterRole] = useState('');

    // 初回だけ一覧を読み込む
    useEffect(() => {
        fetchDivisions();
        fetchRoles();
        fetchFocusItems();
    }, []);

    // フィルタ変更時に再取得
    useEffect(() => {
        const delay = setTimeout(() => {
            fetchFocusItems();
        }, 400); // 入力中の連続呼び出し防止

        return () => clearTimeout(delay);
    }, [filterDivision, filterRole]);

    const fetchDivisions = async () => {
        try {
            const res = await fetch(`${appConfig.API_BASE_URL}/admin/skills`);
            if (!res.ok) throw new Error('部門取得失敗');
            const data = await res.json();

            // 部門ごとにユニーク化（division="共通" を除外）
            const uniqueDivs: { name: string; prefix: string | null }[] = Array.from(
                new Map<string, string | null>(
                    data
                        .filter((item: any) => item.division && item.division !== '共通')
                        .map((item: any) => [item.division as string, item.division_prefix || null])
                ).entries()
            ).map(([name, prefix]) => ({
                name: name as string,
                prefix: prefix as string | null,
            }));

            setDivisions(uniqueDivs);
        } catch (err) {
            console.error('部門リスト取得エラー:', err);
        }
    };

    const fetchRoles = async () => {
        try {
            const res = await fetch(`${appConfig.API_BASE_URL}/admin/roles`);
            if (!res.ok) throw new Error('ロール取得失敗');
            const data = await res.json();
            setRoles(data);
        } catch (err) {
            console.error('ロール一覧取得エラー:', err);
        }
    };

    const fetchFocusItems = async () => {
        try {
        let url = `${appConfig.API_BASE_URL}/admin/tag`;
        const params = new URLSearchParams();
        if (filterDivision) params.append('division', filterDivision);
        if (filterRole) params.append('role', filterRole);
        if (params.toString()) url += `?${params.toString()}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error('取得失敗');
        const data = await res.json();
        setFocusItems(data);
        } catch (err) {
        console.error('観点取得エラー:', err);
        alert('観点一覧の取得に失敗しました');
        }
    };

        const addFocusItem = async () => {
        if (!newDivision.trim() || !newRole.trim() || !newFocusLabel.trim()) return;
        setLoading(true);
        try {
            // focus_idを自動生成
            const newId = generateFocusId(newDivision, newRole);

            const body = {
            division: newDivision,
            role: newRole,
            focus_id: newId,
            focus_label: newFocusLabel,
            };

            const res = await fetch(`${appConfig.API_BASE_URL}/admin/tag`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error('登録失敗');
            setNewDivision('');
            setNewRole('');
            setNewFocusLabel('');
            await fetchFocusItems();
        } catch (err) {
            console.error('追加失敗:', err);
            alert('観点の追加に失敗しました');
        } finally {
            setLoading(false);
        }
        };

    const updateFocusLabel = async (id: number) => {
        try {
        const res = await fetch(`${appConfig.API_BASE_URL}/admin/tag/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ focus_label: editedLabel }),
        });
        if (!res.ok) throw new Error('更新失敗');
        await fetchFocusItems();
        setEditingId(null);
        } catch (err) {
        alert('観点名の更新に失敗しました');
        }
    };

    const deleteFocusItem = async (id: number) => {
        if (!window.confirm('この観点を削除しますか？')) return;
        try {
        const res = await fetch(`${appConfig.API_BASE_URL}/admin/tag/${id}`, {
            method: 'DELETE',
        });
        if (!res.ok) throw new Error('削除失敗');
        await fetchFocusItems();
        } catch (err) {
        console.error('削除失敗:', err);
        alert('観点の削除に失敗しました');
        }
    };

    const generateFocusId = (division: string, role: string) => {
        const found = divisions.find((d) => d.name === division);
        const prefix = found?.prefix || division.toLowerCase();
        const normalizedRole = role.toLowerCase().replace('+', 'plus');

        const filtered = focusItems.filter(
            (item) => item.division === division && item.role === role
        );

        const numbers = filtered.map((i) => {
            const match = i.focus_id.match(/(\d+)$/);
            return match ? parseInt(match[1], 10) : 0;
        });

        const nextNum = (Math.max(...numbers, 0) + 1).toString().padStart(2, '0');
        return `${prefix}_${normalizedRole}_${nextNum}`;
    };

    return (
        <div className="focus-master">
        <h2>QAタグ管理</h2>

        {/* 追加フォーム */}
        <div className="focus-form">
            <select
                value={newDivision}
                onChange={(e) => setNewDivision(e.target.value)}
            >
                <option value="">部門を選択</option>
                {divisions.map((d) => (
                    <option key={d.name} value={d.name}>
                        {d.name} {d.prefix ? `(${d.prefix})` : ''}
                    </option>
                ))}
            </select>
            <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
            >
                <option value="">ロールを選択</option>
                {roles.map((r) => (
                    <option key={r.id} value={r.value}>
                        {r.label} {r.value ? `(${r.value})` : ''}
                    </option>
                ))}
            </select>
            <input
                type="text"
                placeholder="観点名（例: 論理思考）"
                value={newFocusLabel}
                onChange={(e) => setNewFocusLabel(e.target.value)}
            />
            <button onClick={addFocusItem} disabled={loading || !newFocusLabel.trim()}>
                追加
            </button>
        </div>

        {/* フィルタ */}
        <div className="focus-filter">
            <select
                value={filterDivision}
                onChange={(e) => setFilterDivision(e.target.value)}
            >
                <option value="">全ての部門</option>
                {divisions.map((d) => (
                    <option key={d.name} value={d.name}>
                        {d.name} {d.prefix ? `(${d.prefix})` : ''}
                    </option>
                ))}
            </select>

            <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
            >
                <option value="">全てのロール</option>
                {roles.map((r) => (
                    <option key={r.id} value={r.value}>
                        {r.label} {r.value ? `(${r.value})` : ''}
                    </option>
                ))}
            </select>

            <button
                onClick={() => {
                    setFilterDivision('');
                    setFilterRole('');
                }}
                className="focus-clear-button"
            >
                クリア
            </button>
        </div>

        <p className="focus-warning">
            ※観点名の変更は、全く意味の異なるものへに編集しないようご注意ください。異なる場合は <strong>新規観点を追加</strong> してください。
        </p>

        {/* 一覧テーブル */}
        <table className="focus-table">
            <thead>
            <tr>
                <th>ID</th>
                <th>部門</th>
                <th>ロール</th>
                <th>観点ID</th>
                <th>観点名</th>
                <th>操作</th>
            </tr>
            </thead>
            <tbody>
            {focusItems.map((item) => (
                <tr key={item.id}>
                <td>{item.id}</td>
                <td> <span className="division">{item.division}</span></td>
                <td>{roles.find((r) => r.value === item.role)?.label || item.role}</td>
                <td><code>{item.focus_id}</code></td>
                <td>
                    {editingId === item.id ? (
                    <>
                        <input
                            value={editedLabel}
                            onChange={(e) => setEditedLabel(e.target.value)}
                            style={{ width: '140px', marginRight: '8px' }}
                        />
                        <button onClick={() => updateFocusLabel(item.id)} className="small-button">
                            保存
                        </button>
                        <button onClick={() => setEditingId(null)} className="small-button">
                            ×
                        </button>
                    </>
                    ) : (
                    <>
                        {item.focus_label}
                        <button
                            onClick={() => {
                                setEditingId(item.id);
                                setEditedLabel(item.focus_label);
                            }}
                            className="icon-button"
                        >
                            🖋️
                        </button>
                    </>
                    )}
                </td>
                <td>
                    <button onClick={() => deleteFocusItem(item.id)}>削除</button>
                </td>
                </tr>
            ))}
            </tbody>
        </table>
        </div>
    );
};

export default QATagMaster;