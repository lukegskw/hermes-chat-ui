import asyncio
import json

from backend.routers import sessions


class _Response:
    def __init__(self, payload, status=200):
        self.payload = payload
        self.status = status

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def json(self, **_kwargs):
        return self.payload


class _Client:
    def __init__(self, responses):
        self.responses = iter(responses)

    def get(self, *_args, **_kwargs):
        return _Response(*next(self.responses))


def test_reasoning_snapshot_is_limited_to_the_current_turn():
    messages = [
        {"role": "assistant", "reasoning_content": "old reasoning"},
        {"role": "user", "content": "new question"},
        {"role": "assistant", "reasoning_content": "first block"},
        {"role": "tool", "content": "result"},
        {"role": "assistant", "reasoning": "second block"},
    ]

    assert sessions._reasoning_after_boundary(messages, 1) == (
        "first block\n\nsecond block"
    )
    assert "old reasoning" not in sessions._reasoning_after_boundary(messages, 1)


def test_reconciliation_emits_only_changed_non_empty_snapshots():
    async def run():
        client = _Client(
            [
                ({"data": [{"role": "assistant", "reasoning": "old"}]}, 200),
                (
                    {
                        "data": [
                            {"role": "assistant", "reasoning": "old"},
                            {"role": "assistant", "reasoning": "live"},
                        ]
                    },
                    200,
                ),
                (
                    {
                        "data": [
                            {"role": "assistant", "reasoning": "old"},
                            {"role": "assistant", "reasoning": "live"},
                        ]
                    },
                    200,
                ),
            ]
        )
        active = sessions.ActiveSessionStream()

        await sessions._queue_reasoning_snapshot("session-1", active, client, 1)
        assert active.queue.empty()

        await sessions._queue_reasoning_snapshot("session-1", active, client, 1)
        frame = (await active.queue.get()).decode()
        assert frame.startswith("event: reasoning.snapshot\n")
        payload = json.loads(frame.split("data: ", 1)[1])
        assert payload == {"session_id": "session-1", "text": "live"}

        await sessions._queue_reasoning_snapshot("session-1", active, client, 1)
        assert active.queue.empty()

    asyncio.run(run())


def test_reconciliation_failure_does_not_emit_or_raise():
    async def run():
        client = _Client([({"detail": "unavailable"}, 503)])
        active = sessions.ActiveSessionStream()
        await sessions._queue_reasoning_snapshot("session-1", active, client, 0)
        assert active.queue.empty()

    asyncio.run(run())


def test_reconciliation_stops_after_browser_disconnect(monkeypatch):
    async def run():
        monkeypatch.setattr(sessions, "REASONING_INITIAL_DELAY_SECONDS", 0)
        monkeypatch.setattr(sessions, "REASONING_POLL_INTERVAL_SECONDS", 0.01)
        client = _Client(
            [
                (
                    {"data": [{"role": "assistant", "reasoning": "live"}]},
                    200,
                )
            ]
        )
        active = sessions.ActiveSessionStream()
        task = asyncio.create_task(
            sessions._reconcile_reasoning("session-1", active, client, 0)
        )

        await asyncio.wait_for(active.queue.get(), timeout=0.1)
        active.connected = False
        await asyncio.wait_for(task, timeout=0.1)

    asyncio.run(run())


def test_reconciliation_task_is_cancellable(monkeypatch):
    async def run():
        monkeypatch.setattr(sessions, "REASONING_INITIAL_DELAY_SECONDS", 60)
        task = asyncio.create_task(
            sessions._reconcile_reasoning(
                "session-1", sessions.ActiveSessionStream(), _Client([]), 0
            )
        )
        await asyncio.sleep(0)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            return
        raise AssertionError("reasoning reconciliation ignored cancellation")

    asyncio.run(run())
