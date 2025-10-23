import React, { useState } from 'react';
import appConfig from '../../config.ts';
import './SkillAISuggestPanel.css';

type SuggestResponse = {
    division?: string;
    division_prefix?: string;
    suggested: {
        must_requirement: string[];
        desired_trait: string[];
    };
    deduped_against_existing: {
        must_requirement: string[];
        desired_trait: string[];
    };
};

type SkillAISuggestPanelProps = {
    division: string;
    divisionPrefix: string;
    onSkillsAdded: () => void;
};

type TraitType = 'must_requirement' | 'desired_trait';
type SkillRow = {
    skill: string;
    selected: boolean;
    traitType: TraitType;
    division: string;
    prefix: string;
};

const SkillAISuggestPanel: React.FC<SkillAISuggestPanelProps> = ({
    division,
    divisionPrefix,
    onSkillsAdded,
}) => {
    const [jobText, setJobText] = useState('');
    const [loading, setLoading] = useState(false);
    const [suggested, setSuggested] = useState<SuggestResponse | null>(null);
    const [skillStates, setSkillStates] = useState<SkillRow[]>([]);
    const [divisionInput, setDivisionInput] = useState(division);
    const [prefixInput, setPrefixInput] = useState(divisionPrefix);

    // ---- AIスキル抽出 ----
    const handleSuggest = async () => {
        if (!jobText.trim()) {
            alert('求人票本文を入力してください');
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(`${appConfig.API_BASE_URL}/admin/skills/suggest`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    job_text: jobText,
                    division: divisionInput || division,
                    division_prefix: prefixInput || divisionPrefix,
                }),
            });
            const data: SuggestResponse = await res.json();
            setSuggested(data);

            // ✅ AI推定結果から SkillRow 配列を構築
            const mustSkills =
                data?.deduped_against_existing?.must_requirement?.map((s) => ({
                    skill: s,
                    selected: false,
                    traitType: 'must_requirement' as TraitType,
                    division: divisionInput || division,
                    prefix: prefixInput || divisionPrefix,
                })) ?? [];

            const desiredSkills =
                data?.deduped_against_existing?.desired_trait?.map((s) => ({
                    skill: s,
                    selected: false,
                    traitType: 'desired_trait' as TraitType,
                    division: divisionInput || division,
                    prefix: prefixInput || divisionPrefix,
                })) ?? [];

            // ✅ must と desired を結合して state に反映
            setSkillStates([...mustSkills, ...desiredSkills]);
        } catch (err) {
            console.error('スキル抽出失敗:', err);
            alert('スキル抽出に失敗しました');
        } finally {
            setLoading(false);
        }
    };

    // ---- チェック切替 ----
    const toggleSelect = (index: number) => {
        setSkillStates((prev) =>
            prev.map((row, i) => (i === index ? { ...row, selected: !row.selected } : row))
        );
    };

    // ---- 項目変更 ----
    const updateField = <K extends keyof SkillRow>(index: number, field: K, value: SkillRow[K]) => {
        setSkillStates((prev) =>
            prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
        );
    };

    // ---- 登録処理 ----
    const handleRegister = async () => {
        const selected = skillStates.filter((s) => s.selected);
        if (!selected.length) {
            alert('登録するスキルを選択してください');
            return;
        }

        setLoading(true);
        try {
            for (const s of selected) {
                await fetch(`${appConfig.API_BASE_URL}/admin/skills`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        division: divisionInput || division,
                        division_prefix: prefixInput || divisionPrefix,
                        trait_type: s.traitType,
                        trait_label: s.skill,
                    }),
                });
            }

            alert(`${selected.length}件のスキルを登録しました`);
            setSuggested(null);
            setSkillStates([]);
            onSkillsAdded();
        } catch (err) {
            console.error(err);
            alert('登録に失敗しました');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="skill-ai-suggest">
            <h3>AIによるスキル抽出</h3>

            {/* --- 求人本文入力 --- */}
            <textarea
                placeholder="求人票本文を貼り付けてください"
                value={jobText}
                onChange={(e) => setJobText(e.target.value)}
                rows={6}
            />

            <div className="extract-button-container">
                <button className="extract-button" onClick={handleSuggest} disabled={loading}>
                    {loading ? '抽出中...' : 'AIスキル抽出'}
                </button>
            </div>

            {/* --- 抽出結果 --- */}
            {suggested && (
                <div className="ai-suggest-result">
                    <h4>抽出結果（AI推定：マスト／歓迎）</h4>

                    <table className="skill-table">
                        <thead>
                            <tr>
                                <th></th>
                                <th>スキル名</th>
                                <th>区分（AI推定初期値）</th>
                            </tr>
                        </thead>
                        <tbody>
                            {skillStates.map((s, i) => (
                                <tr key={i}>
                                    <td>
                                        <input
                                            type="checkbox"
                                            checked={s.selected}
                                            onChange={() => toggleSelect(i)}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="text"
                                            value={s.skill}
                                            onChange={(e) => updateField(i, 'skill', e.target.value)}
                                            className="skill-edit-input"
                                        />
                                    </td>
                                    <td>
                                        <select
                                            value={s.traitType}
                                            onChange={(e) =>
                                                updateField(i, 'traitType', e.target.value as TraitType)
                                            }
                                        >
                                            <option value="must_requirement">マスト</option>
                                            <option value="desired_trait">歓迎</option>
                                        </select>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* ✅ 部門・プレフィックス入力欄＋登録ボタン */}
                    <div className="register-section">
                        <div className="division-inputs">
                            <input
                                type="text"
                                placeholder="部門名（例：人事）"
                                value={divisionInput}
                                onChange={(e) => setDivisionInput(e.target.value)}
                            />
                            <input
                                type="text"
                                placeholder="プレフィックス（例：hr）"
                                value={prefixInput}
                                onChange={(e) => setPrefixInput(e.target.value)}
                            />
                        </div>

                        <button
                            className="register-button"
                            onClick={handleRegister}
                            disabled={loading}
                        >
                            {loading ? '登録中...' : '選択スキルを登録'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SkillAISuggestPanel;