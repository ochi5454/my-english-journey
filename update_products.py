#### how to use
# ターミナルに、「python3 update_products.py」と実行
# 商品DB（products.json）の自動更新が可能
# 使い回し用スクリプト

import json

# 読み込みファイルと保存ファイル（上書きするなら same path）
file_path = "products.json"

# JSONファイルを読み込む
with open(file_path, "r", encoding="utf-8") as f:
    products = json.load(f)

# 各アイテムに "url": "" を追加（すでにある場合はスキップ）
for product in products:
    if "url" not in product:
        product["url"] = ""

# 上書き保存
with open(file_path, "w", encoding="utf-8") as f:
    json.dump(products, f, ensure_ascii=False, indent=2)

print("✅ 'products.jsonの更新完了しました。")