import React, { useMemo, useState } from 'react'

type Fixture = {
  kickOff: string
  match: string
  venue: string
}

type FixturesByLeague = Record<string, Fixture[]>
type FixturesByDate = Record<string, FixturesByLeague>

const leagueOptions = ['日本', 'イングランド', 'イタリア', 'スペイン']

const teamsByLeague: Record<string, string[]> = {
  日本: [
    '北海道コンサドーレ札幌',
    '鹿島アントラーズ',
    '浦和レッズ',
    '柏レイソル',
    'ＦＣ東京',
    '東京ヴェルディ',
    '横浜Ｆ・マリノス',
    '川崎フロンターレ',
    '湘南ベルマーレ',
    'アルビレックス新潟',
    '清水エスパルス',
    'ジュビロ磐田',
    '名古屋グランパス',
    '京都サンガ',
    'ガンバ大阪',
    'セレッソ大阪',
    'ヴィッセル神戸',
    'サンフレッチェ広島',
    'アビスパ福岡',
    'サガン鳥栖',
    'ＦＣ町田ゼルビア',
    'ファジアーノ岡山',
    '横浜ＦＣ',
  ],
  イングランド: [
    'マンチェスター・シティ',
    'リバプール',
    'アーセナル',
    'チェルシー',
    'マンチェスター・ユナイテッド',
    'トッテナム',
    'ニューカッスル',
    'ブライトン',
    'アストン・ヴィラ',
    'ウェストハム',
    'クリスタル・パレス',
    'ウルブス',
    'フルハム',
    'ブレントフォード',
    'ノッティンガム・フォレスト',
    'ボーンマス',
    'エバートン',
    'サウサンプトン',
    'レスター',
    'イプスウィッチ',
  ],
  イタリア: [
    'インテル',
    'ユベントス',
    'ミラン',
    'ナポリ',
    'ローマ',
    'ラツィオ',
    'アタランタ',
    'ボローニャ',
    'フィオレンティーナ',
    'トリノ',
    'ジェノア',
    'ウディネーゼ',
    'モンツァ',
    'カリアリ',
    'サンプドリア',
    'レッチェ',
    'エンポリ',
    'サッスオーロ',
    'ベネツィア',
    'パルマ',
  ],
  スペイン: [
    'レアル・マドリード',
    'バルセロナ',
    'アトレティコ・マドリード',
    'レアル・ソシエダ',
    'ビジャレアル',
    'ベティス',
    'セビージャ',
    'アスレティック・ビルバオ',
    'バレンシア',
    'ヘタフェ',
    'オサスナ',
    'ラージョ・バジェカーノ',
    'セルタ',
    'ジローナ',
    'マジョルカ',
    'エスパニョール',
    'バジャドリード',
    'ラス・パルマス',
    'レガネス',
    'アルメリア',
  ],
}

const fixturesByDate: FixturesByDate = {
  '2025-12-06': {
    日本: [
      { kickOff: '14:00', match: '鹿島アントラーズ vs 横浜Ｆ・マリノス', venue: 'メルカリスタジアム' },
      { kickOff: '14:00', match: '浦和レッズ vs 川崎フロンターレ', venue: '埼玉スタジアム2002' },
      { kickOff: '14:00', match: '柏レイソル vs ＦＣ町田ゼルビア', venue: '三協フロンテア柏スタジアム' },
      { kickOff: '14:00', match: 'ＦＣ東京 vs アルビレックス新潟', venue: '味の素スタジアム' },
      { kickOff: '14:00', match: '清水エスパルス vs ファジアーノ岡山', venue: 'IAIスタジアム日本平' },
      { kickOff: '14:00', match: '名古屋グランパス vs アビスパ福岡', venue: '豊田スタジアム' },
      { kickOff: '14:00', match: '京都サンガ vs ヴィッセル神戸', venue: 'サンガスタジアム by KYOCERA' },
      { kickOff: '14:00', match: 'ガンバ大阪 vs 東京ヴェルディ', venue: 'パナソニック スタジアム 吹田' },
      { kickOff: '14:00', match: 'セレッソ大阪 vs 横浜ＦＣ', venue: 'ヨドコウ桜スタジアム' },
      { kickOff: '14:00', match: 'サンフレッチェ広島 vs 湘南ベルマーレ', venue: 'エディオンスタジアム広島' },
    ],
  },
  '2026-12-05': {
    '日本': [
      { kickOff: '13:00', match: 'ジェフユナイテッド千葉 vs 東京ヴェルディ', venue: '国立競技場' },
      { kickOff: '16:00', match: 'モンテディオ山形 vs ヴァンフォーレ甲府', venue: '国立競技場' },
    ],
    'スペイン': [
      { kickOff: '21:00', match: 'レアル・マドリード vs バルセロナ', venue: 'サンティアゴ・ベルナベウ' },
    ],
    'イングランド': [
      { kickOff: '20:30', match: 'アーセナル vs リバプール', venue: 'エミレーツ・スタジアム' },
    ],
    'イタリア': [
      { kickOff: '22:45', match: 'ユベントス vs ミラン', venue: 'アリアンツ・スタジアム' },
    ],
  },
  '2026-12-06': {
    '日本': [
      { kickOff: '15:00', match: '準決勝勝者 vs 準決勝勝者', venue: '国立競技場' },
    ],
    'スペイン': [
      { kickOff: '21:00', match: 'アトレティコ・マドリード vs セビージャ', venue: 'Cívitas メトロポリターノ' },
    ],
    'イングランド': [
      { kickOff: '19:30', match: 'マンチェスター・シティ vs チェルシー', venue: 'エティハド・スタジアム' },
    ],
    'イタリア': [
      { kickOff: '22:00', match: 'ローマ vs ナポリ', venue: 'スタディオ・オリンピコ' },
    ],
  },
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1px solid #d1d5db',
  fontSize: '14px',
  background: 'white',
}

