"""組織管理API（部署単位での宛先指定用）"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.core.database import get_db
from backend.core.auth import get_current_user
from backend.models.user import User
from backend.models.organization import Organization, EmployeeAssignment, EntraSyncLog
from backend.services.entra_sync_service import seed_demo_organizations, seed_demo_employees

router = APIRouter(prefix="/organizations", tags=["organizations"])


# ========== Pydantic Schemas ==========

class OrganizationBase(BaseModel):
    code: Optional[str] = None
    name: str
    name_en: Optional[str] = None
    parent_id: Optional[int] = None
    level: int = 1
    sort_order: int = 0


class OrganizationCreate(OrganizationBase):
    pass


class OrganizationUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    name_en: Optional[str] = None
    parent_id: Optional[int] = None
    level: Optional[int] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class OrganizationResponse(BaseModel):
    id: int
    code: Optional[str]
    name: str
    name_en: Optional[str]
    parent_id: Optional[int]
    level: int
    member_count: int
    is_active: bool
    sort_order: int

    class Config:
        from_attributes = True


class OrganizationTreeNode(BaseModel):
    id: int
    code: Optional[str]
    name: str
    member_count: int
    level: int
    children: List["OrganizationTreeNode"] = []

    class Config:
        from_attributes = True


# 自己参照のための更新
OrganizationTreeNode.model_rebuild()


class EmployeeMemberResponse(BaseModel):
    id: int
    email: str
    display_name: Optional[str]
    job_title: Optional[str]
    department: Optional[str]  # organization.name

    class Config:
        from_attributes = True


class OrganizationMembersResponse(BaseModel):
    organization: OrganizationResponse
    members: List[EmployeeMemberResponse]
    total_count: int
    page: int
    page_size: int
    total_pages: int


class SyncLogResponse(BaseModel):
    id: int
    sync_type: str
    started_at: str
    completed_at: Optional[str]
    status: str
    users_processed: int
    users_added: int
    users_updated: int
    users_deactivated: int
    orgs_added: int
    orgs_updated: int
    error_count: int

    class Config:
        from_attributes = True


# ========== Helper Functions ==========

def build_organization_tree(
    organizations: List[Organization],
    parent_id: Optional[int] = None,
    max_depth: Optional[int] = None,
    current_depth: int = 0
) -> List[OrganizationTreeNode]:
    """
    フラットな組織リストからツリー構造を構築
    """
    if max_depth is not None and current_depth >= max_depth:
        return []

    tree = []
    for org in organizations:
        if org.parent_id == parent_id:
            children = build_organization_tree(
                organizations,
                parent_id=org.id,
                max_depth=max_depth,
                current_depth=current_depth + 1
            )
            node = OrganizationTreeNode(
                id=org.id,
                code=org.code,
                name=org.name,
                member_count=org.member_count,
                level=org.level,
                children=children
            )
            tree.append(node)

    # sort_orderでソート
    tree.sort(key=lambda x: (organizations[[o.id for o in organizations].index(x.id)].sort_order, x.name))
    return tree


def get_descendant_org_ids(db: Session, org_id: int) -> List[int]:
    """
    指定した組織の全子孫組織IDを取得（再帰）
    """
    result = []
    children = db.query(Organization).filter(
        Organization.parent_id == org_id,
        Organization.is_active == True
    ).all()

    for child in children:
        result.append(child.id)
        result.extend(get_descendant_org_ids(db, child.id))

    return result


# ========== Endpoints ==========

@router.get("/tree", response_model=List[OrganizationTreeNode])
async def get_organization_tree(
    include_inactive: bool = Query(False, description="非アクティブな組織を含めるか"),
    max_depth: Optional[int] = Query(None, description="最大階層深度"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    組織ツリーを取得

    - 階層構造でネストされた組織一覧を返す
    - 各組織のmember_countは所属人数
    """
    query = db.query(Organization)

    if not include_inactive:
        query = query.filter(Organization.is_active == True)

    organizations = query.order_by(Organization.sort_order, Organization.name).all()

    tree = build_organization_tree(organizations, parent_id=None, max_depth=max_depth)

    return tree


