import chromadb
from chromadb.config import Settings
from backend.core.config import CHROMA_PATH

def get_chroma_client():
    return chromadb.PersistentClient(
        path=str(CHROMA_PATH),
        settings=Settings(
            anonymized_telemetry=False
        )
    )

def get_resume_collection():
    client = get_chroma_client()
    return client.get_or_create_collection("resumes_local")