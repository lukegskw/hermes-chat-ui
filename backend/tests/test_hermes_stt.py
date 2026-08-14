from backend import hermes_stt


def test_environment_access_reports_permission_failure(monkeypatch, tmp_path):
    env_path = tmp_path / ".env"
    env_path.write_text("OPENAI_API_KEY=secret")
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))

    def denied(*_args, **_kwargs):
        raise PermissionError("denied")

    monkeypatch.setattr(type(env_path), "open", denied)

    try:
        hermes_stt._validate_environment_access()
    except hermes_stt.HermesSttConfigurationError as error:
        assert "not readable" in str(error)
        assert "secret" not in str(error)
    else:
        raise AssertionError("Expected HermesSttConfigurationError")


def test_ensure_available_hydrates_only_stt_environment(monkeypatch):
    transcriber = lambda path: {"success": True, "transcript": path}
    monkeypatch.setattr(hermes_stt, "_load_transcriber", lambda: transcriber)
    monkeypatch.setattr(
        hermes_stt,
        "get_configuration",
        lambda: hermes_stt.SttConfiguration(provider="openai"),
    )
    monkeypatch.setattr(hermes_stt, "_validate_environment_access", lambda: None)
    monkeypatch.setattr(hermes_stt, "_validate_provider_dependencies", lambda: None)
    monkeypatch.setattr(
        hermes_stt,
        "_read_hermes_environment",
        lambda: {
            "VOICE_TOOLS_OPENAI_KEY": " voice-secret ",
            "HA_TOKEN": "must-not-be-imported",
        },
    )
    monkeypatch.delenv("VOICE_TOOLS_OPENAI_KEY", raising=False)
    monkeypatch.delenv("HA_TOKEN", raising=False)

    assert hermes_stt.ensure_available() is transcriber
    assert hermes_stt.os.environ["VOICE_TOOLS_OPENAI_KEY"] == "voice-secret"
    assert "HA_TOKEN" not in hermes_stt.os.environ


def test_local_provider_does_not_read_hermes_environment(monkeypatch):
    transcriber = lambda path: {"success": True, "transcript": path}
    monkeypatch.setattr(hermes_stt, "_load_transcriber", lambda: transcriber)
    monkeypatch.setattr(
        hermes_stt,
        "get_configuration",
        lambda: hermes_stt.SttConfiguration(provider="local", model="small"),
    )
    monkeypatch.setattr(hermes_stt, "_validate_provider_dependencies", lambda: None)

    def unexpected_environment_access():
        raise AssertionError("Local STT must not read Hermes credentials")

    monkeypatch.setattr(
        hermes_stt, "_validate_environment_access", unexpected_environment_access
    )
    monkeypatch.setattr(hermes_stt, "_hydrate_stt_environment", unexpected_environment_access)

    assert hermes_stt.ensure_available() is transcriber


def test_local_provider_requires_faster_whisper(monkeypatch):
    monkeypatch.setattr(
        hermes_stt,
        "get_configuration",
        lambda: hermes_stt.SttConfiguration(provider="local", model="small"),
    )
    monkeypatch.setattr(hermes_stt.importlib.util, "find_spec", lambda _name: None)

    try:
        hermes_stt._validate_provider_dependencies()
    except hermes_stt.HermesSttUnavailable as error:
        assert "faster-whisper" in str(error)
    else:
        raise AssertionError("Expected HermesSttUnavailable")


def test_transcribe_normalises_success(monkeypatch):
    monkeypatch.setattr(hermes_stt, "_validate_provider_dependencies", lambda: None)
    monkeypatch.setattr(
        hermes_stt,
        "_load_transcriber",
        lambda: lambda path: {"success": True, "transcript": "  hello  ", "provider": "local"},
    )

    result = hermes_stt.transcribe("/tmp/recording.webm")

    assert result.text == "hello"
    assert result.provider == "local"


def test_transcribe_treats_empty_transcript_as_silence(monkeypatch):
    monkeypatch.setattr(hermes_stt, "_validate_provider_dependencies", lambda: None)
    monkeypatch.setattr(
        hermes_stt,
        "_load_transcriber",
        lambda: lambda path: {"success": False, "error": "Empty transcript"},
    )

    assert hermes_stt.transcribe("/tmp/recording.webm").text == ""


def test_transcribe_raises_for_provider_error(monkeypatch):
    monkeypatch.setattr(hermes_stt, "_validate_provider_dependencies", lambda: None)
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
