from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.core.database import init_db
from backend.routers import excel, tournament, datasets, export_cursor, jobs, auth


app = FastAPI(title="Tournament Ops MVP")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)


@app.on_event("startup")
def startup_event():
    init_db()


app.include_router(excel.router)
app.include_router(tournament.router)
app.include_router(datasets.router)
app.include_router(export_cursor.router)
app.include_router(jobs.router)
app.include_router(auth.router)
