# Feature: routing

User goal: reach content through the URL space — params, redirects, nested
paths, static files.

## Preconditions

- Server running (`VERIFY.md` → Launch, Doctor) **from the repo root**.
- No auth required on any route in this file.

## Entry points

| Path | Method | What it proves |
| --- | --- | --- |
| `/` | GET | Root route alive; returns JSON meta |
| `/user/:id` | GET | Path-parameter capture |
| `/heartbeat2` | GET | Internal redirect to `/heartbeat` |
| `/heartbeat3` | GET | Redirect to missing route → 404 |
| `/test/change/for/it` | GET | Three-level nested sub-route |
| `/file/text.txt` | GET | Static file serving from `demo/` |

## Drive

```bash
curl -s http://localhost:3333/user/alice
curl -s http://localhost:3333/heartbeat2
curl -s -o /dev/null -w '%{http_code}' http://localhost:3333/heartbeat3
curl -s http://localhost:3333/test/change/for/it
curl -s http://localhost:3333/file/text.txt
```

## Observable outcomes

- `/user/alice` → JSON containing `"id":"alice"`.
- `/heartbeat2` → body `ok` (same as `/heartbeat`).
- `/heartbeat3` → HTTP 404, body `404 File not found.`
- `/test/change/for/it` → `Here we go`.
- `/file/text.txt` → contents of `demo/text.txt`.

## Failure paths

- Wrong param name in JSON → route captured a different segment.
- `/heartbeat3` returning 200 → redirect target resolution is broken.
- `/file/../package.json` launched from repo root → **serves
  `repo_root/package.json`** — a real traversal quirk of the demo's
  static-file helper, not blocked. Launched from `demo/` it 404s only because
  `demo/demo/` does not exist, not because traversal is prevented.

## Additional quirks (found by source-level verification)

- `redirect()` is internal re-dispatch, not an HTTP 301/302 — it rewrites
  `meta._url_path` and re-enters the pipeline, so middleware runs twice
  (duplicate `Set-Cookie` headers on redirected requests).
- `/file/../<name>` traversal is cwd-dependent: it resolves against
  `<cwd>/demo/../<name>`, so it serves whatever exists at `<cwd>/<name>` —
  `package.json` when launched from the repo root, 404 when the file is absent.

## Evidence

- Response bodies + status codes per route.
- For `/file`, compare served bytes to `demo/text.txt` on disk.
- For the traversal check, record whether the response is the repo-root
  `package.json` (vulnerable) or a 404 (blocked or missing path).