const cardStyle: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: '10px',
  padding: '14px 16px',
  background: 'white',
  boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
}

const IshiuchiTakaya: React.FC = () => {
  const [selectedLeague, setSelectedLeague] = useState<string>('')
  const [selectedTeam, setSelectedTeam] = useState<string>('')

  const leagueCandidates = useMemo(() => leagueOptions, [])
  const teamCandidates = useMemo(
    () => (selectedLeague ? teamsByLeague[selectedLeague] ?? [] : []),
    [selectedLeague]
  )

  const currentFixtures: Array<Fixture & { date: string }> = useMemo(() => {
    if (!selectedLeague) return []
    const aggregated: Array<Fixture & { date: string }> = []
    Object.entries(fixturesByDate).forEach(([date, byLeague]) => {
      const list = byLeague[selectedLeague]
      if (list && list.length) {
        list.forEach((fx) => aggregated.push({ ...fx, date }))
      }
    })
    if (selectedTeam) {
      return aggregated.filter((fx) => fx.match.includes(selectedTeam))
    }
    return aggregated
  }, [selectedLeague, selectedTeam])

  return (
    <div style={{ padding: '24px', maxWidth: '900px' }}>
      <h2 style={{ marginBottom: '8px' }}>試合情報</h2>
      <p style={{ lineHeight: 1.6, marginBottom: '16px' }}>
        リーグとチームを選ぶと、そのチームの試合予定が表示されます。
      </p>

      <div style={{ display: 'grid', gap: '16px', maxWidth: '520px' }}>
        <label style={{ display: 'block' }}>
          <div style={{ marginBottom: '6px', fontWeight: 600, fontSize: '14px' }}>リーグを選択</div>
          <select
            value={selectedLeague}
            onChange={(e) => {
              setSelectedLeague(e.target.value)
              setSelectedTeam('')
            }}
            style={selectStyle}
            disabled={leagueCandidates.length === 0}
          >
            <option value="">選択してください</option>
            {leagueCandidates.map((league) => (
              <option key={league} value={league}>
                {league}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'block' }}>
          <div style={{ marginBottom: '6px', fontWeight: 600, fontSize: '14px' }}>チームを選択</div>
          <select
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
            style={selectStyle}
            disabled={!selectedLeague || teamCandidates.length === 0}
          >
            <option value="">選択してください</option>
            {teamCandidates.map((team) => (
              <option key={team} value={team}>
                {team}
              </option>
            ))}
          </select>
          {!selectedLeague && (
            <div style={{ marginTop: '6px', fontSize: '12px', color: '#6b7280' }}>先にリーグを選んでください。</div>
          )}
        </label>
      </div>

      <div style={{ marginTop: '24px' }}>
        {selectedLeague ? (
          selectedTeam ? (
            currentFixtures.length > 0 ? (
              <div style={{ display: 'grid', gap: '12px' }}>
                {currentFixtures.map((fx, idx) => (
                  <div key={idx} style={cardStyle}>
                    <div style={{ fontSize: '13px', color: '#6b7280' }}>
                      {fx.date} / {selectedLeague}
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 700, marginTop: '6px' }}>{fx.match}</div>
                    <div style={{ marginTop: '4px', fontSize: '14px', color: '#374151' }}>
                      キックオフ: {fx.kickOff}　会場: {fx.venue}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: '#6b7280', fontSize: '14px' }}>選択したチームの試合予定は登録されていません。</div>
            )
          ) : (
            <div style={{ color: '#6b7280', fontSize: '14px' }}>チームを選択すると試合予定が表示されます。</div>
          )
        ) : (
          <div style={{ color: '#6b7280', fontSize: '14px' }}>リーグを選択すると内容が表示されます。</div>
        )}
      </div>
    </div>
  )
}

export default IshiuchiTakaya
