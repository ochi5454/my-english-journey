import os
import json
from langchain_community.vectorstores import FAISS
from langchain.embeddings import OpenAIEmbeddings
from langchain_core.prompts import PromptTemplate
from langchain_community.chat_models import ChatOpenAI
from langchain.chains.conversation.memory import ConversationBufferMemory
from fastapi.responses import JSONResponse

from backend.main import get_chat_history
from backend.def_library import build_conversation_chain, initialize_vectorstore, save_conversation_to_file
from backend.embedding_config import get_embedding_model

if __name__ == "__main__":
    user_id = input("ユーザーIDを入力してください: ")
    embedding = get_embedding_model()
    vectorstore = initialize_vectorstore(user_id, embedding)

    # メモリを初期化
    memory = ConversationBufferMemory(memory_key="chat_history", return_messages=True)

    # 会話チェーンを構築
    chain = build_conversation_chain(
        memory=memory,
        temperature=0.7,
        model_name="gpt-3.5-turbo",
        verbose=True
    )

    print("会話を開始します。終了するには 'exit' または 'quit' を入力してください。")
    while True:
        user_message = input("あなた: ")
        if user_message.lower() in ["exit", "quit"]:
            print("会話を終了します。")
            break

        # 履歴を取得
        response = get_chat_history(user_id)
        if isinstance(response, JSONResponse):
            # JSONResponseの内容を処理
            raw_body = bytes(response.body)  # memoryviewをbytesに変換
            data = json.loads(raw_body.decode("utf-8"))  # JSONを辞書に変換
            history = data.get("history", [])
        else:
            history = []

        context = "\n".join([f"ユーザー: {entry['user']}\nAI: {entry['assistant']}" for entry in history])

        # GPTに質問を送信
        response = chain.run({"history": context, "input": user_message})
        print("GPT:", response)

        # 会話履歴を保存
        save_conversation_to_file(user_id, user_message, response)