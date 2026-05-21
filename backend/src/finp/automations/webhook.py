"""Outbound HTTP webhook delivery.

Single fire-and-forget POST with a short timeout. Any non-2xx, network, or
serialization error is captured as a short string returned to the caller.
``None`` means success.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

_logger = logging.getLogger(__name__)

_TIMEOUT_SECONDS = 5.0


def post_webhook(url: str, body: dict[str, Any]) -> str | None:
    """POST ``body`` as JSON to ``url``. Returns ``None`` on success, an error string otherwise."""
    try:
        response = httpx.post(url, json=body, timeout=_TIMEOUT_SECONDS)
    except httpx.HTTPError as exc:
        _logger.warning("automation webhook %s failed: %s", url, exc)
        return f"{type(exc).__name__}: {exc}"

    if response.is_success:
        return None
    return f"HTTP {response.status_code}: {response.text[:200]}"
