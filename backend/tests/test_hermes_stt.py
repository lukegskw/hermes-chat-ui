from backend import hermes_stt


def test_transcribe_normalises_success(monkeypatch):
    monkeypatch.setattr(
        hermes_stt,
        "_load_transcriber",
        lambda: lambda path: {"success": True, "transcript": "  hello  ", "provider": "local"},
    )

    result = hermes_stt.transcribe("/tmp/recording.webm")

    assert result.text == "hello"
    assert result.provider == "local"


def test_transcribe_treats_empty_transcript_as_silence(monkeypatch):
    monkeypatch.setattr(
        hermes_stt,
        "_load_transcriber",
        lambda: lambda path: {"success": False, "error": "Empty transcript"},
    )

    assert hermes_stt.transcribe("/tmp/recording.webm").text == ""


def test_transcribe_raises_for_provider_error(monkeypatch):
    monkeypatch.setattr(
        hermes_stt,
        "_load_transcriber",
        lambda: lambda path: {"success": False, "error": "Provider offline"},
    )

    try:
        hermes_stt.transcribe("/tmp/recording.webm")
    except hermes_stt.HermesSttFailed as error:
        assert str(error) == "Provider offline"
    else:  # pragma: no cover - makes the expected failure explicit
        raise AssertionError("Expected HermesSttFailed")


def test_stt_configuration_uses_provider_model_and_auto_language(monkeypatch):
    monkeypatch.setattr(
        hermes_stt,
        "_load_stt_config",
        lambda: {
            "provider": "openai",
            "language": "",
            "openai": {"model": "gpt-4o-transcribe", "api_key": "secret"},
        },
    )
    monkeypatch.delenv("HERMES_LOCAL_STT_LANGUAGE", raising=False)

    configuration = hermes_stt.get_configuration()

    assert configuration == hermes_stt.SttConfiguration(
        provider="openai", model="gpt-4o-transcribe", language="auto"
    )
    assert "secret" not in repr(configuration)


def test_stt_configuration_reports_effective_global_language(monkeypatch):
    monkeypatch.setattr(
        hermes_stt,
        "_load_stt_config",
        lambda: {"provider": "local", "language": "en", "local": {"language": ""}},
    )
    monkeypatch.setenv("HERMES_LOCAL_STT_LANGUAGE", "pt")

    assert hermes_stt.get_configuration().language == "en"
