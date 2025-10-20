import React, { useEffect, useMemo, useState } from 'react';
import './InterviewerRoleFocusOverview.css';
import axios from 'axios';
import appConfig from '../../config.ts';

// ======================== 型定義 ========================
type FocusTag = {
  id: string;
  label: string;
};

type RoleFocusSummary = {
  [roleKey: string]: {
    expected_tags: FocusTag[];
    used_tags: Record<string, number>;
    missing_tags: FocusTag[];
  };
};

type Role = {
  id: number;
  value: string;
  label: string;
  order?: number;
};

const InterviewerRoleFocusOverview: React.FC = () => {
  const [data, setData] = useState<RoleFocusSummary>({});
  const [prefixToName, setPrefixToName] = useState<Record<string, string>>({});
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- データ取得 ---
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [summaryRes, roleRes] = await Promise.all([
          axios.get<RoleFocusSummary>(`${appConfig.API_BASE_URL}/checksheet/role-focus-summary`),
          axios.get<Role[]>(`${appConfig.API_BASE_URL}/admin/roles`)
        ]);
        setData(summaryRes.data);
        setRoles(roleRes.data);
      } catch (err: any) {
        setError('読み込みに失敗しました');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    axios.get(`${appConfig.API_BASE_URL}/admin/skills`).then(res => {
      const map: Record<string, string> = {};
      res.data.forEach((item: { division_prefix: string; division: string }) => {
        map[item.division_prefix] = item.division;
      });
      setPrefixToName(map);
    });
  }, []);

  // --- 部門×ロールのマトリクス整形 ---
  const matrixData = useMemo(() => {
    const matrix: Record<string, Record<string, { tags: FocusTag[]; used: Record<string, number> }>> = {};

    for (const roleKey in data) {
      const [prefix, role] = roleKey.split(':');
      if (prefix === 'common') continue;
      if (!matrix[prefix]) matrix[prefix] = {};

      matrix[prefix][role.toLowerCase()] = {
        tags: data[roleKey].expected_tags || [],
        used: data[roleKey].used_tags || {},
      };
    }

    return matrix;
  }, [data, prefixToName]);

  // --- 部門一覧 ---
  const departments = useMemo(() => Object.keys(matrixData).sort(), [matrixData]);

  // --- ロール一覧（order順） ---
  const sortedRoles = useMemo(
    () => [...roles].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [roles]
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
                {sortedRoles.map((role) => (
                  <th key={role.value}>
                    <span className={`role-chip role-${role.value.toLowerCase().replace('+', 'dplus')}`}>
                      {role.label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {departments.map((dept) => (
                <tr key={dept}>
                  <td>{prefixToName[dept] || dept}</td>
                  {sortedRoles.map((role) => {
                    console.log("🎯 role.value =", role.value, " → lower =", role.value.toLowerCase());
                    const cell = matrixData[dept]?.[role.value.toLowerCase()];
                    console.log("🔥 CHECK", dept, role.value, cell);
                    const tags = cell?.tags ?? [];
                    const usedMap = cell?.used ?? {};
                    return (
                      <td key={`${dept}:${role.value}`}>
                        <div className="tag-chip-container">
                          {tags.map((tag, idx) => {
                            const tagId = tag?.id;
                            const tagLabel =
                              tag?.label && tag.label !== 'expected_focus'
                                ? tag.label
                                : '（ラベル不明）';
                            if (!tagId) return null;

                            const count = usedMap[tagId] ?? 0;
                            console.log("🐣 tag =", tagId, "count =", count, "usedMap =", usedMap);
                            const className =
                              count >= 3
                                ? 'tag-chip high'
                                : count >= 1
                                ? 'tag-chip medium'
                                : 'tag-chip low';

                            return (
                              <span
                                key={`${tagId}-${idx}`}
                                className={className}
                                title={`出現: ${count}回`}
                              >
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

export default InterviewerRoleFocusOverview;