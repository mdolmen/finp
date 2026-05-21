"""Unit tests for the automations domain (M13.1)."""

from __future__ import annotations

from typing import Any

import pytest

from finp import accounts, categories, events, operations
from finp.automations import (
    confirm as confirm_pending,
)
from finp.automations import (
    create,
    enqueue_for_event,
    install_subscriber,
    list_all,
    list_history,
    list_pending,
)
from finp.automations import (
    refuse as refuse_pending,
)
from finp.automations.crud import AutomationNotFoundError, delete, get
from finp.automations.matcher import match
from finp.automations.queue import _build_webhook_body
from finp.predicates import LibelleContains, MontantCompare


@pytest.fixture
def account(conn):
    return accounts.create(conn, "Checking")


@pytest.fixture
def op_groceries(conn, account):
    return operations.insert(
        conn, account_id=account.id, date="2026-05-01", montant_cents=-1234, libelle="GROCERIES"
    )


@pytest.fixture
def op_salary(conn, account):
    return operations.insert(
        conn, account_id=account.id, date="2026-05-02", montant_cents=200000, libelle="SALARY"
    )


@pytest.fixture(autouse=True)
def _reset_bus():
    events.bus.clear()
    yield
    events.bus.clear()


# ---- crud ----------------------------------------------------------------


def test_create_rejects_unsupported_event_type(conn):
    with pytest.raises(ValueError, match="unsupported event_type"):
        create(
            conn,
            name="x",
            event_type="not.a.thing",
            predicate=LibelleContains(text="x"),
            callback_url="http://example.test/hook",
        )


def test_create_then_get_then_delete(conn):
    a = create(
        conn,
        name="n8n groceries",
        event_type="operation.created",
        predicate=LibelleContains(text="GROC"),
        callback_url="http://example.test/hook",
    )
    assert get(conn, a.id).name == "n8n groceries"
    delete(conn, a.id)
    with pytest.raises(AutomationNotFoundError):
        get(conn, a.id)


# ---- matcher -------------------------------------------------------------


def test_match_returns_empty_when_payload_has_no_operation(conn):
    create(
        conn,
        name="any",
        event_type="operation.created",
        predicate=LibelleContains(text="x"),
        callback_url="http://example.test/hook",
    )
    assert match(conn, "operation.created", {}) == []


def test_match_filters_by_event_type_and_predicate(conn, op_groceries, op_salary):
    a_groc = create(
        conn,
        name="groceries",
        event_type="operation.created",
        predicate=LibelleContains(text="GROC"),
        callback_url="http://example.test/hook",
    )
    create(
        conn,
        name="big amounts",
        event_type="operation.updated",  # wrong event type
        predicate=MontantCompare(operator=">", value_cents=1000),
        callback_url="http://example.test/hook",
    )
    create(
        conn,
        name="disabled",
        event_type="operation.created",
        predicate=LibelleContains(text="GROC"),
        callback_url="http://example.test/hook",
        enabled=False,
    )

    matched = match(conn, "operation.created", {"id": op_groceries.id})
    assert [m.id for m in matched] == [a_groc.id]


# ---- queue ---------------------------------------------------------------


def test_enqueue_dedups_while_pending(conn, op_groceries):
    a = create(
        conn,
        name="groceries",
        event_type="operation.created",
        predicate=LibelleContains(text="GROC"),
        callback_url="http://example.test/hook",
    )

    first = enqueue_for_event(conn, "operation.created", {"id": op_groceries.id})
    again = enqueue_for_event(conn, "operation.created", {"id": op_groceries.id})

    assert len(first) == 1
    assert again == []  # dedup index
    pending = list_pending(conn)
    assert len(pending) == 1
    assert pending[0].automation_id == a.id


def test_confirm_sends_webhook_and_flips_status(conn, op_groceries, monkeypatch):
    create(
        conn,
        name="groceries",
        event_type="operation.created",
        predicate=LibelleContains(text="GROC"),
        callback_url="http://example.test/hook",
    )
    enqueue_for_event(conn, "operation.created", {"id": op_groceries.id})
    pending = list_pending(conn)[0]

    seen: dict[str, Any] = {}

    def fake_post(url: str, body: dict[str, Any]) -> str | None:
        seen["url"] = url
        seen["body"] = body
        return None

    monkeypatch.setattr("finp.automations.queue.post_webhook", fake_post)

    resolved = confirm_pending(conn, pending.id)
    assert resolved.status == "sent"
    assert resolved.error is None
    assert resolved.resolved_at is not None
    assert seen["url"] == "http://example.test/hook"
    assert seen["body"]["event"]["payload"] == {"id": op_groceries.id}
    assert seen["body"]["automation"]["name"] == "groceries"

    assert list_pending(conn) == []
    history = list_history(conn)
    assert [h.id for h in history] == [pending.id]


def test_confirm_captures_failure(conn, op_groceries, monkeypatch):
    create(
        conn,
        name="groceries",
        event_type="operation.created",
        predicate=LibelleContains(text="GROC"),
        callback_url="http://example.test/hook",
    )
    enqueue_for_event(conn, "operation.created", {"id": op_groceries.id})
    pending = list_pending(conn)[0]

    monkeypatch.setattr(
        "finp.automations.queue.post_webhook",
        lambda url, body: "HTTP 500: boom",
    )

    resolved = confirm_pending(conn, pending.id)
    assert resolved.status == "failed"
    assert resolved.error == "HTTP 500: boom"


