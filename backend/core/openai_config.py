from openai import OpenAI
from backend.core.config import OPENAI_API_KEY

def get_openai_client() -> OpenAI:
    return OpenAI(api_key=OPENAI_API_KEY.get_secret_value())