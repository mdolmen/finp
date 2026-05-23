"""Outbound HTTP webhook delivery.

Single fire-and-forget POST with a short timeout. Returns the HTTP response
code (if any) and a short body excerpt so the UI can show ``HTTP 200`` /
``HTTP 500`` chips. ``error`` is set only when no HTTP response was received
at all (network/serialization failure).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import httpx

_logger = logging.getLogger(__name__)

_TIMEOUT_SECONDS = 5.0
_BODY_EXCERPT_LIMIT = 200


@dataclass(frozen=True, slots=True)
class PostResult:
    """Outcome of one webhook POST attempt.

    ``status_code`` is set whenever an HTTP response was received (success or
    not). ``error`` is set only for transport-level failures with no response.
    """

    status_code: int | None
    body_excerpt: str | None
    error: str | None

    @property
    def succeeded(self) -> bool:
        return self.error is None and self.status_code is not None and 200 <= self.status_code < 300


def post_webhook(url: str, body: dict[str, Any]) -> PostResult:
    """POST ``body`` as JSON to ``url`` and capture the response."""
    try:
        response = httpx.post(url, json=body, timeout=_TIMEOUT_SECONDS)
    except httpx.HTTPError as exc:
        _logger.warning("automation webhook %s failed: %s", url, exc)
        return PostResult(
            status_code=None,
            body_excerpt=None,
            error=f"{type(exc).__name__}: {exc}",
        )

    excerpt = response.text[:_BODY_EXCERPT_LIMIT] if response.text else None
    return PostResult(
        status_code=response.status_code,
        body_excerpt=excerpt,
        error=None,
    )
