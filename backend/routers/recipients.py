"""宛先管理API（ファジー検索機能付き）"""
import io
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
import pandas as pd
import httpx
from rapidfuzz import fuzz

from backend.core.database import get_db
from backend.core.auth import get_current_user, get_user_tokens
from backend.core.config import Settings
from backend.models.user import User
from backend.models.recipient import RecipientList, RecipientListMember

router = APIRouter(prefix="/recipients", tags=["recipients"])
settings = Settings()


# Pydantic Schemas
class RecipientMemberCreate(BaseModel):
    email: str
    name: Optional[str] = None
    department: Optional[str] = None
    note: Optional[str] = None


class RecipientListCreate(BaseModel):
    name: str
    description: Optional[str] = None
    members: Optional[List[RecipientMemberCreate]] = None


class RecipientMemberResponse(BaseModel):
    id: int
    email: str
    name: Optional[str]
    department: Optional[str]
    note: Optional[str]

    class Config:
        from_attributes = True


class RecipientListResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    member_count: int
    created_at: str

    class Config:
        from_attributes = True


class RecipientListDetailResponse(RecipientListResponse):
    members: List[RecipientMemberResponse]


class EntraUserResponse(BaseModel):
    id: str
    displayName: str
    mail: Optional[str]
    department: Optional[str]
    jobTitle: Optional[str]


class FuzzySearchResult(BaseModel):
    """ファジー検索結果"""
    email: str
    name: Optional[str]
    department: Optional[str]
    score: float  # マッチスコア (0-1)
    match_field: str  # マッチした項目 (email / name / department)
    source: str  # データソース (local / entra)


class FuzzySearchResponse(BaseModel):
    """ファジー検索レスポンス"""
    results: List[FuzzySearchResult]
    total_count: int
    query: str


def calculate_fuzzy_score(query: str, candidate: RecipientListMember) -> tuple:
    """
    ファジー検索スコアを計算

    Returns:
        tuple: (best_score, match_field)
    """
    query_lower = query.lower()

    # メールアドレスのスコア
    email_score = 0.0
    if candidate.email:
        email_lower = candidate.email.lower()
        # 完全一致
        if email_lower == query_lower:
            email_score = 1.0
        # 部分一致（含む）
        elif query_lower in email_lower:
            email_score = 0.85
        # ファジーマッチ
        else:
            email_score = fuzz.ratio(query_lower, email_lower) / 100

    # 名前のスコア
    name_score = 0.0
    if candidate.name:
        name = candidate.name
        name_lower = name.lower()
        # 完全一致
        if name_lower == query_lower or name == query:
            name_score = 0.95
        # 部分一致（含む）
        elif query_lower in name_lower or query in name:
            name_score = 0.8
        # ファジーマッチ（日本語対応のため部分一致スコアも使用）
        else:
            # partial_ratio は部分一致に強い
            name_score = max(
                fuzz.ratio(query, name) / 100,
                fuzz.partial_ratio(query, name) / 100 * 0.9  # 部分一致は少し低く評価
            )

    # 部署のスコア
    dept_score = 0.0
    if candidate.department:
        dept = candidate.department
        dept_lower = dept.lower()
        # 完全一致
        if dept_lower == query_lower or dept == query:
            dept_score = 0.6
        # 部分一致（含む）
        elif query_lower in dept_lower or query in dept:
            dept_score = 0.55
        # ファジーマッチ
        else:
            dept_score = fuzz.ratio(query, dept) / 100 * 0.5

    # 最高スコアを採用
    scores = [
        (email_score, "email"),
        (name_score, "name"),
        (dept_score, "department"),
    ]
    best_score, match_field = max(scores, key=lambda x: x[0])

    return best_score, match_field


