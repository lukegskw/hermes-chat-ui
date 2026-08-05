"""Small compatibility boundary around Hermes' bundled speech-to-text path."""

from __future__ import annotations

import os
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any


class HermesSttUnavailable(RuntimeError):
    """The installed Hermes image does not expose its voice transcription API."""


class HermesSttFailed(RuntimeError):
    """Hermes accepted the recording but could not transcribe it."""


@dataclass(frozen=True)
class Transcription:
    text: str
    provider: str | None = None


@dataclass(frozen=True)
class SttConfiguration:
    provider: str | None = None
    model: str | None = None
    language: str = "auto"


def _load_transcriber() -> Callable[[str], dict[str, Any]]:
    """Load the Hermes API lazily so regular chat works without voice support.

    Verified against the Hermes image pinned in this repository's Dockerfile.
    `transcribe_recording` is also used by Hermes' dashboard and filters known
    silence hallucinations before delegating to the configured STT provider.
    """

    try:
        from tools.voice_mode import transcribe_recording
    except ImportError as exc:  # pragma: no cover - depends on the Hermes image
        raise HermesSttUnavailable("Hermes voice transcription is unavailable") from exc
    return transcribe_recording


def is_available() -> bool:
    try:
        _load_transcriber()
    except HermesSttUnavailable:
        return False
    return True


def _load_stt_config() -> dict[str, Any]:
    try:
        from hermes_cli.config import load_config

        stt_config = load_config().get("stt") or {}
        return stt_config if isinstance(stt_config, dict) else {}
    except Exception:  # pragma: no cover - depends on the Hermes image/config
        return {}


def get_configuration() -> SttConfiguration:
    """Return non-sensitive effective STT choices from Hermes' own config."""
    stt_config = _load_stt_config()
    raw_provider = stt_config.get("provider") or "local"
    provider = str(raw_provider).strip() or "local"
    provider_config = stt_config.get(provider)
    if not isinstance(provider_config, dict):
        provider_config = {}

    raw_model = provider_config.get("model") or stt_config.get("model")
    model = str(raw_model).strip() if raw_model else None

    language_candidates = [provider_config.get("language")]
    if provider == "elevenlabs":
        language_candidates.append(provider_config.get("language_code"))
    language_candidates.extend(
        [stt_config.get("language"), os.getenv("HERMES_LOCAL_STT_LANGUAGE")]
    )
    language = next(
        (
            value.strip()
            for value in language_candidates
            if isinstance(value, str) and value.strip()
        ),
        "auto",
    )
    return SttConfiguration(provider=provider, model=model, language=language)


def transcribe(path: str) -> Transcription:
    result = _load_transcriber()(path)
    if not isinstance(result, dict):
        raise HermesSttFailed("Hermes returned an invalid transcription result")

    if not result.get("success"):
        message = str(result.get("error") or "Hermes transcription failed")
        # Hermes treats silence as a successful empty result in its dashboard,
        # but older versions can return this provider error instead.
        if "empty transcript" in message.lower():
            return Transcription(text="", provider=_optional_string(result.get("provider")))
        raise HermesSttFailed(message)

    return Transcription(
        text=str(result.get("transcript") or "").strip(),
        provider=_optional_string(result.get("provider")),
    )


def _optional_string(value: object) -> str | None:
    return value if isinstance(value, str) and value else None
