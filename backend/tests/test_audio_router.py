import os
import logging

from fastapi.testclient import TestClient

from backend import hermes_stt
from backend.main import app
from backend.routers import audio as audio_router


def test_transcription_returns_text_and_removes_temporary_file(monkeypatch):
    observed_paths: list[str] = []
    monkeypatch.setattr(audio_router.hermes_stt, "ensure_available", lambda: None)

    def fake_transcribe(path: str):
        observed_paths.append(path)
        assert os.path.exists(path)
        return hermes_stt.Transcription(text="hello Hermes")

    monkeypatch.setattr(audio_router.hermes_stt, "transcribe", fake_transcribe)

    with TestClient(app) as client:
        response = client.post(
            "/api/audio/transcriptions",
            files={"audio": ("recording.webm", b"audio", "audio/webm")},
        )

    assert response.status_code == 200
    assert response.json() == {"text": "hello Hermes"}
    assert observed_paths
    assert not os.path.exists(observed_paths[0])


def test_transcription_rejects_large_upload_while_streaming(monkeypatch):
    monkeypatch.setattr(audio_router.hermes_stt, "ensure_available", lambda: None)
    monkeypatch.setattr(audio_router, "MAX_AUDIO_BYTES", 3)

    with TestClient(app) as client:
        response = client.post(
            "/api/audio/transcriptions",
            files={"audio": ("recording.webm", b"four", "audio/webm")},
        )

    assert response.status_code == 413
    assert response.json()["code"] == "audio_too_large"


def test_transcription_rejects_unsupported_format():
    with TestClient(app) as client:
        response = client.post(
            "/api/audio/transcriptions",
            files={"audio": ("recording.txt", b"not audio", "text/plain")},
        )

    assert response.status_code == 415
    assert response.json()["code"] == "audio_unsupported_format"


def test_transcription_reports_inaccessible_hermes_configuration(monkeypatch):
    def unavailable():
        raise hermes_stt.HermesSttConfigurationError("/hermes-config/.env")

    monkeypatch.setattr(audio_router.hermes_stt, "ensure_available", unavailable)

    with TestClient(app) as client:
        response = client.post(
            "/api/audio/transcriptions",
            files={"audio": ("recording.webm", b"audio", "audio/webm")},
        )

    assert response.status_code == 503
    assert response.json() == {
        "code": "audio_configuration_unavailable",
        "detail": "Hermes voice transcription configuration is unavailable",
    }
    assert "/hermes-config" not in response.text


def test_transcription_logs_provider_failure_without_exposing_it_to_client(
    monkeypatch, caplog
):
    monkeypatch.setattr(audio_router.hermes_stt, "ensure_available", lambda: None)

    def failed(_path: str):
        raise hermes_stt.HermesSttFailed("No STT provider available")

    monkeypatch.setattr(audio_router.hermes_stt, "transcribe", failed)

    with caplog.at_level(logging.WARNING, logger="backend.routers.audio"):
        with TestClient(app) as client:
            response = client.post(
                "/api/audio/transcriptions",
                files={"audio": ("recording.webm", b"audio", "audio/webm")},
            )

    assert response.status_code == 422
    assert response.json()["code"] == "audio_transcription_failed"
    assert "No STT provider available" in caplog.text
    assert "No STT provider available" not in response.text


def test_audio_capabilities_degrade_when_hermes_voice_is_missing(monkeypatch):
    monkeypatch.setattr(audio_router.hermes_stt, "is_available", lambda: False)
    monkeypatch.setattr(
        audio_router.hermes_stt,
        "get_configuration",
        lambda: hermes_stt.SttConfiguration(
            provider="openai", model="gpt-4o-transcribe", language="auto"
        ),
    )

    with TestClient(app) as client:
        response = client.get("/api/audio/capabilities")

    assert response.status_code == 200
    assert response.json()["available"] is False
    assert response.json()["stt"] == {
        "provider": "openai",
        "model": "gpt-4o-transcribe",
        "language": "auto",
    }
