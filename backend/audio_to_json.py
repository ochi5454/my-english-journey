"""
Utility to transcribe an audio file with OpenAI Whisper API and populate a JSON format definition.

Usage:
    python audio_to_json.py --audio path/to/input.mp3 --format path/to/format.json --output out.json

Requirements:
    - Python 3.9+
    - openai>=1.6.0 (or compatible client that supports audio.transcriptions.create)
    - OPENAI_API_KEY environment variable set
"""

import argparse
import json
import os
from pathlib import Path
from typing import Any, Dict

from openai import OpenAI


def load_format_definition(path: Path) -> Dict[str, Any]:
    """Load the JSON format definition from a file."""
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def save_json(data: Dict[str, Any], path: Path) -> None:
    """Save the populated JSON to the given path."""
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def transcribe_audio(audio_path: Path, model: str = "whisper-1") -> str:
    """
    Transcribe audio using OpenAI Whisper API.
    Returns the transcribed text (plain UTF-8). Assumes Japanese audio by default.
    """
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    with audio_path.open("rb") as f:
        response = client.audio.transcriptions.create(model=model, file=f, language="ja")
    return response.text


def inject_transcript(format_def: Any, transcript: str) -> Any:
    """
    Recursively inject the transcript into the format definition.
    If a string contains the placeholder '{{transcript}}', replace it with the transcription text.
    """
    if isinstance(format_def, dict):
        return {k: inject_transcript(v, transcript) for k, v in format_def.items()}
    if isinstance(format_def, list):
        return [inject_transcript(v, transcript) for v in format_def]
    if isinstance(format_def, str):
        return format_def.replace("{{transcript}}", transcript)
    return format_def


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(description="Transcribe audio and populate a JSON format.")
    parser.add_argument("--audio", required=True, type=Path, help="Path to mp3 or wav file")
    parser.add_argument("--format", required=True, type=Path, help="Path to JSON format definition (see README or below)")
    parser.add_argument("--output", type=Path, help="Path to write populated JSON (defaults to stdout)")
    parser.add_argument("--model", default="whisper-1", help="Whisper model name")
    return parser.parse_args()


def main() -> None:
    """Entry point: transcribe audio, inject into format, and output JSON."""
    args = parse_args()
    fmt = load_format_definition(args.format)
    transcript = transcribe_audio(args.audio, model=args.model)
    populated = inject_transcript(fmt, transcript)

    if args.output:
        save_json(populated, args.output)
        print(f"Saved populated JSON to {args.output}")
    else:
        print(json.dumps(populated, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
