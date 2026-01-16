from typing import List
from fastapi import APIRouter, Depends, HTTPException
from backend.core.database import get_db
from backend.models.tournament import Tournament, Task, Document
from backend.schemas.tournament import (
    TournamentCreate,
    TournamentOut,
    TaskOut,
    TaskUpdate,
    DocumentOut,
    AlertOut,
    SeedRequest,
)
from backend.services.tournament import (
    generate_tasks_from_template,
    create_overdue_alerts,
    build_local_timeline,
    call_openai_json,
    PROMPTS,
)
from datetime import date

router = APIRouter(tags=["tournament"])


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/tournaments", response_model=List[TournamentOut])
def list_tournaments(db=Depends(get_db)):
    return db.query(Tournament).all()


@router.post("/tournaments", response_model=TournamentOut)
def create_tournament(payload: TournamentCreate, db=Depends(get_db)):
    t = Tournament(**payload.dict())
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


@router.delete("/tournaments/{tournament_id}")
def delete_tournament(tournament_id: int, db=Depends(get_db)):
    t = db.query(Tournament).get(tournament_id)
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(t)
    db.commit()
    return {"deleted": tournament_id}


@router.post("/tournaments/{tournament_id}/generate/tasks", response_model=List[TaskOut])
def generate_tasks(tournament_id: int, db=Depends(get_db)):
    t = db.query(Tournament).get(tournament_id)
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    created = generate_tasks_from_template(t, db)
    return created


@router.post("/tournaments/{tournament_id}/generate/doc/{doc_type}", response_model=DocumentOut)
async def generate_doc(tournament_id: int, doc_type: str, db=Depends(get_db)):
    t = db.query(Tournament).get(tournament_id)
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    if doc_type not in ["timeline", "email_venue", "email_referee"]:
        raise HTTPException(status_code=400, detail="invalid doc_type")
    if doc_type == "timeline":
        content = build_local_timeline(t)
        if t and t.id and t.name and t.category and t.scale and t.start_date and t.end_date:
            try:
                prompt = PROMPTS[doc_type]
                content = await call_openai_json(prompt, t)
            except Exception:
                pass
    else:
        prompt = PROMPTS[doc_type]
        content = await call_openai_json(prompt, t)
    doc = Document(tournament_id=tournament_id, doc_type=doc_type, content=content)
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


@router.patch("/tasks/{task_id}", response_model=TaskOut)
def update_task(task_id: int, payload: TaskUpdate, db=Depends(get_db)):
    task = db.query(Task).get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Not found")
    for key, value in payload.dict(exclude_unset=True).items():
        setattr(task, key, value)
    db.commit()
    db.refresh(task)
    return task


@router.get("/tournaments/{tournament_id}", response_model=TournamentOut)
def get_tournament(tournament_id: int, db=Depends(get_db)):
    t = db.query(Tournament).get(tournament_id)
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    create_overdue_alerts(db, tournament_id)
    db.refresh(t)
    return t


@router.post("/seed", response_model=TournamentOut)
def seed(req: SeedRequest, db=Depends(get_db)):
    t = Tournament(**req.dict())
    db.add(t)
    db.commit()
    db.refresh(t)
    generate_tasks_from_template(t, db)
    return t
