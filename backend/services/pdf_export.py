"""
PDFエクスポートサービス

残業データをPDF形式でエクスポートする機能を提供します。
"""

import io
from datetime import datetime
from typing import List, Dict, Any, Optional

try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False


def is_pdf_available() -> bool:
    """PDF出力が利用可能かどうか"""
    return REPORTLAB_AVAILABLE


def register_japanese_font():
    """日本語フォントを登録（利用可能な場合）"""
    if not REPORTLAB_AVAILABLE:
        return False

    # 一般的な日本語フォントパスを試行
    font_paths = [
        '/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc',  # macOS
        '/System/Library/Fonts/Hiragino Sans GB.ttc',  # macOS
        '/usr/share/fonts/truetype/fonts-japanese-gothic.ttf',  # Linux
        'C:\\Windows\\Fonts\\msgothic.ttc',  # Windows
        'C:\\Windows\\Fonts\\meiryo.ttc',  # Windows
    ]

    for font_path in font_paths:
        try:
            pdfmetrics.registerFont(TTFont('JapaneseFont', font_path))
            return True
        except Exception:
            continue

    return False


def create_overtime_pdf(
    data: List[Dict[str, Any]],
    title: str = "残業時間レポート",
    subtitle: Optional[str] = None,
) -> bytes:
    """
    残業データをPDFに変換

    Args:
        data: 残業データのリスト
        title: レポートタイトル
        subtitle: サブタイトル（期間など）

    Returns:
        PDF形式のバイト列
    """
    if not REPORTLAB_AVAILABLE:
        raise RuntimeError("reportlabがインストールされていません。pip install reportlab を実行してください。")

    buffer = io.BytesIO()

    # A4横向き
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        rightMargin=15*mm,
        leftMargin=15*mm,
        topMargin=15*mm,
        bottomMargin=15*mm,
    )

    elements = []
    styles = getSampleStyleSheet()

    # 日本語フォント登録を試行
    has_japanese_font = register_japanese_font()

    # タイトルスタイル
    if has_japanese_font:
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontName='JapaneseFont',
            fontSize=16,
            spaceAfter=10,
        )
        normal_style = ParagraphStyle(
            'CustomNormal',
            parent=styles['Normal'],
            fontName='JapaneseFont',
            fontSize=9,
        )
    else:
        title_style = styles['Heading1']
        normal_style = styles['Normal']

    # タイトル
    elements.append(Paragraph(title, title_style))

    if subtitle:
        elements.append(Paragraph(subtitle, normal_style))

    # 生成日時
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    elements.append(Paragraph(f"生成日時: {now}", normal_style))
    elements.append(Spacer(1, 10*mm))

    if not data:
        elements.append(Paragraph("データがありません", normal_style))
        doc.build(elements)
        return buffer.getvalue()

    # テーブルヘッダー
    headers = ['従業員番号', '氏名', '部署', '残業時間', 'ステータス']

    # テーブルデータ
    table_data = [headers]
    for row in data:
        overtime_hours = row.get('overtime_hours', 0)
        status = get_overtime_status(overtime_hours)
        table_data.append([
            str(row.get('employee_id', '')),
            str(row.get('name', '')),
            str(row.get('department', '')),
            f"{overtime_hours:.1f}h",
            status,
        ])

    # テーブル作成
    col_widths = [30*mm, 50*mm, 60*mm, 30*mm, 40*mm]
    table = Table(table_data, colWidths=col_widths)

    # テーブルスタイル
    style = TableStyle([
        # ヘッダー
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1976d2')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('TOPPADDING', (0, 0), (-1, 0), 8),

        # ボディ
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('ALIGN', (0, 1), (-1, -1), 'LEFT'),
        ('ALIGN', (3, 1), (3, -1), 'RIGHT'),  # 残業時間は右寄せ
        ('ALIGN', (4, 1), (4, -1), 'CENTER'),  # ステータスは中央
        ('BOTTOMPADDING', (0, 1), (-1, -1), 5),
        ('TOPPADDING', (0, 1), (-1, -1), 5),

        # グリッド
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),

        # 交互背景色
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')]),
    ])

    # 残業時間に応じた色分け
    for i, row in enumerate(data, start=1):
        overtime_hours = row.get('overtime_hours', 0)
        if overtime_hours >= 60:
            style.add('BACKGROUND', (3, i), (4, i), colors.HexColor('#ffcdd2'))
        elif overtime_hours >= 45:
            style.add('BACKGROUND', (3, i), (4, i), colors.HexColor('#fff3e0'))
        elif overtime_hours >= 30:
            style.add('BACKGROUND', (3, i), (4, i), colors.HexColor('#fff9c4'))

    table.setStyle(style)
    elements.append(table)

    # サマリー
    elements.append(Spacer(1, 10*mm))
    total_employees = len(data)
    total_hours = sum(row.get('overtime_hours', 0) for row in data)
    avg_hours = total_hours / total_employees if total_employees > 0 else 0
    over_45 = sum(1 for row in data if row.get('overtime_hours', 0) >= 45)
    over_60 = sum(1 for row in data if row.get('overtime_hours', 0) >= 60)

    summary_text = f"""
    対象者数: {total_employees}人 |
    合計残業時間: {total_hours:.1f}h |
    平均残業時間: {avg_hours:.1f}h |
    45時間超過: {over_45}人 |
    60時間超過: {over_60}人
    """
    elements.append(Paragraph(summary_text.strip(), normal_style))

    doc.build(elements)
    return buffer.getvalue()


