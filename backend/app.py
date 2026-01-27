from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.core.database import init_db
from backend.routers import excel, tournament, datasets


app = FastAPI(title="Tournament Ops MVP")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_event():
    init_db()


app.include_router(excel.router)
app.include_router(tournament.router)
app.include_router(datasets.router)
