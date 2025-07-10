import json
from pathlib import Path

def load_hashtag_map() -> dict:
    """ハッシュタグマップを読み込む"""
    # config.pyがある場合はそれを使用
    try:
        from config import DATA_DIR
        json_file_path = DATA_DIR / "hashtag_actions.json"
    except ImportError:
        # config.pyがない場合は相対パスを使用
        current_dir = Path(__file__).parent
        data_dir = current_dir / "data"
        data_dir.mkdir(exist_ok=True)  # dataフォルダーを自動作成
        json_file_path = data_dir / "hashtag_actions.json"
    
    try:
        with open(json_file_path, mode="r", encoding="utf-8") as f:
            data = json.load(f)
            
            # エイリアスを解決するロジック
            resolved_hashtags = {}
            for tag, action_name in data["hashtags"].items():
                if action_name.startswith("#"):  # エイリアスの場合
                    resolved_action_name = data["hashtags"].get(action_name)
                    if resolved_action_name:
                        resolved_hashtags[tag] = {
                            "name": resolved_action_name,
                            "endpoint": data["actions"][resolved_action_name]["endpoint"],
                            "details": data["actions"][resolved_action_name]
                        }
                else:  # 通常のアクションの場合
                    resolved_hashtags[tag] = {
                        "name": action_name,
                        "endpoint": data["actions"][action_name]["endpoint"],
                        "details": data["actions"][action_name]
                    }
            
            return resolved_hashtags
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"ハッシュタグ設定の読み込みエラー: {e}")
        return {}