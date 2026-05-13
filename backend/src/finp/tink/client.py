"""Thin httpx wrapper for the Tink API.

All methods raise ``httpx.HTTPStatusError`` on non-2xx responses.
Callers are responsible for ensuring credentials and tokens are valid
before calling (see ``auth.refresh_token_if_needed``).
"""

from __future__ import annotations

import httpx

BASE_URL = "https://api.tink.com"


def _client(access_token: str) -> httpx.Client:
    return httpx.Client(
        base_url=BASE_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=15,
    )


def exchange_code(client_id: str, client_secret: str, code: str, redirect_uri: str) -> dict:
    """Exchange an authorization code for access + refresh tokens."""
    with httpx.Client(base_url=BASE_URL, timeout=15) as c:
        r = c.post(
            "/api/v1/oauth/token",
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
            },
        )
        r.raise_for_status()
        return r.json()


def refresh_token(client_id: str, client_secret: str, refresh_tok: str) -> dict:
    """Obtain a new access token using the refresh token."""
    with httpx.Client(base_url=BASE_URL, timeout=15) as c:
        r = c.post(
            "/api/v1/oauth/token",
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "grant_type": "refresh_token",
                "refresh_token": refresh_tok,
            },
        )
        r.raise_for_status()
        return r.json()


def list_accounts(access_token: str) -> list[dict]:
    """Return all accounts visible to the authenticated user."""
    with _client(access_token) as c:
        r = c.get("/data/v2/accounts")
        r.raise_for_status()
        return r.json().get("accounts", [])


def list_transactions(access_token: str, account_id: str, *, page_token: str | None = None) -> dict:
    """Return one page of transactions for *account_id*.

    Returns the raw Tink response dict (``transactions`` list + optional
    ``nextPageToken``).
    """
    params: dict = {"accountIdIn": account_id, "pageSize": 200, "status": "BOOKED"}
    if page_token:
        params["pageToken"] = page_token
    with _client(access_token) as c:
        r = c.get("/data/v2/transactions", params=params)
        r.raise_for_status()
        return r.json()
