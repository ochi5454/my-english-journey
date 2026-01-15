import React, { useState } from 'react'

const Card: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section
    style={{
      border: '1px solid #e5e7eb',
      borderRadius: '14px',
      background: '#fff',
      padding: '16px 18px',
      boxShadow: '0 6px 16px rgba(0,0,0,0.06)',
    }}
  >
    <h3 style={{ margin: 0, marginBottom: '8px', fontSize: '16px', fontWeight: 700, color: '#0b2545' }}>{title}</h3>
    <div style={{ color: '#1f2937', fontSize: '13px', lineHeight: 1.6 }}>{children}</div>
  </section>
)

const Pill: React.FC<{ label: string }> = ({ label }) => (
  <span
    style={{
      display: 'inline-block',
      padding: '6px 10px',
      borderRadius: '999px',
      background: '#0b2545',
      color: '#f8fafc',
      fontWeight: 700,
      fontSize: '12px',
    }}
  >
    {label}
  </span>
)

const Field: React.FC<{ label: string; placeholder?: string }> = ({ label, placeholder }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: '#0f172a' }}>
    <span style={{ fontWeight: 700 }}>{label}</span>
    <input
      placeholder={placeholder}
      style={{
        border: '1px solid #d7e3f4',
        borderRadius: '10px',
        padding: '10px 12px',
        fontSize: '13px',
      }}
    />
  </label>
)

const VenueSelect: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: '#0f172a' }}>
    <span style={{ fontWeight: 700 }}>会場</span>
    <select
      style={{
        border: '1px solid #d7e3f4',
        borderRadius: '10px',
        padding: '10px 12px',
        fontSize: '13px',
        background: '#fff',
      }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="" disabled>
        会場を選択してください
      </option>
      <option value="国立競技場">国立競技場</option>
      <option value="埼玉スタジアム2002">埼玉スタジアム2002</option>
      <option value="日産スタジアム">日産スタジアム</option>
      <option value="豊田スタジアム">豊田スタジアム</option>
      <option value="ヤンマースタジアム長居">ヤンマースタジアム長居</option>
      <option value="札幌ドーム">札幌ドーム</option>
      <option value="フクダ電子アリーナ">フクダ電子アリーナ</option>
    </select>
  </label>
)

type ChildTodo = {
  label: string
  done: boolean
  deadline?: string
  required?: boolean
  note?: string
  role?: string
}

type ParentTodo = {
  label: string
  done: boolean
  deadline?: string
  children?: ChildTodo[]
}

type VenueChild = { task_id: string; title: string; offset_min: number; required: boolean; role: string; note: string }
type VenueParent = {
  parent_id: string
  title: string
  category: string
  offset_min: number
  priority: string
  role: string
  children: VenueChild[]
}

