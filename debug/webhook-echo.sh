#!/usr/bin/env bash
# Tiny HTTP server that prints every incoming request: method, path, headers,
# query string, and JSON-pretty-printed body. Replies with 200 {"ok": true}.
#
# Use it as the callback URL of an automation while developing M13:
#   ./debug/webhook-echo.sh           # listens on http://127.0.0.1:8787
#   ./debug/webhook-echo.sh 9000      # custom port
#
# Stop with Ctrl-C.

set -euo pipefail

PORT="${1:-8787}"

python3 - "$PORT" <<'PY'
import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse

PORT = int(sys.argv[1])


class EchoHandler(BaseHTTPRequestHandler):
    def _echo(self) -> None:
        parsed = urlparse(self.path)
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""

        print("=" * 72, flush=True)
        print(f"{self.command} {self.path}", flush=True)
        if parsed.query:
            print(f"  query: {parsed.query}", flush=True)
        print("  headers:", flush=True)
        for k, v in self.headers.items():
            print(f"    {k}: {v}", flush=True)
        if raw:
            ct = (self.headers.get("Content-Type") or "").lower()
            if "application/json" in ct:
                try:
                    print("  body:", flush=True)
                    print(
                        json.dumps(json.loads(raw), indent=2, ensure_ascii=False),
                        flush=True,
                    )
                except json.JSONDecodeError:
                    print(f"  body (raw): {raw!r}", flush=True)
            else:
                try:
                    print(f"  body: {raw.decode('utf-8')}", flush=True)
                except UnicodeDecodeError:
                    print(f"  body (bytes): {raw!r}", flush=True)
        print("", flush=True)

        body = b'{"ok": true}\n'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    do_GET = _echo
    do_POST = _echo
    do_PUT = _echo
    do_PATCH = _echo
    do_DELETE = _echo

    def log_message(self, *_args, **_kwargs):  # silence default access log
        return


class ReusableHTTPServer(HTTPServer):
    allow_reuse_address = True


def main() -> None:
    try:
        server = ReusableHTTPServer(("127.0.0.1", PORT), EchoHandler)
    except OSError as exc:
        print(
            f"webhook-echo: cannot bind 127.0.0.1:{PORT} ({exc}).\n"
            f"Free it with:  lsof -ti :{PORT} | xargs kill\n"
            f"Or run on another port:  ./debug/webhook-echo.sh <port>",
            file=sys.stderr,
            flush=True,
        )
        sys.exit(1)
    print(f"webhook-echo listening on http://127.0.0.1:{PORT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopping", flush=True)
        server.server_close()


main()
PY
