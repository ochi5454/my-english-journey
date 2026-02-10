"""宛先管理API"""
import io
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session
import pandas as pd
import httpx

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