const VENUE_PARENTS: Record<string, VenueParent[]> = {
  '国立競技場': [
    {
      parent_id: 'P001',
      title: '会場手配・当日立ち上げ',
      category: '会場',
      offset_min: -150,
      priority: 'high',
      role: '会場担当',
      children: [
        {
          task_id: 'P001-1',
          title: '会場担当者へ到着連絡',
          offset_min: -150,
          required: true,
          role: '会場担当',
          note: '到着時間・搬入口の開錠を依頼',
        },
        {
          task_id: 'P001-2',
          title: '搬入口・控室・本部の場所確認',
          offset_min: -145,
          required: true,
          role: '会場担当',
          note: 'スタッフに共有するため写真/地図を残す',
        },
        {
          task_id: 'P001-3',
          title: '立入禁止エリアの確認',
          offset_min: -140,
          required: true,
          role: '会場担当',
          note: '関係者導線と一般導線を区別',
        },
        {
          task_id: 'P001-4',
          title: '鍵・通行証の受領',
          offset_min: -140,
          required: true,
          role: '会場担当',
          note: '関係者入口の通行証、控室鍵など',
        },
      ],
    },
    {
      parent_id: 'P002',
      title: '運営本部立ち上げ',
      category: '備品',
      offset_min: -130,
      priority: 'high',
      role: '物品担当',
      children: [
        {
          task_id: 'P002-1',
          title: '受付机・椅子・掲示物の設置',
          offset_min: -130,
          required: true,
          role: '物品担当',
          note: '受付/本部/審判席/表彰台周辺',
        },
        {
          task_id: 'P002-2',
          title: 'PC・プリンタ・電源の確認',
          offset_min: -125,
          required: true,
          role: '物品担当',
          note: '延長コード・テープ固定',
        },
        {
          task_id: 'P002-3',
          title: '当日資料（要項・メンバー表・進行表）の配置',
          offset_min: -120,
          required: true,
          role: '運営',
          note: '誰が見てもわかる配置にする',
        },
      ],
    },
    {
      parent_id: 'P003',
      title: '審判手配・当日対応',
      category: '審判',
      offset_min: -100,
      priority: 'high',
      role: '審判責任者',
      children: [
        {
          task_id: 'P003-1',
          title: '審判到着確認（受付）',
          offset_min: -100,
          required: true,
          role: '審判責任者',
          note: '遅刻・欠員があれば即調整',
        },
        {
          task_id: 'P003-2',
          title: '審判控室の案内',
          offset_min: -95,
          required: true,
          role: '審判責任者',
          note: '控室位置・利用範囲を説明',
        },
        {
          task_id: 'P003-3',
          title: 'ブリーフィング（ルール/進行/注意事項）',
          offset_min: -90,
          required: true,
          role: '審判責任者',
          note: '当日の特別運用があれば必ず説明',
        },
      ],
    },
    {
      parent_id: 'P004',
      title: 'チーム受付・メンバー確認',
      category: '受付',
      offset_min: -90,
      priority: 'high',
      role: '受付担当',
      children: [
        {
          task_id: 'P004-1',
          title: '両チーム受付開始',
          offset_min: -90,
          required: true,
          role: '受付担当',
          note: '受付導線を確保（混雑防止）',
        },
        {
          task_id: 'P004-2',
          title: 'メンバー表の回収・チェック',
          offset_min: -85,
          required: true,
          role: '受付担当',
          note: '登録漏れ/保険/選手証',
        },
        {
          task_id: 'P004-3',
          title: 'ユニフォーム色の最終確認',
          offset_min: -80,
          required: true,
          role: '受付担当',
          note: '同色の場合はビブス対応など',
        },
      ],
    },
    {
      parent_id: 'P005',
      title: '安全管理（救護・避難・熱中症）',
      category: '安全',
      offset_min: -70,
      priority: 'high',
      role: '救護担当',
      children: [
        {
          task_id: 'P005-1',
          title: '救護室・AED・担架の場所確認',
          offset_min: -70,
          required: true,
          role: '救護担当',
          note: '全スタッフに共有',
        },
        {
          task_id: 'P005-2',
          title: '避難経路の確認（屋外/屋内）',
          offset_min: -65,
          required: true,
          role: '救護担当',
          note: '緊急時の集合場所も確認',
        },
        {
          task_id: 'P005-3',
          title: '熱中症・体調不良対応フロー確認',
          offset_min: -60,
          required: false,
          role: '救護担当',
          note: '暑さがある日は必須',
        },
      ],
    },
  ],
  'フクダ電子アリーナ': [
    {
      parent_id: 'F001',
      title: '会場手配・当日立ち上げ（試合150〜130分前）',
      category: '会場',
      offset_min: -150,
      priority: 'high',
      role: '会場担当',
      children: [
        { task_id: 'F001-1', title: '会場担当者へ到着連絡', offset_min: -150, required: true, role: '会場担当', note: '' },
        { task_id: 'F001-2', title: 'スタジアム開錠・入場確認', offset_min: -145, required: true, role: '会場担当', note: '' },
        { task_id: 'F001-3', title: '本部室・大会関係者室・審判控室の場所確認', offset_min: -145, required: true, role: '会場担当', note: '' },
        { task_id: 'F001-4', title: '立入禁止エリア（選手動線・バックヤード）確認', offset_min: -140, required: true, role: '会場担当', note: '' },
        { task_id: 'F001-5', title: '鍵・通行証・IDパスの受領', offset_min: -140, required: true, role: '会場担当', note: '' },
        { task_id: 'F001-6', title: 'ピッチ・ベンチ・テクニカルエリア状況確認', offset_min: -135, required: true, role: '会場担当', note: '' },
      ],
    },
    {
      parent_id: 'F002',
      title: '運営本部立ち上げ（試合130〜120分前）',
      category: '運営',
      offset_min: -130,
      priority: 'high',
      role: '会場担当',
      children: [
        { task_id: 'F002-1', title: '運営本部設営（机・椅子・掲示物）', offset_min: -130, required: true, role: '会場担当', note: '' },
        { task_id: 'F002-2', title: 'PC・プリンタ・Wi-Fi・電源確認', offset_min: -130, required: true, role: '会場担当', note: '' },
        { task_id: 'F002-3', title: '無線機・予備バッテリー配布', offset_min: -125, required: true, role: '会場担当', note: '' },
        { task_id: 'F002-4', title: '当日資料配置（タイムスケジュール/メンバー表/緊急連絡網/会場図・避難導線図）', offset_min: -125, required: true, role: '運営', note: '' },
        { task_id: 'F002-5', title: '時計の時刻同期（公式時刻）', offset_min: -120, required: true, role: '会場担当', note: '' },
      ],
    },
    {
      parent_id: 'F003',
      title: '審判対応（試合100〜90分前）',
      category: '審判',
      offset_min: -100,
      priority: 'high',
      role: '審判責任者',
      children: [
        { task_id: 'F003-1', title: '審判到着確認・受付', offset_min: -100, required: true, role: '審判責任者', note: '' },
        { task_id: 'F003-2', title: '審判控室案内', offset_min: -95, required: true, role: '審判責任者', note: '' },
        { task_id: 'F003-3', title: '審判用備品確認（ドリンク・タオル等）', offset_min: -95, required: true, role: '審判責任者', note: '' },
        { task_id: 'F003-4', title: 'ブリーフィング対応（競技規則・特別運用・VAR/第4審判連携）', offset_min: -90, required: true, role: '審判責任者', note: '' },
        { task_id: 'F003-5', title: 'ウォームアップ開始時刻共有', offset_min: -90, required: true, role: '審判責任者', note: '' },
      ],
    },
    {
      parent_id: 'F004',
      title: 'チーム受付・メンバー確認（試合90〜80分前）',
      category: '受付',
      offset_min: -90,
      priority: 'high',
      role: '受付',
      children: [
        { task_id: 'F004-1', title: '両チーム受付開始', offset_min: -90, required: true, role: '受付', note: '' },
        { task_id: 'F004-2', title: 'メンバー表回収', offset_min: -85, required: true, role: '受付', note: '' },
        { task_id: 'F004-3', title: 'ユニフォーム色・GK色確認', offset_min: -85, required: true, role: '受付', note: '' },
        { task_id: 'F004-4', title: 'キャプテンマーク確認', offset_min: -85, required: true, role: '受付', note: '' },
        { task_id: 'F004-5', title: 'スパイク・装身具チェック', offset_min: -80, required: true, role: '受付', note: '' },
        { task_id: 'F004-6', title: 'ロッカールーム案内', offset_min: -80, required: true, role: '受付', note: '' },
      ],
    },
    {
      parent_id: 'F005',
      title: '観客対応・スタンド運営（試合75〜45分前）',
      category: '観客',
      offset_min: -75,
      priority: 'middle',
      role: '観客対応',
      children: [
        { task_id: 'F005-1', title: '開門前最終確認', offset_min: -75, required: true, role: '観客対応', note: '' },
        { task_id: 'F005-2', title: '入場ゲート・動線確認／係員配置', offset_min: -70, required: true, role: '観客対応', note: '' },
        { task_id: 'F005-3', title: 'スタンド・コンコース巡回／バリアフリー席・関係者席確認', offset_min: -65, required: true, role: '観客対応', note: '' },
        { task_id: 'F005-4', title: '迷子・落とし物対応フロー確認', offset_min: -60, required: true, role: '観客対応', note: '' },
      ],
    },
    {
      parent_id: 'F006',
      title: '医療・安全管理（試合70〜30分前）',
      category: '医療',
      offset_min: -70,
      priority: 'high',
      role: '医療担当',
      children: [
        { task_id: 'F006-1', title: '救護室開設確認', offset_min: -70, required: true, role: '医療担当', note: '' },
        { task_id: 'F006-2', title: '医師・看護師配置確認', offset_min: -65, required: true, role: '医療担当', note: '' },
        { task_id: 'F006-3', title: 'AED設置場所確認', offset_min: -60, required: true, role: '医療担当', note: '' },
        { task_id: 'F006-4', title: '熱中症対策（WBGT／給水）', offset_min: -55, required: true, role: '医療担当', note: '' },
        { task_id: 'F006-5', title: '悪天候時対応方針確認', offset_min: -50, required: true, role: '医療担当', note: '' },
        { task_id: 'F006-6', title: '緊急車両動線確認', offset_min: -45, required: true, role: '医療担当', note: '' },
      ],
    },
    {
      parent_id: 'F007',
      title: '試合直前対応（試合30〜0分前）',
      category: '直前',
      offset_min: -30,
      priority: 'high',
      role: '運営',
      children: [
        { task_id: 'F007-1', title: 'ピッチ最終チェック', offset_min: -30, required: true, role: '運営', note: '' },
        { task_id: 'F007-2', title: '選手入場動線確認', offset_min: -25, required: true, role: '運営', note: '' },
        { task_id: 'F007-3', title: '審判・第4審判最終確認', offset_min: -25, required: true, role: '審判責任者', note: '' },
        { task_id: 'F007-4', title: 'キックオフ時刻最終確認', offset_min: -20, required: true, role: '運営', note: '' },
        { task_id: 'F007-5', title: 'トラブル有無確認・共有', offset_min: -15, required: true, role: '運営', note: '' },
      ],
    },
    {
      parent_id: 'F008',
      title: '試合中対応',
      category: '運営',
      offset_min: 0,
      priority: 'middle',
      role: '運営',
      children: [
        { task_id: 'F008-1', title: '本部常駐', offset_min: 0, required: true, role: '運営', note: '' },
        { task_id: 'F008-2', title: '審判・チームからの連絡対応', offset_min: 0, required: true, role: '運営', note: '' },
        { task_id: 'F008-3', title: 'けが人・トラブル対応', offset_min: 0, required: true, role: '運営', note: '' },
        { task_id: 'F008-4', title: '時間管理（前後半・AT）', offset_min: 0, required: true, role: '運営', note: '' },
        { task_id: 'F008-5', title: '観客トラブル対応', offset_min: 0, required: true, role: '運営', note: '' },
      ],
    },
  ],
}

