"""Thin httpx wrapper for the GoCardless Bank Account Data API.

All methods raise ``httpx.HTTPStatusError`` on non-2xx responses.
Callers are responsible for ensuring credentials and tokens are valid
before calling (see ``auth.access_token_or_refresh``).
"""

from __future__ import annotations

import logging

import httpx

log = logging.getLogger(__name__)

BASE_URL = "https://bankaccountdata.gocardless.com/api/v2"


def _bearer(access_token: str) -> httpx.Client:
    return httpx.Client(
        base_url=BASE_URL,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
        },
        timeout=30,
    )


def new_token(secret_id: str, secret_key: str) -> dict:
    """Exchange secret_id/secret_key for an access + refresh token pair."""
    with httpx.Client(base_url=BASE_URL, timeout=15) as c:
        r = c.post(
            "/token/new/",
            json={"secret_id": secret_id, "secret_key": secret_key},
            headers={"Accept": "application/json"},
        )
        r.raise_for_status()
        return r.json()


def refresh_token(refresh: str) -> dict:
    """Use the long-lived refresh token to obtain a new access token."""
    with httpx.Client(base_url=BASE_URL, timeout=15) as c:
        r = c.post(
            "/token/refresh/",
            json={"refresh": refresh},
            headers={"Accept": "application/json"},
        )
        r.raise_for_status()
        return r.json()


def list_institutions(access_token: str, country: str = "fr") -> list[dict]:
    """Return institutions (banks) available for the given ISO country code."""
    with _bearer(access_token) as c:
        r = c.get("/institutions/", params={"country": country})
        r.raise_for_status()
        return r.json()


def create_requisition(
    access_token: str,
    *,
    institution_id: str,
    redirect: str,
    reference: str,
    user_language: str = "FR",
) -> dict:
    """Create a requisition (per-bank linking ticket). Returns {id, link, status, ...}."""
    with _bearer(access_token) as c:
        r = c.post(
            "/requisitions/",
            json={
                "institution_id": institution_id,
                "redirect": redirect,
                "reference": reference,
                "user_language": user_language,
            },
        )
        r.raise_for_status()
        return r.json()


def get_requisition(access_token: str, requisition_id: str) -> dict:
    """Return the requisition. Once linked, ``accounts`` is a list of account UUIDs."""
    with _bearer(access_token) as c:
        r = c.get(f"/requisitions/{requisition_id}/")
        r.raise_for_status()
        return r.json()


def get_account_details(access_token: str, account_id: str) -> dict:
    """Return the bank-reported account metadata (iban, owner name, ...)."""
    with _bearer(access_token) as c:
        r = c.get(f"/accounts/{account_id}/")
        r.raise_for_status()
        return r.json()


def list_transactions(
    access_token: str,
    account_id: str,
    *,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict:
    """Return all transactions for *account_id* in the date window.

    GoCardless returns the full window in one shot (Berlin Group shape) — no
    pagination. Response: ``{"transactions": {"booked": [...], "pending": [...]}}``.
    """
    params: dict[str, str] = {}
    if date_from:
        params["date_from"] = date_from
    if date_to:
        params["date_to"] = date_to
    log.debug(
        "list_transactions: account_id=%r date_from=%r date_to=%r",
        account_id,
        date_from,
        date_to,
    )
    with _bearer(access_token) as c:
        r = c.get(f"/accounts/{account_id}/transactions/", params=params)
        if not r.is_success:
            log.error("list_transactions %d: %s", r.status_code, r.text[:500])
            r.raise_for_status()
        return r.json()
