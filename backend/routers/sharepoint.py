# backend/routers/sharepoint.py
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from typing import List
import os

# 自作関数たちは必要に応じて import
from def_library import (
    load_sharepoint_document,
    extract_keywords,
    generate_related_keywords_llm,
    clean_related_keywords,
    generate_summary,
    save_conversation_to_file,
    mask_personal_info
)

router = APIRouter()

class SharePointQuery(BaseModel):
    query: str

class SharePointRecommendationResponse(BaseModel):
    user_id: str
    message: str
    keywords: List[str]
    documents: List[str]

@router.post("/sharepoint-recommend", response_model=SharePointRecommendationResponse)
async def sharepoint_recommend(req: SharePointQuery, request: Request):
    try:
        query = req.query
        masked_query = mask_personal_info(query).strip()

        keywords = extract_keywords(masked_query)
        extended_keywords = clean_related_keywords(generate_related_keywords_llm(keywords))
        all_keywords = list(set(keywords + extended_keywords))

        documents_found = []
        for keyword in all_keywords:
            try:
                site_url = os.getenv("SHAREPOINT_SITE_URL")
                file_path = f"docs/{keyword}.txt"
                doc_text = load_sharepoint_document(site_url, file_path)
                documents_found.append(f"{keyword}: {doc_text[:200]}...")
            except Exception as e:
                print(f"❌ {keyword} に関する資料の取得失敗: {e}")
                continue

        summary = generate_summary(masked_query, documents_found, "")
        save_conversation_to_file(
            user_id=request.state.user_id,
            user_message=masked_query,
            assistant_response="\n".join(documents_found),
            summary=summary
        )

        return {
            "user_id": request.state.user_id,
            "message": masked_query,
            "keywords": keywords,
            "documents": documents_found
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))