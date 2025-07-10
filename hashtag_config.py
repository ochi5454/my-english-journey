import json
import os

def load_hashtag_map() -> dict:
    """ハッシュタグマップを読み込む"""
    json_file_path = os.path.join(os.path.dirname(__file__), "hashtag_actions.json")
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
    except FileNotFoundError:
        print(f"注意: {json_file_path} が見つかりません。ハッシュタグアクションは使用できません。")
        return {}
    except json.JSONDecodeError as e:
        print(f"{json_file_path} の読み込みエラー: {e}")
        return {}