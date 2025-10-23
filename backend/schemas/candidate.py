from pydantic import BaseModel

class CandidateUpdateName(BaseModel):
    name: str