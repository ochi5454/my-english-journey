import os
import tempfile
from pathlib import Path
from typing import List, Optional, Tuple
import io

from faster_whisper import WhisperModel

ASR_MODEL_PATH = os.getenv("ASR_MODEL_PATH")
ASR_DEVICE = os.getenv("ASR_DEVICE", "cpu")
ASR_COMPUTE_TYPE = os.getenv("ASR_COMPUTE_TYPE", "int8")

DIARIZATION_MODEL_PATH = os.getenv("DIARIZATION_MODEL_PATH")
HUGGINGFACE_TOKEN = os.getenv("HUGGINGFACE_TOKEN") or os.getenv("HF_TOKEN")


def _load_asr_model() -> WhisperModel:
    """
    Load faster-whisper model from local path.
    """
    if not ASR_MODEL_PATH:
        raise RuntimeError("ASR_MODEL_PATH is not set")
    path = Path(ASR_MODEL_PATH).expanduser()
    return WhisperModel(str(path), device=ASR_DEVICE, compute_type=ASR_COMPUTE_TYPE)


_asr_model: Optional[WhisperModel] = None


def get_asr_model() -> WhisperModel:
    global _asr_model
    if _asr_model is None:
        _asr_model = _load_asr_model()
    return _asr_model


def _load_diarization_pipeline():
    """
    Load pyannote diarization pipeline from local path or HF Hub (token required).
    This may require prior agreement to model terms on Hugging Face.
    """
    if not DIARIZATION_MODEL_PATH:
        raise RuntimeError("DIARIZATION_MODEL_PATH is not set")
    from pyannote.audio import Pipeline

    path = Path(DIARIZATION_MODEL_PATH).expanduser()
    if path.exists():
        return Pipeline.from_pretrained(path)
    # Fallback to hub (requires token and network)
    return Pipeline.from_pretrained(DIARIZATION_MODEL_PATH, use_auth_token=HUGGINGFACE_TOKEN)


_dia_pipeline = None


def get_diarization_pipeline():
    global _dia_pipeline
    if _dia_pipeline is None:
        _dia_pipeline = _load_diarization_pipeline()
    return _dia_pipeline


def _write_temp_wav(file_bytes: bytes) -> str:
    """
    Save incoming audio bytes to a wav file that faster-whisper can read.
    Try to transcode with pydub (ffmpeg). Fallback: raw write.
    """
    fd, path = tempfile.mkstemp(suffix=".wav")
    try:
        from pydub import AudioSegment  # type: ignore

        audio = AudioSegment.from_file(io.BytesIO(file_bytes))
        with os.fdopen(fd, "wb") as f:
            audio.export(f, format="wav")
        return path
    except Exception:
        with os.fdopen(fd, "wb") as f:
            f.write(file_bytes)
        return path


def _transcribe_segment(model: WhisperModel, audio_path: str, start: float, end: float) -> str:
    segments, _ = model.transcribe(
        audio_path,
        language="ja",
        temperature=0.0,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 500},
        word_timestamps=False,
        initial_prompt=None,
        start=start,
        end=end,
    )
    texts: List[str] = []
    for seg in segments:
        texts.append(seg.text.strip())
    return " ".join(texts).strip()


def transcribe_local(file_bytes: bytes, diarize: bool = False) -> str:
    """
    Local ASR with optional diarization.
    - ASR: faster-whisper (local model path)
    - Diarization: pyannote (local path or HF token)
    """
    audio_path = _write_temp_wav(file_bytes)
    try:
        model = get_asr_model()
    except Exception:
        os.unlink(audio_path)
        raise

    try:
        if diarize:
            try:
                pipeline = get_diarization_pipeline()
                diarization = pipeline(audio_path)
                parts: List[str] = []
                for turn, _, speaker in diarization.itertracks(yield_label=True):
                    seg_text = _transcribe_segment(model, audio_path, turn.start, turn.end)
                    if seg_text:
                        parts.append(f"{speaker}: {seg_text}")
                return "\n".join(parts)
            except Exception:
                # Fall back to non-diarized transcription if diarization fails
                pass

        # No diarization: full audio transcription
        segments, _ = model.transcribe(
            audio_path,
            language="ja",
            temperature=0.0,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
            word_timestamps=False,
        )
        texts: List[str] = []
        for seg in segments:
            texts.append(seg.text.strip())
        return "\n".join(texts).strip()
    finally:
        try:
            os.unlink(audio_path)
        except Exception:
            pass
