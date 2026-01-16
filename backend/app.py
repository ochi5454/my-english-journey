from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.core.database import init_db, reset_sqlite_db
from backend.routers import excel, tournament


app = FastAPI(title="Tournament Ops MVP")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_event():
    reset_sqlite_db()
    init_db()


app.include_router(excel.router)
app.include_router(tournament.router)