type FlatVenueTask = { id: string; title: string; category: string; offset_min: number; priority: string; role: string; note: string }

const VENUE_FLAT: Record<string, FlatVenueTask[]> = {
  国立競技場: [
    { id: 'N001', title: '運営スタッフ集合・役割確認', category: '進行', offset_min: -150, priority: 'high', role: '運営責任者', note: '集合場所を事前に共有（控室/関係者入口）' },
    { id: 'N002', title: '会場担当者へ挨拶・当日導線確認', category: '会場', offset_min: -140, priority: 'high', role: '会場担当', note: '搬入口/控室/救護室/トイレ/入場口を確認' },
    { id: 'N003', title: 'セキュリティチェック（通行証/入館）', category: '安全', offset_min: -130, priority: 'high', role: '運営責任者', note: '関係者入館手続きや通行証の確認' },
    { id: 'N004', title: '備品搬入・設置（受付/机/椅子/掲示物）', category: '備品', offset_min: -120, priority: 'high', role: '物品担当', note: '受付・本部・審判席のセット' },
    { id: 'N005', title: '審判集合・ブリーフィング開始', category: '審判', offset_min: -90, priority: 'high', role: '審判責任者', note: '審判控室案内・当日ルール確認' },
    { id: 'N006', title: '両チーム受付・メンバー表回収', category: '受付', offset_min: -80, priority: 'high', role: '受付担当', note: '選手証/保険/登録確認' },
    { id: 'N007', title: 'ウォームアップ導線・控室案内', category: '導線', offset_min: -70, priority: 'middle', role: '運営', note: 'フィールドまでのルート/立入禁止区域を案内' },
    { id: 'N008', title: '試合進行最終確認（タイムテーブル/入場演出）', category: '進行', offset_min: -60, priority: 'high', role: '運営責任者', note: '入場・整列・キックオフまでを確認' },
    { id: 'N009', title: '安全確認（救護/避難経路/熱中症対策）', category: '安全', offset_min: -50, priority: 'high', role: '救護担当', note: '救護体制・AED位置確認' },
    { id: 'N010', title: '開場前チェック（観客導線/案内板）', category: '会場', offset_min: -40, priority: 'middle', role: '会場担当', note: '動線案内・立入禁止の掲示' },
  ],
  埼玉スタジアム2002: [
    { id: 'S001', title: '運営スタッフ集合・役割確認', category: '進行', offset_min: -150, priority: 'high', role: '運営責任者', note: '集合場所（本部/会議室）を事前共有' },
    { id: 'S002', title: '会場担当者へ挨拶・当日導線確認', category: '会場', offset_min: -140, priority: 'high', role: '会場担当', note: '搬入口/控室/審判室の位置確認' },
    { id: 'S003', title: '備品搬入・設置（受付/本部/掲示物）', category: '備品', offset_min: -120, priority: 'high', role: '物品担当', note: '受付・本部・審判席を設置' },
    { id: 'S004', title: 'スタジアム音響・放送の事前確認', category: '設備', offset_min: -110, priority: 'middle', role: '会場担当', note: 'マイク/放送/電源' },
    { id: 'S005', title: '審判集合・ブリーフィング', category: '審判', offset_min: -90, priority: 'high', role: '審判責任者', note: '審判控室案内' },
    { id: 'S006', title: 'チーム受付・メンバー表回収', category: '受付', offset_min: -80, priority: 'high', role: '受付担当', note: '登録・保険確認' },
    { id: 'S007', title: '安全確認（救護/避難経路）', category: '安全', offset_min: -50, priority: 'high', role: '救護担当', note: '救護室/AED確認' },
  ],
  日産スタジアム: [
    { id: 'NS001', title: '運営スタッフ集合・役割確認', category: '進行', offset_min: -150, priority: 'high', role: '運営責任者', note: '控室・本部の案内' },
    { id: 'NS002', title: '会場担当者と導線・搬入口確認', category: '会場', offset_min: -140, priority: 'high', role: '会場担当', note: '搬入口・控室・審判室確認' },
    { id: 'NS003', title: '備品設置（受付/本部/掲示物）', category: '備品', offset_min: -120, priority: 'high', role: '物品担当', note: '机/椅子/掲示/テープ' },
    { id: 'NS004', title: '審判集合・ブリーフィング', category: '審判', offset_min: -90, priority: 'high', role: '審判責任者', note: '' },
    { id: 'NS005', title: 'チーム受付・メンバー表回収', category: '受付', offset_min: -80, priority: 'high', role: '受付担当', note: '' },
    { id: 'NS006', title: '安全確認（救護/避難）', category: '安全', offset_min: -50, priority: 'high', role: '救護担当', note: '' },
  ],
  豊田スタジアム: [
    { id: 'T001', title: '運営スタッフ集合・役割確認', category: '進行', offset_min: -150, priority: 'high', role: '運営責任者', note: '' },
    { id: 'T002', title: '会場担当者へ挨拶・導線確認', category: '会場', offset_min: -140, priority: 'high', role: '会場担当', note: '搬入口/控室/関係者入口' },
    { id: 'T003', title: '備品搬入・設置', category: '備品', offset_min: -120, priority: 'high', role: '物品担当', note: '' },
    { id: 'T004', title: '審判集合・ブリーフィング', category: '審判', offset_min: -90, priority: 'high', role: '審判責任者', note: '' },
    { id: 'T005', title: 'チーム受付・メンバー表回収', category: '受付', offset_min: -80, priority: 'high', role: '受付担当', note: '' },
    { id: 'T006', title: '安全確認', category: '安全', offset_min: -50, priority: 'high', role: '救護担当', note: '' },
  ],
  ヤンマースタジアム長居: [
    { id: 'Y001', title: '運営スタッフ集合・役割確認', category: '進行', offset_min: -150, priority: 'high', role: '運営責任者', note: '' },
    { id: 'Y002', title: '会場担当者へ挨拶・導線確認', category: '会場', offset_min: -140, priority: 'high', role: '会場担当', note: '' },
    { id: 'Y003', title: '備品設置（受付/本部）', category: '備品', offset_min: -120, priority: 'high', role: '物品担当', note: '' },
    { id: 'Y004', title: '審判集合・ブリーフィング', category: '審判', offset_min: -90, priority: 'high', role: '審判責任者', note: '' },
    { id: 'Y005', title: 'チーム受付・メンバー表回収', category: '受付', offset_min: -80, priority: 'high', role: '受付担当', note: '' },
    { id: 'Y006', title: '安全確認', category: '安全', offset_min: -50, priority: 'high', role: '救護担当', note: '' },
  ],
  札幌ドーム: [
    { id: 'D001', title: '運営スタッフ集合・役割確認', category: '進行', offset_min: -160, priority: 'high', role: '運営責任者', note: '屋内運用のため集合場所の明確化' },
    { id: 'D002', title: '会場担当者へ挨拶・導線確認', category: '会場', offset_min: -150, priority: 'high', role: '会場担当', note: '搬入口・屋内動線・控室の確認' },
    { id: 'D003', title: '備品設置（受付/本部）', category: '備品', offset_min: -130, priority: 'high', role: '物品担当', note: '屋内の電源位置・音響確認' },
    { id: 'D004', title: '審判集合・ブリーフィング', category: '審判', offset_min: -95, priority: 'high', role: '審判責任者', note: '' },
    { id: 'D005', title: 'チーム受付・メンバー表回収', category: '受付', offset_min: -85, priority: 'high', role: '受付担当', note: '' },
    { id: 'D006', title: '安全確認（避難経路/救護）', category: '安全', offset_min: -60, priority: 'high', role: '救護担当', note: '屋内避難導線/AEDの場所' },
  ],
}

