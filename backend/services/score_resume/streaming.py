import json

def _sse(data: dict) -> bytes:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n".encode("utf-8")

def log_step(status: str, message: str):
    print(message)
    return _sse({"status": status, "log": message})