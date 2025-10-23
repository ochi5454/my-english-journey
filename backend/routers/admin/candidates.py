# routers/candidates.py

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from backend.core.database import get_db
from backend.models.score_resume import Candidate
from backend.schemas.candidate import CandidateUpdateName

router = APIRouter(prefix="/admin/candidates")

@router.put("/{user_id}/name")
def update_candidate_name(user_id: str, update: CandidateUpdateName, db: Session = Depends(get_db)):
    candidate = db.query(Candidate).filter(Candidate.user_id == user_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    candidate.name = update.name
    db.commit()
    db.refresh(candidate)
    return {"message": "Name updated successfully", "name": candidate.name}