const formatDeadline = (offset: number) => {
  if (offset <= 0) return `試合${Math.abs(offset)}分前`
  return `試合後${offset}分`
}

const CATEGORY_LABEL: Record<string, string> = {
  進行: '試合進行',
  会場: '会場対応',
  備品: '備品・設営',
  設備: '設備チェック',
  審判: '審判対応',
  受付: '受付対応',
  導線: '導線確認',
  安全: '安全管理',
}

const buildParentsFromFlat = (flat: FlatVenueTask[]): ParentTodo[] => {
  if (!flat.length) return []
  const grouped = flat.reduce<Record<string, FlatVenueTask[]>>((acc, cur) => {
    acc[cur.category] = acc[cur.category] || []
    acc[cur.category].push(cur)
    return acc
  }, {})

  return Object.entries(grouped).map(([category, tasks]) => {
    const earliest = tasks.reduce((min, t) => Math.min(min, t.offset_min), Infinity)
    return {
      label: CATEGORY_LABEL[category] || `${category}対応`,
      done: false,
      deadline: formatDeadline(earliest),
      children: tasks.map((t) => ({
        label: t.title,
        done: false,
        deadline: formatDeadline(t.offset_min),
        note: t.note,
        role: t.role,
      })),
    }
  })
}

const NewProjectManagement: React.FC = () => {
  const [todos, setTodos] = useState<ParentTodo[]>([])
  const [expanded, setExpanded] = useState<boolean[]>([])
  const [selectedVenue, setSelectedVenue] = useState<string>('')

  const toggleParentExpand = (idx: number) => {
    setExpanded((prev) => prev.map((v, i) => (i === idx ? !v : v)))
  }

  const toggleParentDone = (idx: number) => {
    setTodos((prev) =>
      prev.map((t, i) => {
        if (i !== idx) return t
        // 親タスクに子がない場合のみ手動でトグル
        if (t.children && t.children.length > 0) return t
        return { ...t, done: !t.done }
      })
    )
  }

  const toggleChild = (parentIdx: number, childIdx: number) => {
    setTodos((prev) =>
      prev.map((t, i) => {
        if (i !== parentIdx) return t
        const children = t.children?.map((c, j) => (j === childIdx ? { ...c, done: !c.done } : c)) || []
        const parentDone = children.length > 0 ? children.every((c) => c.done) : t.done
        return { ...t, children, done: parentDone }
      })
    )
  }

  const generateTodos = () => {
    if (!selectedVenue) return
    const parents = VENUE_PARENTS[selectedVenue] || []
    let mapped: ParentTodo[] = []

    if (parents.length > 0) {
      mapped = parents.map((p) => ({
        label: p.title,
        done: false,
        deadline: formatDeadline(p.offset_min),
        children: (p.children || []).map((c) => ({
          label: c.title,
          done: false,
          deadline: formatDeadline(c.offset_min),
          required: c.required,
          note: c.note,
          role: c.role,
        })),
      }))
    } else {
      const flat = VENUE_FLAT[selectedVenue] || []
      mapped = buildParentsFromFlat(flat)
    }

    setTodos(mapped)
    setExpanded(mapped.map(() => false))
  }

  return (
    <div style={{ padding: '24px', width: '100%', maxWidth: '1100px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <h2 style={{ marginBottom: '4px' }}>試合運営</h2>
      <p style={{ color: '#475569', fontSize: '14px' }}>審判報告書に近いカード/余白スタイルで大会運営機能のイメージを示しています。</p>

      <Card title="大会運営ToDoの自動生成">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
          <VenueSelect value={selectedVenue} onChange={(v) => setSelectedVenue(v)} />
        </div>
        <button
          style={{
            marginTop: '12px',
            padding: '10px 14px',
            borderRadius: '10px',
            border: 'none',
            background: '#0b2545',
            color: '#f8fafc',
            fontWeight: 800,
            cursor: 'pointer',
            minWidth: '150px',
          }}
          onClick={generateTodos}
          disabled={!selectedVenue}
        >
          ToDo生成
        </button>
        <div
          style={{
            marginTop: '12px',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '10px',
            background: '#f8fafc',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: '6px' }}>チェックリスト（ダミー・今後DB連携）</div>
          <div style={{ display: 'grid', gap: '8px' }}>
            {todos.map((item, idx) => {
              const done = item.done
              return (
                <div
                  key={idx}
                  style={{
                    border: done ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                    background: done ? '#ecfdf3' : '#fff',
                    color: done ? '#166534' : '#0f172a',
                    borderRadius: '10px',
                    padding: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    transition: 'background 0.2s ease, border 0.2s ease, color 0.2s ease',
                  }}
                >
                  <div
                    onClick={() => toggleParentExpand(idx)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '24px 1fr auto',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={done}
                      onChange={() => toggleParentDone(idx)}
                      style={{ width: '16px', height: '16px', accentColor: done ? '#16a34a' : '#0b2545', cursor: 'pointer' }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>
                      <span
                        style={{
                          fontSize: '12px',
                          color: '#475569',
                          width: '20px',
                          height: '20px',
                          borderRadius: '4px',
                          border: '1px solid #cbd5e1',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: '#f8fafc',
                        }}
                      >
                        {expanded[idx] ? '▲' : '▼'}
                      </span>
                    </div>
                    <span style={{ fontSize: '11px', color: '#6b7280' }}>{item.deadline || ''}</span>
                  </div>
                  {expanded[idx] && item.children && item.children.length > 0 && (
                    <div style={{ display: 'grid', gap: '6px', paddingLeft: '28px' }}>
                      {item.children.map((child, cidx) => {
                        const childDone = child.done
                        return (
                          <label
                            key={cidx}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '24px 1fr auto',
                              alignItems: 'center',
                              gap: '6px',
                              fontSize: '12px',
                              fontWeight: 600,
                              color: childDone ? '#166534' : '#0f172a',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={childDone}
                              onChange={() => toggleChild(idx, cidx)}
                              style={{ width: '14px', height: '14px', accentColor: childDone ? '#16a34a' : '#0b2545', cursor: 'pointer' }}
                            />
                            <span>{child.label}</span>
                            <span style={{ fontSize: '11px', color: '#6b7280' }}>{child.deadline || ''}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
        <p style={{ marginTop: '10px', fontSize: '12px', color: '#475569' }}>※ チェックリスト/過去運営記録は今後DB連携予定。現在はダミー表示です。</p>
      </Card>
    </div>
  )
}

export default NewProjectManagement
