#### how to use
# ターミナルに、「python3 update_products.py」と実行
# 商品DB（products.json）の自動更新が可能
# 使い回し用スクリプト

import json
import random

# 読み込みファイルと保存ファイル（上書きするなら same path）
file_path = "../data/products.json"

# JSONファイルを読み込む
with open(file_path, "r", encoding="utf-8") as f:
    products = json.load(f)

# 各アイテムに "url" と ランダムな "price" を追加
for product in products:
    if "url" not in product:
        product["url"] = ""
    if "price" not in product:
        product["price"] = random.randint(500, 3000)  # 500円〜3000円の間でランダム

# 上書き保存
with open(file_path, "w", encoding="utf-8") as f:
    json.dump(products, f, ensure_ascii=False, indent=2)

print("✅ 'products.json' に url / ランダムprice を追加しました。")