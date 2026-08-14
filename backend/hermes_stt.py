"""Small compatibility boundary around Hermes' bundled speech-to-text path."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
import importlib.util
import os
from pathlib import Path
from typing import Any


_STT_ENVIRONMENT_KEYS = frozenset(
    {
        "VOICE_TOOLS_OPENAI_KEY",
        "OPENAI_API_KEY",
        "STT_OPENAI_BASE_URL",
        "STT_OPENAI_MODEL",
        "GROQ_API_KEY",
        "GROQ_BASE_URL",
        "MISTRAL_API_KEY",
        "XAI_API_KEY",
        "XAI_STT_BASE_URL",
        "ELEVENLABS_API_KEY",
        "ELEVENLABS_STT_BASE_URL",
        "DEEPINFRA_API_KEY",
        "HERMES_LOCAL_STT_COMMAND",
        "HERMES_LOCAL_STT_LANGUAGE",
    }
)


class HermesSttUnavailable(RuntimeError):
    """The installed Hermes image does not expose its voice transcription API."""


class HermesSttConfigurationError(RuntimeError):
    """Hermes STT configuration exists but the UI service cannot load it."""


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
        ensure_available()
    except (HermesSttUnavailable, HermesSttConfigurationError):
        return False
    return True


def _hermes_env_path() -> Path:
    return Path(os.environ.get("HERMES_HOME", "/hermes-config")) / ".env"


def _validate_environment_access() -> None:
    """Validate the config file that Hermes' own STT loader will inspect.

    An absent file is valid when credentials are supplied directly through the
    process environment. An existing but unreadable file is not: Hermes'
    loader probes it before selecting the provider and would otherwise leak a
    raw ``PermissionError`` through the audio endpoint.
    """

    env_path = _hermes_env_path()
    try:
        if not env_path.exists():
            return
        if not env_path.is_file():
            raise HermesSttConfigurationError(
                f"Hermes environment path is not a file: {env_path}"
            )
        with env_path.open("rb"):
            pass
    except HermesSttConfigurationError:
        raise
    except OSError as exc:
        raise HermesSttConfigurationError(
            f"Hermes STT environment is not readable: {env_path}"
        ) from exc


def _read_hermes_environment() -> dict[str, str]:
    try:
        from hermes_cli.config import load_env
    except ImportError:  # Local tests can provide a standalone transcriber.
        return {}

    try:
        values = load_env()
    except OSError as exc:
        raise HermesSttConfigurationError(
            f"Hermes STT environment is not readable: {_hermes_env_path()}"
        ) from exc
    return values if isinstance(values, dict) else {}


def _hydrate_stt_environment() -> None:
    """Expose only STT-relevant `.env` values to Hermes' compatibility code.

    Hermes 0.19's OpenAI audio resolver reads ``os.environ`` directly instead
    of using ``get_env_value``. Loading an allowlist here preserves the same
    Hermes configuration without importing unrelated integration secrets into
    the UI process environment.
    """

    values = _read_hermes_environment()
    for key in _STT_ENVIRONMENT_KEYS:
        value = values.get(key)
        if key not in os.environ and isinstance(value, str) and value.strip():
            os.environ[key] = value.strip()


def _validate_provider_dependencies() -> None:
    provider = get_configuration().provider
    if provider == "local" and importlib.util.find_spec("faster_whisper") is None:
        raise HermesSttUnavailable(
            "Hermes local STT requires the faster-whisper dependency"
        )


def ensure_available() -> Callable[[str], dict[str, Any]]:
    """Raise a typed error unless the Hermes STT runtime can be loaded safely."""

    transcriber = _load_transcriber()
    # Local faster-whisper STT has no credentials. Avoid touching Hermes'
    # environment/auth files for that provider; remote providers still receive
    # only the allowlisted STT values from the shared read-only `.env`.
    if get_configuration().provider != "local":
        _validate_environment_access()
        _hydrate_stt_environment()
    _validate_provider_dependencies()
    return transcriber


def _load_stt_config() -> dict[str, Any]:
    config_path = Path(
        os.environ.get("HERMES_UI_HERMES_CONFIG", "/hermes-config/config.yaml")
    )
    try:
        config_is_readable_file = config_path.is_file()
    except OSError:
        # A read-only bind mount can intentionally be inaccessible to the UI
        # user.  Capabilities must degrade cleanly instead of returning 500.
        config_is_readable_file = False
    if config_is_readable_file:
        try:
            import yaml

            parsed = yaml.safe_load(config_path.read_text()) or {}
            return parsed.get("stt") if isinstance(parsed.get("stt"), dict) else {}
        except Exception:
            # Fall through to the package loader for local development only.
            pass
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
    try:
        result = ensure_available()(path)
    except PermissionError as exc:
        raise HermesSttConfigurationError(
            "Hermes STT could not read its configuration"
        ) from exc
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
