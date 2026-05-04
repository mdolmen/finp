import json

import pytest
from pydantic import BaseModel

from finp import errors, rpc
from finp.commands._base import Command


@pytest.fixture
def install_commands(monkeypatch):
    """Inject test commands into the dispatcher table for the duration of a test."""

    class EchoIn(BaseModel):
        text: str

    def echo(_conn, params: EchoIn):
        return {"echoed": params.text}

    def boom_app(_conn, _params):
        raise errors.AppError("test.boom", "kaboom", data={"hint": "x"})

    def boom_unexpected(_conn, _params):
        raise RuntimeError("oops")

    test_methods = dict(rpc.METHODS)
    test_methods["echo"] = Command(EchoIn, echo)
    test_methods["boom_app"] = Command(rpc.EmptyParams, boom_app)
    test_methods["boom_unexpected"] = Command(rpc.EmptyParams, boom_unexpected)
    monkeypatch.setattr(rpc, "METHODS", test_methods)


def _call(conn, method, params=None, req_id=1):
    body = {"jsonrpc": "2.0", "id": req_id, "method": method, "params": params or {}}
    return rpc._handle(conn, json.dumps(body))


def test_ping(conn):
    resp = _call(conn, "ping")
    assert resp["result"]["pong"] is True
    assert "version" in resp["result"]


def test_unknown_method(conn):
    resp = _call(conn, "no.such.method")
    assert resp["error"]["code"] == -32601


def test_malformed_json_returns_parse_error(conn):
    resp = rpc._handle(conn, "{not json")
    assert resp["error"]["code"] == -32700


def test_invalid_params(conn, install_commands):
    resp = _call(conn, "echo", params={"wrong": "key"})
    assert resp["error"]["code"] == -32602
    assert "errors" in resp["error"]["data"]


def test_app_error_propagates_code(conn, install_commands):
    resp = _call(conn, "boom_app")
    assert resp["error"]["code"] == -32000
    assert resp["error"]["message"] == "kaboom"
    assert resp["error"]["data"]["code"] == "test.boom"
    assert resp["error"]["data"]["hint"] == "x"


def test_unexpected_exception_becomes_internal_error(conn, install_commands, capsys):
    resp = _call(conn, "boom_unexpected")
    assert resp["error"]["code"] == -32603
    # traceback printed to stderr, not stdout
    err = capsys.readouterr().err
    assert "RuntimeError" in err


def test_echo_round_trip(conn, install_commands):
    resp = _call(conn, "echo", params={"text": "hi"})
    assert resp["result"] == {"echoed": "hi"}
