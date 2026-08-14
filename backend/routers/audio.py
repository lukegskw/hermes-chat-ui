"""Temporary audio upload and transcription for the private Hermes UI."""

from __future__ import annotations

import asyncio
import logging
import os
import tempfile
from collections.abc import AsyncIterator

from fastapi import APIRouter, File, UploadFile
from fastapi.responses import JSONResponse

from .. import hermes_stt

router = APIRouter(tags=["audio"])
logger = logging.getLogger(__name__)

MAX_AUDIO_BYTES = 25 * 1024 * 1024
CHUNK_BYTES = 64 * 1024
MIME_SUFFIXES = {
    "audio/aac": ".aac",
    "audio/flac": ".flac",
    "audio/m4a": ".m4a",
    "audio/mp3": ".mp3",
    "audio/mp4": ".mp4",
    "audio/mpeg": ".mp3",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
    "audio/wave": ".wav",
    "audio/webm": ".webm",
    "audio/x-m4a": ".m4a",
    "audio/x-wav": ".wav",
    "video/webm": ".webm",
}

_transcription_lock = asyncio.Lock()


def _error(status_code: int, code: str, detail: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"code": code, "detail": detail})


def _normalise_mime_type(mime_type: str | None) -> str:
    return (mime_type or "").split(";", 1)[0].strip().lower()


async def _upload_chunks(upload: UploadFile) -> AsyncIterator[bytes]:
    while chunk := await upload.read(CHUNK_BYTES):
        yield chunk


@router.get("/api/audio/capabilities")
async def audio_capabilities():
    stt_configuration = hermes_stt.get_configuration()
    return {
        "available": hermes_stt.is_available(),
        "max_bytes": MAX_AUDIO_BYTES,
        "accepted_mime_types": sorted(MIME_SUFFIXES),
        "stt": {
            "provider": stt_configuration.provider,
            "model": stt_configuration.model,
            "language": stt_configuration.language,
        },
    }


@router.post("/api/audio/transcriptions")
async def create_transcription(audio: UploadFile = File(...)):
    """Transcribe one recording and always remove its server-side temporary file."""

    mime_type = _normalise_mime_type(audio.content_type)
    suffix = MIME_SUFFIXES.get(mime_type)
    if suffix is None:
        await audio.close()
        return _error(415, "audio_unsupported_format", "Unsupported audio recording format")

    try:
        hermes_stt.ensure_available()
    except hermes_stt.HermesSttConfigurationError as exc:
        logger.warning("Hermes STT configuration is unavailable: %s", exc)
        await audio.close()
        return _error(
            503,
            "audio_configuration_unavailable",
            "Hermes voice transcription configuration is unavailable",
        )
    except hermes_stt.HermesSttUnavailable:
        await audio.close()
        return _error(503, "audio_unavailable", "Hermes voice transcription is unavailable")

    if _transcription_lock.locked():
        await audio.close()
        return _error(409, "audio_transcription_busy", "Another recording is being transcribed")

    temporary_path = ""
    try:
        async with _transcription_lock:
            with tempfile.NamedTemporaryFile(
                prefix="hermes-chat-audio-", suffix=suffix, delete=False
            ) as temporary_file:
                temporary_path = temporary_file.name
                total_bytes = 0
                async for chunk in _upload_chunks(audio):
                    total_bytes += len(chunk)
                    if total_bytes > MAX_AUDIO_BYTES:
                        return _error(413, "audio_too_large", "Audio recording is too large")
                    temporary_file.write(chunk)

            if total_bytes == 0:
                return _error(400, "audio_unsupported_format", "Audio recording is empty")

            try:
                transcription = await asyncio.to_thread(hermes_stt.transcribe, temporary_path)
            except hermes_stt.HermesSttConfigurationError as exc:
                logger.warning("Hermes STT configuration became unavailable: %s", exc)
                return _error(
                    503,
                    "audio_configuration_unavailable",
                    "Hermes voice transcription configuration is unavailable",
                )
            except hermes_stt.HermesSttUnavailable:
                return _error(503, "audio_unavailable", "Hermes voice transcription is unavailable")
            except hermes_stt.HermesSttFailed as exc:
                logger.warning("Hermes STT provider failed: %s", exc)
                return _error(422, "audio_transcription_failed", "Hermes could not transcribe the recording")
    finally:
        await audio.close()
        if temporary_path:
            try:
                os.unlink(temporary_path)
            except FileNotFoundError:
                pass

    if not transcription.text:
        return _error(422, "audio_no_speech", "No speech was detected")

    return {"text": transcription.text}
