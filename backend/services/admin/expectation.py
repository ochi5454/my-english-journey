from typing import Optional
from sqlalchemy.orm import Session
from backend.models.score_resume import CandidateExpectations
from backend.schemas.expectation import CandidateExpectationCreate

def get_all_expectations(db: Session, division: Optional[str] = None):
    query = db.query(CandidateExpectations)

    if division:
        if division == "共通":
            query = query.filter(CandidateExpectations.division.is_(None))
        else:
            query = query.filter(CandidateExpectations.division == division)

    return query.all()

def create_expectation(db: Session, data: CandidateExpectationCreate):
    new_item = CandidateExpectations(**data.dict())
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item

def delete_expectation(db: Session, expectation_id: int):
    item = db.query(CandidateExpectations).filter(CandidateExpectations.id == expectation_id).first()
    if item:
        db.delete(item)
        db.commit()
        return True
    return False