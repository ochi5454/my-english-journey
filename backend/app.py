from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import init_db
from routers import records, progress, goals, chat, subcategory_goals, definitions

app = FastAPI(
    title="My English Journey API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(records.router)
app.include_router(progress.router)
app.include_router(goals.router)
app.include_router(chat.router)
app.include_router(subcategory_goals.router)
app.include_router(definitions.router)


@app.on_event("startup")
def startup():
    init_db()


@app.get("/health")
def health():
    return {"status": "ok"}