def test_refuse_flips_status_to_refused(conn, op_groceries):
    create(
        conn,
        name="groceries",
        event_type="operation.created",
        predicate=LibelleContains(text="GROC"),
        callback_url="http://example.test/hook",
    )
    enqueue_for_event(conn, "operation.created", {"id": op_groceries.id})
    pending = list_pending(conn)[0]

    refused = refuse_pending(conn, pending.id)
    assert refused.status == "refused"
    assert list_pending(conn) == []
    assert [h.id for h in list_history(conn, status="refused")] == [pending.id]


def test_history_respects_status_filter_and_limit(conn, account, monkeypatch):
    """Build a mix of sent/failed/refused rows and assert filter + limit."""
    a = create(
        conn,
        name="all",
        event_type="operation.created",
        predicate=LibelleContains(text=""),
        callback_url="http://example.test/hook",
    )

    # Insert a bunch of pending rows on distinct ops, then resolve each.
    op_ids: list[int] = []
    for i in range(5):
        op = operations.insert(
            conn,
            account_id=account.id,
            date=f"2026-05-{i + 1:02d}",
            montant_cents=-(i + 1) * 100,
            libelle=f"OP {i}",
        )
        assert op is not None
        op_ids.append(op.id)
        enqueue_for_event(conn, "operation.created", {"id": op.id})

    pending_ids = [p.id for p in list_pending(conn)]
    assert len(pending_ids) == 5

    # 2 refused, 2 sent, 1 failed.
    monkeypatch.setattr("finp.automations.queue.post_webhook", lambda u, b: None)
    refuse_pending(conn, pending_ids[0])
    refuse_pending(conn, pending_ids[1])
    confirm_pending(conn, pending_ids[2])
    confirm_pending(conn, pending_ids[3])
    monkeypatch.setattr("finp.automations.queue.post_webhook", lambda u, b: "HTTP 500: x")
    confirm_pending(conn, pending_ids[4])

    assert len(list_history(conn, status="all")) == 5
    assert len(list_history(conn, status="sent")) == 2
    assert len(list_history(conn, status="refused")) == 2
    assert len(list_history(conn, status="failed")) == 1
    assert len(list_history(conn, status="all", limit=3)) == 3

    # Sanity: the automation id is still threaded through.
    assert all(item.automation_id == a.id for item in list_history(conn))


# ---- subscriber + event bus ---------------------------------------------


def test_subscriber_enqueues_on_operation_created(conn):
    install_subscriber(conn)
    create(
        conn,
        name="groceries",
        event_type="operation.created",
        predicate=LibelleContains(text="GROC"),
        callback_url="http://example.test/hook",
    )

    acc = accounts.create(conn, "Other")
    operations.insert(
        conn, account_id=acc.id, date="2026-05-03", montant_cents=-50, libelle="GROCERIES"
    )

    pending = list_pending(conn)
    assert len(pending) == 1
    assert pending[0].operation_id is not None


def test_subscriber_swallows_handler_errors(conn, monkeypatch):
    """A misbehaving subscriber must not break unrelated event consumers."""
    install_subscriber(conn)

    def boom(*_a, **_kw) -> list[int]:
        raise RuntimeError("nope")

    monkeypatch.setattr("finp.automations.subscriber.enqueue_for_event", boom)

    acc = accounts.create(conn, "Other")
    op = operations.insert(
        conn, account_id=acc.id, date="2026-05-04", montant_cents=-50, libelle="X"
    )
    # If the handler raised through the bus, this would not be reached.
    assert op is not None


def test_webhook_body_shape(conn, op_groceries):
    """Document the JSON contract sent to n8n."""
    create(
        conn,
        name="groceries",
        event_type="operation.created",
        predicate=LibelleContains(text="GROC"),
        callback_url="http://example.test/hook",
    )
    enqueue_for_event(conn, "operation.created", {"id": op_groceries.id})
    item = list_pending(conn)[0]

    body = _build_webhook_body(item)
    assert set(body.keys()) == {"automation", "event", "pending_id", "confirmed_at"}
    assert body["automation"] == {"id": item.automation_id, "name": "groceries"}
    assert body["event"]["type"] == "operation.created"
    assert body["event"]["payload"] == {"id": op_groceries.id}
    assert body["pending_id"] == item.id


def test_list_all_returns_alphabetical(conn):
    create(
        conn,
        name="zeta",
        event_type="operation.created",
        predicate=LibelleContains(text="x"),
        callback_url="http://example.test/h",
    )
    create(
        conn,
        name="alpha",
        event_type="operation.created",
        predicate=LibelleContains(text="x"),
        callback_url="http://example.test/h",
    )
    assert [a.name for a in list_all(conn)] == ["alpha", "zeta"]


# Categories fixture is unused but ensures the DB schema is consistent.
def test_smoke_categories_exist(conn):
    assert categories.list_all(conn)
