#!/usr/bin/env python3
"""Check manifest.yml for the mistakes that cost a deploy cycle.

Not a substitute for `forge deploy` (only Atlassian can validate module schemas), but it
catches the class of error that wastes round trips: a module pointing at a function key
that does not exist, an MCP tool naming a missing action, or a handler export the file
does not actually have.

Run: ./validate-manifest.py [path/to/manifest.yml]
Exit: 0 clean · 1 problems found
"""
import re
import sys
from pathlib import Path

import yaml

MANIFEST = Path(sys.argv[1] if len(sys.argv) > 1 else "manifest.yml")
ROOT = MANIFEST.parent


def fail(problems, msg):
    problems.append(msg)


def main():
    problems = []
    doc = yaml.safe_load(MANIFEST.read_text())

    runtime = (doc.get("app") or {}).get("runtime") or {}
    if runtime.get("name") not in {"nodejs22.x", "nodejs24.x"}:
        fail(problems, f"app.runtime.name unsupported/absent: {runtime.get('name')!r}")
    if "REPLACE-ME" in str((doc.get("app") or {}).get("id", "")):
        problems.append("app.id is a placeholder — run `forge register` (expected until P2)")

    modules = doc.get("modules") or {}
    functions = {f["key"]: f["handler"] for f in modules.get("function", [])}
    actions = {a["key"]: a for a in modules.get("action", [])}

    # every module -> function reference resolves
    refs = []
    for key, a in actions.items():
        refs.append((f"action {key}", a.get("function")))
    for t in modules.get("trigger", []):
        refs.append((f"trigger {t.get('key')}", t.get("function")))
    for k, h in functions.items():
        refs.append((f"function {k}", None))
    for origin, fn_key in refs:
        if fn_key and fn_key not in functions:
            fail(problems, f"{origin} points at unknown function {fn_key!r}")

    # handlers: file exists, export exists
    for key, handler in functions.items():
        if "." not in handler:
            fail(problems, f"function {key}: handler {handler!r} is not file.export")
            continue
        rel, export = handler.rsplit(".", 1)
        path = ROOT / f"{rel}.js"
        if not path.exists():
            fail(problems, f"function {key}: missing file {path.relative_to(ROOT)}")
        elif not re.search(rf"export\s+(async\s+)?(function\s+{export}\b|const\s+{export}\s*=)", path.read_text()):
            fail(problems, f"function {key}: {rel}.js does not export {export!r}")

    # MCP tools resolve to declared actions
    for mcp in modules.get("rovo:mcp", []):
        for tool in mcp.get("tools", []):
            if tool not in actions:
                fail(problems, f"rovo:mcp {mcp.get('key')}: tool {tool!r} is not a declared action")

    # scopes are namespaced
    for scope in (doc.get("permissions") or {}).get("scopes", []) or []:
        if not re.match(r"^(read|write|delete|manage|search|admin|search):[a-z0-9:_-]+$", scope):
            fail(problems, f"suspicious scope {scope!r}")

    for p in problems:
        print("✗", p)
    if problems:
        print(f"\n{len(problems)} problem(s)")
        return 1
    print(f"✓ {MANIFEST.name} clean: {len(functions)} functions, {len(actions)} actions")
    return 0


if __name__ == "__main__":
    sys.exit(main())
