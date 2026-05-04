"""Tauri command surface, grouped per resource.

Each module in this package exposes a ``METHODS`` dict mapping JSON-RPC
method names to ``(input_model, handler)`` pairs. ``rpc.py`` merges them
into the top-level dispatcher.
"""
