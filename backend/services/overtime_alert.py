"""
36協定アラートサービス

残業時間の法定上限超過を検出し、アラートを生成
"""
from enum import Enum
from dataclasses import dataclass, asdict
from typing import List, Dict, Optional
from datetime import datetime


class AlertLevel(str, Enum):
    """アラートレベル"""
    INFO = "info"        # 15-30時間: 通常監視
    WARNING = "warning"  # 30-45時間: 社内上限接近
    DANGER = "danger"    # 45-60時間: 法定上限接近
    CRITICAL = "critical"  # 60時間以上: 特別条項発動


@dataclass
class OvertimeThreshold:
    """残業時間閾値設定"""
    info_min: float = 15.0       # INFO開始
    warning_min: float = 30.0    # WARNING開始（社内上限）
    danger_min: float = 45.0     # DANGER開始（法定上限）
    critical_min: float = 60.0   # CRITICAL開始（特別条項）
    max_limit: float = 80.0      # 絶対上限（長時間労働）


@dataclass
class OvertimeAlert:
    """残業アラート"""
    employee_id: str
    employee_name: str
    department: str
    current_hours: float
    threshold_name: str
    level: AlertLevel
    message: str
    remaining_hours: Optional[float] = None


# デフォルト閾値
DEFAULT_THRESHOLDS = OvertimeThreshold()


def parse_time_to_hours(time_str: str) -> float:
    """
    時間文字列を時間数に変換

    対応形式:
    - "HH:MM" (例: "45:30")
    - "H.HH" (例: "45.5")
    - 数値（そのまま時間として扱う）
    """
    if not time_str or time_str == "":
        return 0.0

    time_str = str(time_str).strip()

    try:
        if ":" in time_str:
            parts = time_str.split(":")
            hours = int(parts[0])
            minutes = int(parts[1]) if len(parts) > 1 else 0
            return hours + minutes / 60.0
        else:
            return float(time_str)
    except (ValueError, IndexError):
        return 0.0


def get_alert_level(hours: float, thresholds: OvertimeThreshold = DEFAULT_THRESHOLDS) -> AlertLevel:
    """残業時間からアラートレベルを判定"""
    if hours >= thresholds.critical_min:
        return AlertLevel.CRITICAL
    elif hours >= thresholds.danger_min:
        return AlertLevel.DANGER
    elif hours >= thresholds.warning_min:
        return AlertLevel.WARNING
    elif hours >= thresholds.info_min:
        return AlertLevel.INFO
    return AlertLevel.INFO


def get_alert_message(level: AlertLevel, hours: float, thresholds: OvertimeThreshold = DEFAULT_THRESHOLDS) -> tuple[str, str]:
    """アラートレベルに応じたメッセージと閾値名を返す"""
    if level == AlertLevel.CRITICAL:
        if hours >= thresholds.max_limit:
            return "長時間労働", f"残業時間が{thresholds.max_limit}時間を超えています。即座に対応が必要です。"
        return "特別条項上限", f"特別条項の上限（{thresholds.critical_min}時間）を超えています。"
    elif level == AlertLevel.DANGER:
        return "法定上限", f"法定残業上限（{thresholds.danger_min}時間）に達しています。"
    elif level == AlertLevel.WARNING:
        return "社内上限", f"社内上限（{thresholds.warning_min}時間）に接近しています。"
    else:
        return "監視対象", f"残業時間が{thresholds.info_min}時間を超えています。"


def check_overtime_alerts(
    overtime_data: List[Dict],
    thresholds: OvertimeThreshold = DEFAULT_THRESHOLDS,
    min_level: AlertLevel = AlertLevel.WARNING
) -> List[OvertimeAlert]:
    """
    残業データからアラートを生成

    Args:
        overtime_data: 残業データのリスト
            各要素には以下のキーが必要:
            - emp_no または employee_id: 従業員番号
            - name または employee_name: 氏名
            - overtime_hours または overtime: 残業時間（HH:MM形式または数値）
            - department または org6 (オプション): 部署名
        thresholds: 閾値設定
        min_level: 最小アラートレベル（これ以上のレベルのみ返す）

    Returns:
        アラートのリスト（残業時間の降順でソート）
    """
    alerts = []
    level_priority = {
        AlertLevel.INFO: 0,
        AlertLevel.WARNING: 1,
        AlertLevel.DANGER: 2,
        AlertLevel.CRITICAL: 3,
    }

    min_priority = level_priority.get(min_level, 0)

    for row in overtime_data:
        # 従業員情報を取得
        emp_id = str(row.get("emp_no") or row.get("employee_id") or row.get("従業員番号") or "")
        emp_name = str(row.get("name") or row.get("employee_name") or row.get("氏名") or "")
        department = str(row.get("department") or row.get("org6") or row.get("所属名称6") or "")

        # 残業時間を取得
        hours_raw = row.get("overtime_hours") or row.get("overtime") or row.get("実所定外時間") or "0"
        hours = parse_time_to_hours(str(hours_raw))

        if hours < thresholds.info_min:
            continue

        level = get_alert_level(hours, thresholds)

        if level_priority.get(level, 0) < min_priority:
            continue

        threshold_name, message = get_alert_message(level, hours, thresholds)

        # 次の閾値までの残り時間を計算
        if level == AlertLevel.INFO:
            remaining = thresholds.warning_min - hours
        elif level == AlertLevel.WARNING:
            remaining = thresholds.danger_min - hours
        elif level == AlertLevel.DANGER:
            remaining = thresholds.critical_min - hours
        else:
            remaining = thresholds.max_limit - hours

        alerts.append(OvertimeAlert(
            employee_id=emp_id,
            employee_name=emp_name,
            department=department,
            current_hours=round(hours, 2),
            threshold_name=threshold_name,
            level=level,
            message=message,
            remaining_hours=round(remaining, 2) if remaining > 0 else None,
        ))

    # 残業時間の降順でソート
    alerts.sort(key=lambda a: a.current_hours, reverse=True)

    return alerts


def get_alert_summary(alerts: List[OvertimeAlert]) -> Dict:
    """
    アラートの集計サマリーを生成

    Returns:
        各レベルごとの件数と、部署ごとの件数
    """
    level_counts = {level.value: 0 for level in AlertLevel}
    department_counts: Dict[str, Dict[str, int]] = {}

    for alert in alerts:
        level_counts[alert.level.value] += 1

        dept = alert.department or "未設定"
        if dept not in department_counts:
            department_counts[dept] = {level.value: 0 for level in AlertLevel}
        department_counts[dept][alert.level.value] += 1

    return {
        "total": len(alerts),
        "by_level": level_counts,
        "by_department": department_counts,
        "critical_count": level_counts[AlertLevel.CRITICAL.value],
        "danger_count": level_counts[AlertLevel.DANGER.value],
        "warning_count": level_counts[AlertLevel.WARNING.value],
    }


def alerts_to_dict(alerts: List[OvertimeAlert]) -> List[Dict]:
    """アラートリストを辞書形式に変換"""
    return [
        {
            **asdict(alert),
            "level": alert.level.value,
        }
        for alert in alerts
    ]