def get_overtime_status(hours: float) -> str:
    """残業時間からステータスを取得"""
    if hours >= 60:
        return "要対応（60h超）"
    elif hours >= 45:
        return "注意（45h超）"
    elif hours >= 30:
        return "警告（30h超）"
    else:
        return "正常"


def create_summary_pdf(
    monthly_data: Dict[str, Any],
    title: str = "月次残業サマリー",
) -> bytes:
    """
    月次サマリーをPDFに変換
    """
    if not REPORTLAB_AVAILABLE:
        raise RuntimeError("reportlabがインストールされていません")

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=15*mm,
        leftMargin=15*mm,
        topMargin=15*mm,
        bottomMargin=15*mm,
    )

    elements = []
    styles = getSampleStyleSheet()
    has_japanese_font = register_japanese_font()

    if has_japanese_font:
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontName='JapaneseFont',
            fontSize=16,
        )
        normal_style = ParagraphStyle(
            'CustomNormal',
            parent=styles['Normal'],
            fontName='JapaneseFont',
            fontSize=10,
        )
    else:
        title_style = styles['Heading1']
        normal_style = styles['Normal']

    # タイトル
    year = monthly_data.get('year', '')
    month = monthly_data.get('month', '')
    elements.append(Paragraph(f"{title} ({year}年{month}月)", title_style))
    elements.append(Spacer(1, 10*mm))

    # サマリー情報
    summary_items = [
        f"対象者数: {monthly_data.get('total_employees', 0)}人",
        f"合計残業時間: {monthly_data.get('total_overtime_hours', 0):.1f}時間",
        f"平均残業時間: {monthly_data.get('average_overtime_hours', 0):.1f}時間",
        f"最大残業時間: {monthly_data.get('max_overtime_hours', 0):.1f}時間",
        f"45時間超過者: {monthly_data.get('employees_over_45h', 0)}人",
        f"60時間超過者: {monthly_data.get('employees_over_60h', 0)}人",
    ]

    for item in summary_items:
        elements.append(Paragraph(item, normal_style))

    elements.append(Spacer(1, 10*mm))

    # 分布情報
    distribution = monthly_data.get('distribution', {})
    if distribution:
        elements.append(Paragraph("残業時間分布:", normal_style))
        dist_items = [
            f"  20時間未満: {distribution.get('under_20h', 0)}人",
            f"  20-30時間: {distribution.get('h20_30', 0)}人",
            f"  30-45時間: {distribution.get('h30_45', 0)}人",
            f"  45-60時間: {distribution.get('h45_60', 0)}人",
            f"  60時間超: {distribution.get('over_60h', 0)}人",
        ]
        for item in dist_items:
            elements.append(Paragraph(item, normal_style))

    # 生成日時
    elements.append(Spacer(1, 15*mm))
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    elements.append(Paragraph(f"生成日時: {now}", normal_style))

    doc.build(elements)
    return buffer.getvalue()
