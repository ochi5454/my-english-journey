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

// role文字列を ID 用に正規化 (D+ → dplus など)
const normalizeRoleForId = (role: string) =>
    role.toLowerCase().replace(/\+/g, 'plus').replace(/[^a-z0-9]+/g, '_');

// 既存ID群(existing) を基に次IDを生成
const nextFocusId = (prefix: string, role: string, existing: { focus_id: string }[]) => {
    const normRole = normalizeRoleForId(role);
    const base = `${prefix}_${normRole}_`;

    const numbers = existing
        .map((i) => {
        const m = i.focus_id?.startsWith(base) ? i.focus_id.match(/(\d+)$/) : null;
        return m ? parseInt(m[1], 10) : 0;
        })
        .filter((n) => !Number.isNaN(n));

    const next = (Math.max(0, ...numbers) + 1).toString().padStart(2, '0');
    return `${base}${next}`;
};

// DBから最新だけ取得 → 安全採番のために使う
const fetchExistingForIdGen = async (apiBase: string, divisionPrefix: string, role: string) => {
    const qs = new URLSearchParams({ division_prefix: divisionPrefix, role }).toString();
    const res = await fetch(`${apiBase}/admin/tag?${qs}`);
    if (!res.ok) throw new Error('id採番用の取得に失敗しました');
    return (await res.json()) as { focus_id: string }[];
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
        const res = await fetch(`${appConfig.API_BASE_URL}/admin/skills`);
        const data = await res.json();

        // ✅ SkillMaster と完全に同じ設計にする
        const uniqueDivs: { name: string; prefix: string | null }[] =
            Array.from(
                new Set<string>(  // ← Set に string を明示！！
                    data.map((s: any) =>
                        typeof s.division_prefix === "string" ? s.division_prefix : "common"
                    )
                )
            ).map((prefix) => {
                const matched = data.find((s: any) => s.division_prefix === prefix);
                return {
                    name: typeof matched?.division === "string" ? matched.division : prefix,
                    prefix: prefix, // prefix は string と TypeScript が確信する
                };
            });

        // ✅ "common" 以外のみ選択肢に含める
        setDivisions(uniqueDivs.filter((d) => d.prefix && d.prefix !== 'common'));
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
        if (filterDivision) params.append('division_prefix', filterDivision);
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
            // newDivision は prefix (例: "fac") 選択済み
            const divisionPrefix = newDivision;
            const divisionName = divisions.find(d => d.prefix === divisionPrefix)?.name || divisionPrefix;

            // ✅ 最新のDB状態を見てから採番（←ココが超重要）
            const existing = await fetchExistingForIdGen(appConfig.API_BASE_URL, divisionPrefix, newRole);
            const newId = nextFocusId(divisionPrefix, newRole, existing);

            const body = {
            division: divisionName,          // 和名
            division_prefix: divisionPrefix, // prefix
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
                    <option key={d.prefix || d.name} value={d.prefix || ''}>
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
                    <option 
                        key={d.prefix || d.name} 
                        value={d.prefix || ''}
                    >
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