"""Shared types for command modules."""

from __future__ import annotations

import sqlite3
from collections.abc import Callable
from typing import Any, NamedTuple

from pydantic import BaseModel


class EmptyParams(BaseModel):
    """Used for commands that take no arguments."""


CommandHandler = Callable[[sqlite3.Connection, Any], Any]


class Command(NamedTuple):
    """A registered command: an input pydantic model + the handler to run."""

    input_model: type[BaseModel]
    handler: CommandHandler
