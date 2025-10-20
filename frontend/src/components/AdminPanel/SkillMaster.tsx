import React, { useEffect, useState } from 'react';
import './SkillMaster.css';
import appConfig from '../../config.ts';

type Skill = {
    id: number;
    division?: string;
    trait_type: string;
    trait_label: string;
    division_prefix?: string;
};

const SkillMaster: React.FC = () => {
    const [skills, setSkills] = useState<Skill[]>([]);
    const [newDivision, setNewDivision] = useState('');
    const [newDivisionPrefix, setNewDivisionPrefix] = useState('');
    const [newTraitType, setNewTraitType] = useState<'must_requirement' | 'desired_trait'>('desired_trait');
    const [newTraitLabel, setNewTraitLabel] = useState('');
    const [loading, setLoading] = useState(false);
    const [editingSkillId, setEditingSkillId] = useState<number | null>(null);
    const [editedLabel, setEditedLabel] = useState<string>('');
    const [filterDivision, setFilterDivision] = useState('');

    useEffect(() => {
        fetchSkills();
    }, [filterDivision]);

    const fetchSkills = async () => {
        try {
            let url = `${appConfig.API_BASE_URL}/admin/skills`;
            if (filterDivision) {
                url += `?division_prefix=${encodeURIComponent(filterDivision)}`;
            }

            const res = await fetch(url);
            const data = await res.json();
            setSkills(data);
        } catch (err) {
            console.error('スキル取得エラー:', err);
            alert('スキル一覧の取得に失敗しました');
        }
    };

    const divisionList = Array.from(
        new Set(skills.map((s) => s.division_prefix || 'common'))
    );

    const addSkill = async () => {
        if (!newTraitLabel.trim()) return;
        setLoading(true);
        try {
            const body = {
                division_prefix: newDivisionPrefix || null,
                trait_type: newTraitType,
                trait_label: newTraitLabel,
            };

            const res = await fetch(`${appConfig.API_BASE_URL}/admin/skills`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                throw new Error('登録失敗');
            }

            setNewDivision('');
            setNewTraitLabel('');
            setNewTraitType('desired_trait');
            await fetchSkills();
        } catch (err) {
            console.error('追加失敗:', err);
            alert('スキルの追加に失敗しました');
        } finally {
            setLoading(false);
        }
    };

    const updateSkillLabel = async (id: number) => {
        try {
            const res = await fetch(`${appConfig.API_BASE_URL}/admin/skills/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trait_label: editedLabel }),
            });
            if (!res.ok) throw new Error('更新失敗');
            await fetchSkills();
            setEditingSkillId(null);
        } catch (err) {
            alert('スキル名の更新に失敗しました');
        }
    };

    const deleteSkill = async (id: number) => {
        if (!window.confirm('このスキルを削除しますか？')) return;

        try {
            const res = await fetch(`${appConfig.API_BASE_URL}/admin/skills/${id}`, {
                method: 'DELETE',
            });

            if (!res.ok) {
                throw new Error('削除失敗');
            }

            await fetchSkills();
        } catch (err) {
            console.error('削除失敗:', err);
            alert('スキルの削除に失敗しました');
        }
    };

    return (
        <div className="skill-master">
            <h2>部門・スキル管理</h2>

            {/* 追加フォーム */}
            <div className="skill-form">
                <input
                    type="text"
                    placeholder="部門"
                    value={newDivision}
                    onChange={(e) => setNewDivision(e.target.value)}
                />
                <input
                    type="text"
                    placeholder="部門プレフィックス"
                    value={newDivisionPrefix}
                    onChange={(e) => setNewDivisionPrefix(e.target.value)}
                />
                <select
                    value={newTraitType}
                    onChange={(e) => setNewTraitType(e.target.value as 'must_requirement' | 'desired_trait')}
                >
                    <option value="must_requirement">マスト要件</option>
                    <option value="desired_trait">歓迎スキル</option>
                </select>
                <input
                    type="text"
                    placeholder="スキル名"
                    value={newTraitLabel}
                    onChange={(e) => setNewTraitLabel(e.target.value)}
                />
                <button onClick={addSkill} disabled={loading || !newTraitLabel.trim()}>
                    追加
                </button>
            </div>

            {/* フィルタ */}
            <div className="skill-filter">
                <select
                    value={filterDivision}
                    onChange={(e) => setFilterDivision(e.target.value)}
                >
                    <option value="">全ての部門（共通含む）</option>
                    {divisionList.map((prefix) => (
                        <option
                            key={prefix}
                            value={prefix} // ← 内部値 = prefix をそのまま渡してOK
                        >
                            {/* ✅ 表示名だけ和名 (division) に変換 */}
                            {skills.find(s => s.division_prefix === prefix)?.division || prefix}
                        </option>
                    ))}
                </select>

                <button
                    onClick={() => setFilterDivision('')}
                    className="skil-clear-button"
                >
                    クリア
                </button>
            </div>

            <p className="skill-warning">
                ※スキル名の変更は、全く意味の異なるものへに編集しないようご注意ください。異なる場合は <strong>新規スキルを追加</strong> してください。
            </p>

            <table className="skill-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>部門</th>
                        <th>プレフィックス</th>
                        <th>種別</th>
                        <th>スキル名</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>
                    {skills.map((skill) => (
                        <tr key={skill.id}>
                            <td>{skill.id}</td>
                            <td>
                                {skill.division ? <span className="division">{skill.division}</span> : '―'}
                            </td>
                            <td>{skill.division_prefix || '―'}</td>
                            <td>
                                <span className={`badge ${skill.trait_type === 'must_requirement' ? 'must' : 'desired'}`}>
                                    {skill.trait_type === 'must_requirement' ? 'マスト' : '歓迎'}
                                </span>
                            </td>
                            <td>
                                {editingSkillId === skill.id ? (
                                    <>
                                        <input
                                            value={editedLabel}
                                            onChange={(e) => setEditedLabel(e.target.value)}
                                            style={{ width: '140px', marginRight: '8px' }}
                                        />
                                        <button
                                            onClick={() => updateSkillLabel(skill.id)}
                                            className="small-button"
                                        >
                                            保存
                                        </button>
                                        <button
                                            onClick={() => setEditingSkillId(null)}
                                            className="small-button"
                                        >
                                            ×
                                        </button>
                                    </>
                                    ) : (
                                    <>
                                        {skill.trait_label}
                                        <button
                                            onClick={() => {
                                                setEditingSkillId(skill.id);
                                                setEditedLabel(skill.trait_label);
                                            }}
                                            className="icon-button"
                                        >
                                            🖌️
                                        </button>
                                    </>
                                )}
                            </td>
                            <td>
                                <button onClick={() => deleteSkill(skill.id)}>削除</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default SkillMaster;