@router.get("", response_model=List[OrganizationResponse])
async def list_organizations(
    include_inactive: bool = Query(False, description="非アクティブな組織を含めるか"),
    parent_id: Optional[int] = Query(None, description="親組織IDでフィルタ"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    組織一覧を取得（フラット）
    """
    query = db.query(Organization)

    if not include_inactive:
        query = query.filter(Organization.is_active == True)

    if parent_id is not None:
        query = query.filter(Organization.parent_id == parent_id)

    organizations = query.order_by(Organization.sort_order, Organization.name).all()

    return organizations


@router.post("", response_model=OrganizationResponse, status_code=201)
async def create_organization(
    data: OrganizationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    組織を作成（手動）
    """
    # 親組織の存在確認
    if data.parent_id:
        parent = db.query(Organization).filter(Organization.id == data.parent_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent organization not found")

    org = Organization(
        code=data.code,
        name=data.name,
        name_en=data.name_en,
        parent_id=data.parent_id,
        level=data.level,
        sort_order=data.sort_order,
    )
    db.add(org)
    db.commit()
    db.refresh(org)

    return org


@router.get("/{org_id}", response_model=OrganizationResponse)
async def get_organization(
    org_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    組織詳細を取得
    """
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    return org


@router.put("/{org_id}", response_model=OrganizationResponse)
async def update_organization(
    org_id: int,
    data: OrganizationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    組織を更新
    """
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # 更新
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(org, key, value)

    db.commit()
    db.refresh(org)

    return org


@router.delete("/{org_id}", status_code=204)
async def delete_organization(
    org_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    組織を削除（論理削除）
    """
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # 子組織があるかチェック
    child_count = db.query(Organization).filter(Organization.parent_id == org_id).count()
    if child_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete organization with {child_count} child organizations"
        )

    # 所属メンバーがいるかチェック
    member_count = db.query(EmployeeAssignment).filter(
        EmployeeAssignment.organization_id == org_id,
        EmployeeAssignment.end_date == None
    ).count()
    if member_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete organization with {member_count} active members"
        )

    # 論理削除
    org.is_active = False
    db.commit()


@router.get("/{org_id}/members", response_model=OrganizationMembersResponse)
async def get_organization_members(
    org_id: int,
    include_children: bool = Query(True, description="下位組織のメンバーを含めるか"),
    page: int = Query(1, ge=1, description="ページ番号"),
    page_size: int = Query(50, ge=1, le=200, description="1ページあたりの件数"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    組織のメンバー一覧を取得

    - ページネーション対応
    - 下位組織を含むオプション
    """
    # 組織の存在確認
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # 対象組織IDリストを取得
    org_ids = [org_id]
    if include_children:
        child_ids = get_descendant_org_ids(db, org_id)
        org_ids.extend(child_ids)

    # メンバー取得（現在所属中のみ）
    query = db.query(EmployeeAssignment).filter(
        EmployeeAssignment.organization_id.in_(org_ids),
        EmployeeAssignment.end_date == None  # 現在所属中
    )

    total = query.count()
    total_pages = (total + page_size - 1) // page_size

    members = query.order_by(
        EmployeeAssignment.display_name
    ).offset((page - 1) * page_size).limit(page_size).all()

    return OrganizationMembersResponse(
        organization=OrganizationResponse(
            id=org.id,
            code=org.code,
            name=org.name,
            name_en=org.name_en,
            parent_id=org.parent_id,
            level=org.level,
            member_count=org.member_count,
            is_active=org.is_active,
            sort_order=org.sort_order,
        ),
        members=[
            EmployeeMemberResponse(
                id=m.id,
                email=m.email,
                display_name=m.display_name,
                job_title=m.job_title,
                department=m.organization.name if m.organization else None,
            )
            for m in members
        ],
        total_count=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/{org_id}/emails", response_model=List[str])
async def get_organization_emails(
    org_id: int,
    include_children: bool = Query(True, description="下位組織のメンバーを含めるか"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    組織のメンバーのメールアドレス一覧を取得

    - 宛先への一括追加用
    """
    # 組織の存在確認
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # 対象組織IDリストを取得
    org_ids = [org_id]
    if include_children:
        child_ids = get_descendant_org_ids(db, org_id)
        org_ids.extend(child_ids)

    # メールアドレス取得
    emails = db.query(EmployeeAssignment.email).filter(
        EmployeeAssignment.organization_id.in_(org_ids),
        EmployeeAssignment.end_date == None
    ).all()

    return [e[0] for e in emails]


# ========== 同期ログ ==========

@router.get("/sync/logs", response_model=List[SyncLogResponse])
async def get_sync_logs(
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Entra ID同期ログを取得
    """
    logs = db.query(EntraSyncLog).order_by(
        EntraSyncLog.started_at.desc()
    ).limit(limit).all()

    return [
        SyncLogResponse(
            id=log.id,
            sync_type=log.sync_type,
            started_at=log.started_at.isoformat(),
            completed_at=log.completed_at.isoformat() if log.completed_at else None,
            status=log.status,
            users_processed=log.users_processed,
            users_added=log.users_added,
            users_updated=log.users_updated,
            users_deactivated=log.users_deactivated,
            orgs_added=log.orgs_added,
            orgs_updated=log.orgs_updated,
            error_count=log.error_count,
        )
        for log in logs
    ]


# ========== 手動メンバー管理 ==========

class EmployeeCreate(BaseModel):
    email: str
    display_name: Optional[str] = None
    organization_id: Optional[int] = None
    job_title: Optional[str] = None
    employee_number: Optional[str] = None


@router.post("/employees", response_model=EmployeeMemberResponse, status_code=201)
async def create_employee(
    data: EmployeeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    従業員を手動で追加（Entra ID同期外のユーザー用）
    """
    # 組織の存在確認
    if data.organization_id:
        org = db.query(Organization).filter(Organization.id == data.organization_id).first()
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")

    # 重複チェック
    existing = db.query(EmployeeAssignment).filter(
        EmployeeAssignment.email == data.email,
        EmployeeAssignment.end_date == None
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Employee with this email already exists")

    employee = EmployeeAssignment(
        entra_user_id=f"manual_{data.email}",  # 手動追加用のID
        email=data.email,
        display_name=data.display_name,
        organization_id=data.organization_id,
        job_title=data.job_title,
        employee_number=data.employee_number,
        sync_status="manual",
    )
    db.add(employee)

    # member_countを更新
    if data.organization_id:
        db.query(Organization).filter(
            Organization.id == data.organization_id
        ).update({"member_count": Organization.member_count + 1})

    db.commit()
    db.refresh(employee)

    return EmployeeMemberResponse(
        id=employee.id,
        email=employee.email,
        display_name=employee.display_name,
        job_title=employee.job_title,
        department=employee.organization.name if employee.organization else None,
    )


# ========== 開発用シードデータ ==========

class SeedResponse(BaseModel):
    message: str
    organizations_created: int
    employees_created: int


@router.post("/seed/demo", response_model=SeedResponse)
async def seed_demo_data(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    デモ用の組織・従業員データを投入（開発環境用）

    - 組織ツリー（本社、営業本部、開発本部など）
    - サンプル従業員（各部署に2-3名）
    """
    org_count_before = db.query(Organization).count()
    emp_count_before = db.query(EmployeeAssignment).count()

    seed_demo_organizations(db)
    seed_demo_employees(db)

    org_count_after = db.query(Organization).count()
    emp_count_after = db.query(EmployeeAssignment).count()

    return SeedResponse(
        message="Demo data seeded successfully",
        organizations_created=org_count_after - org_count_before,
        employees_created=emp_count_after - emp_count_before,
    )