# Endpoints
@router.get("/lists", response_model=List[RecipientListResponse])
async def list_recipient_lists(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """宛先リスト一覧を取得"""
    lists = db.query(RecipientList).filter(
        RecipientList.user_id == current_user.id
    ).order_by(RecipientList.created_at.desc()).all()

    return [
        RecipientListResponse(
            id=lst.id,
            name=lst.name,
            description=lst.description,
            member_count=len(lst.members),
            created_at=lst.created_at.isoformat(),
        )
        for lst in lists
    ]


@router.post("/lists", response_model=RecipientListDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_recipient_list(
    data: RecipientListCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """宛先リストを作成"""
    recipient_list = RecipientList(
        user_id=current_user.id,
        name=data.name,
        description=data.description,
    )
    db.add(recipient_list)
    db.flush()

    if data.members:
        for member in data.members:
            db.add(RecipientListMember(
                list_id=recipient_list.id,
                email=member.email,
                name=member.name,
                department=member.department,
                note=member.note,
            ))

    db.commit()
    db.refresh(recipient_list)

    return RecipientListDetailResponse(
        id=recipient_list.id,
        name=recipient_list.name,
        description=recipient_list.description,
        member_count=len(recipient_list.members),
        created_at=recipient_list.created_at.isoformat(),
        members=[
            RecipientMemberResponse(
                id=m.id,
                email=m.email,
                name=m.name,
                department=m.department,
                note=m.note,
            )
            for m in recipient_list.members
        ],
    )


@router.get("/lists/{list_id}", response_model=RecipientListDetailResponse)
async def get_recipient_list(
    list_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """宛先リスト詳細を取得"""
    recipient_list = db.query(RecipientList).filter(
        RecipientList.id == list_id,
        RecipientList.user_id == current_user.id,
    ).first()

    if not recipient_list:
        raise HTTPException(status_code=404, detail="Recipient list not found")

    return RecipientListDetailResponse(
        id=recipient_list.id,
        name=recipient_list.name,
        description=recipient_list.description,
        member_count=len(recipient_list.members),
        created_at=recipient_list.created_at.isoformat(),
        members=[
            RecipientMemberResponse(
                id=m.id,
                email=m.email,
                name=m.name,
                department=m.department,
                note=m.note,
            )
            for m in recipient_list.members
        ],
    )


@router.delete("/lists/{list_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_recipient_list(
    list_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """宛先リストを削除"""
    recipient_list = db.query(RecipientList).filter(
        RecipientList.id == list_id,
        RecipientList.user_id == current_user.id,
    ).first()

    if not recipient_list:
        raise HTTPException(status_code=404, detail="Recipient list not found")

    try:
        # 大量のメンバーがある場合に備えて、先にメンバーを一括削除
        db.query(RecipientListMember).filter(
            RecipientListMember.list_id == list_id
        ).delete(synchronize_session=False)

        # リスト本体を削除
        db.delete(recipient_list)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete list: {str(e)}")


@router.post("/upload", response_model=RecipientListDetailResponse)
async def upload_recipients(
    file: UploadFile = File(...),
    name: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Excel/CSVファイルから宛先リストをアップロード"""
    # ファイル形式チェック
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    ext = file.filename.lower().split(".")[-1]
    if ext not in ["xlsx", "xls", "csv"]:
        raise HTTPException(status_code=400, detail="Unsupported file format. Use xlsx, xls, or csv.")

    # ファイル読み込み
    content = await file.read()
    try:
        if ext == "csv":
            df = pd.read_csv(io.BytesIO(content))
        else:
            df = pd.read_excel(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {str(e)}")

    # カラムマッピング
    email_col = None
    name_col = None
    dept_col = None
    note_col = None

    for col in df.columns:
        col_lower = str(col).lower()
        if "mail" in col_lower or "メール" in col or "アドレス" in col:
            email_col = col
        elif "名" in col or "name" in col_lower:
            name_col = col
        elif "部" in col or "所属" in col or "department" in col_lower:
            dept_col = col
        elif "備考" in col or "note" in col_lower or "メモ" in col:
            note_col = col

    if not email_col:
        raise HTTPException(status_code=400, detail="Email column not found in file")

    # 宛先リスト作成
    list_name = name or file.filename.rsplit(".", 1)[0]
    recipient_list = RecipientList(
        user_id=current_user.id,
        name=list_name,
        description=f"Uploaded from {file.filename}",
    )
    db.add(recipient_list)
    db.flush()

    # メンバー追加
    added = 0
    for _, row in df.iterrows():
        email = str(row[email_col]).strip() if pd.notna(row[email_col]) else ""
        if not email or "@" not in email:
            continue

        member = RecipientListMember(
            list_id=recipient_list.id,
            email=email,
            name=str(row[name_col]).strip() if name_col and pd.notna(row.get(name_col)) else None,
            department=str(row[dept_col]).strip() if dept_col and pd.notna(row.get(dept_col)) else None,
            note=str(row[note_col]).strip() if note_col and pd.notna(row.get(note_col)) else None,
        )
        db.add(member)
        added += 1

    db.commit()
    db.refresh(recipient_list)

    return RecipientListDetailResponse(
        id=recipient_list.id,
        name=recipient_list.name,
        description=recipient_list.description,
        member_count=len(recipient_list.members),
        created_at=recipient_list.created_at.isoformat(),
        members=[
            RecipientMemberResponse(
                id=m.id,
                email=m.email,
                name=m.name,
                department=m.department,
                note=m.note,
            )
            for m in recipient_list.members
        ],
    )


@router.get("/search", response_model=List[EntraUserResponse])
async def search_entra_users(
    q: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Entra ID（Azure AD）からユーザーを検索"""
    if len(q) < 2:
        return []

    # ユーザーのアクセストークンを取得
    tokens = get_user_tokens(db, current_user.id)
    if not tokens or not tokens.get("access_token"):
        raise HTTPException(
            status_code=403,
            detail="Entra ID access token not available. Please login with Entra ID."
        )

    access_token = tokens["access_token"]

    # Microsoft Graph API でユーザー検索
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(
                "https://graph.microsoft.com/v1.0/users",
                params={
                    "$filter": f"startswith(displayName,'{q}') or startswith(mail,'{q}')",
                    "$select": "id,displayName,mail,department,jobTitle",
                    "$top": "10",
                },
                headers={
                    "Authorization": f"Bearer {access_token}",
                },
            )

            if response.status_code == 401:
                raise HTTPException(
                    status_code=401,
                    detail="Access token expired. Please re-login with Entra ID."
                )

            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Graph API error: {response.text}"
                )

            data = response.json()
            users = data.get("value", [])

            return [
                EntraUserResponse(
                    id=u.get("id", ""),
                    displayName=u.get("displayName", ""),
                    mail=u.get("mail"),
                    department=u.get("department"),
                    jobTitle=u.get("jobTitle"),
                )
                for u in users
                if u.get("mail")  # メールアドレスがあるユーザーのみ
            ]

    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"Failed to connect to Graph API: {str(e)}")


@router.get("/search/local", response_model=List[RecipientMemberResponse])
async def search_local_recipients(
    q: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """ローカルの宛先リストから検索"""
    if len(q) < 2:
        return []

    # ユーザーの宛先リストから検索
    members = db.query(RecipientListMember).join(RecipientList).filter(
        RecipientList.user_id == current_user.id,
    ).filter(
        (RecipientListMember.email.ilike(f"%{q}%")) |
        (RecipientListMember.name.ilike(f"%{q}%")) |
        (RecipientListMember.department.ilike(f"%{q}%"))
    ).limit(20).all()

    return [
        RecipientMemberResponse(
            id=m.id,
            email=m.email,
            name=m.name,
            department=m.department,
            note=m.note,
        )
        for m in members
    ]


@router.get("/search/fuzzy", response_model=FuzzySearchResponse)
async def fuzzy_search_recipients(
    q: str = Query(..., min_length=1, description="検索クエリ"),
    threshold: float = Query(0.4, ge=0, le=1, description="最小マッチスコア（0-1）"),
    limit: int = Query(20, ge=1, le=100, description="最大結果数"),
    include_entra: bool = Query(True, description="Entra ID検索を含めるか"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    ファジー検索（タイプミス許容）でユーザーを検索

    - ローカル宛先リストとEntra IDの両方から検索
    - Levenshtein距離ベースのスコアリング
    - 検索対象: メールアドレス、名前、部署
    """
    results: List[FuzzySearchResult] = []
    seen_emails = set()  # 重複排除用

    # 1. ローカル宛先リストからファジー検索
    all_members = db.query(RecipientListMember).join(RecipientList).filter(
        RecipientList.user_id == current_user.id,
    ).all()

    for member in all_members:
        score, match_field = calculate_fuzzy_score(q, member)

        if score >= threshold and member.email not in seen_emails:
            results.append(FuzzySearchResult(
                email=member.email,
                name=member.name,
                department=member.department,
                score=round(score, 3),
                match_field=match_field,
                source="local",
            ))
            seen_emails.add(member.email)

    # 2. Entra ID検索（オプション、前方一致のみだがスコア計算は行う）
    if include_entra and len(q) >= 2:
        try:
            tokens = get_user_tokens(db, current_user.id)
            if tokens and tokens.get("access_token"):
                access_token = tokens["access_token"]

                async with httpx.AsyncClient(timeout=10) as client:
                    response = await client.get(
                        "https://graph.microsoft.com/v1.0/users",
                        params={
                            "$filter": f"startswith(displayName,'{q}') or startswith(mail,'{q}')",
                            "$select": "id,displayName,mail,department,jobTitle",
                            "$top": "20",
                        },
                        headers={
                            "Authorization": f"Bearer {access_token}",
                        },
                    )

                    if response.status_code == 200:
                        data = response.json()
                        users = data.get("value", [])

                        for u in users:
                            email = u.get("mail")
                            if not email or email in seen_emails:
                                continue

                            # 仮のRecipientListMemberとしてスコア計算
                            class TempMember:
                                def __init__(self, email, name, department):
                                    self.email = email
                                    self.name = name
                                    self.department = department

                            temp = TempMember(
                                email=email,
                                name=u.get("displayName"),
                                department=u.get("department"),
                            )
                            score, match_field = calculate_fuzzy_score(q, temp)

                            if score >= threshold:
                                results.append(FuzzySearchResult(
                                    email=email,
                                    name=u.get("displayName"),
                                    department=u.get("department"),
                                    score=round(score, 3),
                                    match_field=match_field,
                                    source="entra",
                                ))
                                seen_emails.add(email)

        except Exception as e:
            # Entra ID検索に失敗してもローカル結果は返す
            print(f"Entra ID search failed: {e}")

    # 3. スコア順にソート
    results.sort(key=lambda x: x.score, reverse=True)

    # 4. 上限適用
    results = results[:limit]

    return FuzzySearchResponse(
        results=results,
        total_count=len(results),
        query=q,
    )


@router.get("/search/unified", response_model=FuzzySearchResponse)
async def unified_search_recipients(
    q: str = Query(..., min_length=1, description="検索クエリ"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    統合検索（フロントエンド向け簡易API）

    - ファジー検索をデフォルト設定で実行
    - To/Cc/Bcc入力欄からの検索に最適化
    """
    return await fuzzy_search_recipients(
        q=q,
        threshold=0.3,  # 緩めの閾値で多くの候補を返す
        limit=15,
        include_entra=True,
        db=db,
        current_user=current_user,
    )
