#!/usr/bin/env bash
set -e

# backend フォルダを PYTHONPATH に追加
export PYTHONPATH=$PYTHONPATH:./backend

# 2. （ビルド済みフロントを配信したい場合は）npm run build などをここで呼ぶ
npm install && npm run build

# 3. Oryx ビルド済みの仮想環境を使う場合、pip 再インストールは不要
#    もし必要なら以下を有効化
python -m pip install -r requirements.txt

# ここではnpm install & buildは実行しない（ローカルでビルド済みファイルを配置済みと仮定）
# もしApp Service上でNode.jsのビルドも強制的に行いたい場合、
# カスタムDockerイメージを用意するか、Node.jsをインストールするステップをここに追加する必要がありますが、複雑です。

# Uvicornを起動
exec uvicorn backend.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1