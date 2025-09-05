import React, { useEffect, useMemo, useState } from 'react';
import './ResumeInterviewerRoleFocusOverview.css';
import axios from 'axios';
import appConfig from '../config.ts';

// ======================== 型定義 ========================
type FocusTag = {
    id: string;
    label: string;
};

type RoleFocusSummary = {
    [roleKey: string]: {
        expected_tags: FocusTag[];
        used_tags: Record<string, number>;  // ※ keyは tag.id
        missing_tags: FocusTag[];
    };
};

const ROLE_ORDER = ['c', 'sc', 'm', 'sm', 'd+']; // 小文字に統一

const ResumeInterviewerRoleFocusOverview: React.FC = () => {
  const [data, setData] = useState<RoleFocusSummary>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await axios.get<RoleFocusSummary>(`${appConfig.API_BASE_URL}/checksheet/role-focus-summary`);
        setData(res.data);
      } catch (err: any) {
        setError('読み込みに失敗しました');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // マトリクス形式に整形
    const matrixData = useMemo(() => {
    const matrix: Record<string, Record<string, { tags: FocusTag[]; used: Record<string, number> }>> = {};
    for (const roleKey in data) {
        const [dept, role] = roleKey.split(':');
        if (!dept || !role || dept === 'common') continue;

        const deptLower = dept.toLowerCase();
        const roleLower = role.toLowerCase();

        if (!matrix[deptLower]) matrix[deptLower] = {};
        matrix[deptLower][roleLower] = {
        tags: data[roleKey].expected_tags || [],
        used: data[roleKey].used_tags || {},
        };
    }
    return matrix;
    }, [data]);

  const departments = useMemo(() =>
    Object.keys(matrixData).sort(), // common は already 除外済み
    [matrixData]
  );

  return (
    <div className="role-matrix-container">
      {error && <div className="iq-error">{error}</div>}
      {loading ? (
        <div>読み込み中...</div>
      ) : (
        <div>
          <table className="role-matrix-table">
            <thead>
              <tr>
                <th>部門＼ロール</th>
                {ROLE_ORDER.map(role => (
                  <th key={role}>
                    <span className={`role-chip role-${role}`}>{role.toUpperCase()}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {departments.map(dept => (
                <tr key={dept}>
                  <td>{dept}</td>
                  {ROLE_ORDER.map(role => {
                    const cell = matrixData[dept]?.[role];
                    const tags = cell?.tags ?? [];
                    const usedMap = cell?.used ?? {};
                    return (
                      <td key={`${dept}:${role}`}>
                        <div className="tag-chip-container">
                            {tags.map((tag, idx) => {
                            const tagId = tag?.id;
                            const tagLabel = (tag?.label && tag.label !== "expected_focus")
                            ? tag.label
                            : "（ラベル不明）";
                            if (!tagId) return null; // 無効なタグはスキップ

                            const count = usedMap[tagId] ?? 0;
                            const className =
                                count >= 3 ? 'tag-chip high' :
                                count >= 1 ? 'tag-chip medium' :
                                'tag-chip low';

                            return (
                                <span key={`${tagId}-${idx}`} className={className} title={`出現: ${count}回`}>
                                {tagLabel}
                                </span>
                            );
                            })}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ResumeInterviewerRoleFocusOverview;