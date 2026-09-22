# VERIFY — wsgiLite.js demo app

How an agent launches, checks, drives, and cleans up the demo server. Read this
plus the relevant `features/*.md` file before touching the app.

## Launch

```bash
cd <repo root>
NODE_PATH=demo/node_modules node demo/simple-routing.js
```

**Launch from the repo root, not `demo/`.** The app resolves `demo/` relative to
`process.cwd()`; launching inside `demo/` makes it look for `demo/demo/` and
`/file`, `/template` 404.

Cluster mode: 1 master + N workers (N = CPU count). First log lines are
`Master <pid> is running` then `worker <pid> forked` / `Worker <pid> started`.
The server is ready when `curl -s http://localhost:3333/heartbeat` returns `ok`.

To run in background:
`NODE_PATH=demo/node_modules nohup node demo/simple-routing.js > /tmp/wsgilite-demo.log 2>&1 &`

## Doctor

- `curl -s http://localhost:3333/heartbeat` → `ok` means a worker is serving.
- `curl -s http://localhost:3333/` → JSON meta object means routing works.
- If the port is already bound, the master fails with `EADDRINUSE` — check
  `lsof -i :3333` before assuming the app is broken.
- `node_modules` must exist inside `demo/` (it is a separate npm package).
  If missing: `cd demo && npm install`.

## Drive

All routes are GET unless noted. Base URL: `http://localhost:3333`.

| Route | Expected |
| --- | --- |
| `/` | JSON meta object (`_url_path`, `msg`, `msg2`, `msg3`) |
| `/heartbeat` | `ok` |
| `/heartbeat2` | `ok` (redirect to `/heartbeat`) |
| `/heartbeat3` | 404, body `404 File not found.` (redirect to missing route) |
| `/user/:id` | JSON meta including `"id":"<the-id>"` |
| `/file/<path>` | serves `demo/<path>`; e.g. `/file/text.txt` returns its contents |
| `/csrf` | CSRF token + hidden form input — **needs a cookie jar; first request returns `undefined`** |
| `POST /upload` | `CSRF_token ok` — requires form field `CSRF_token` (not `_csrf`) |
| `POST /upload2` | `x-csrf-token ok` — requires `x-csrf-token` header **and** `CSRF_token` form field |
| `/test/change/for/it` | `Here we go` (nested sub-route) |
| `/template` | rendered HTML (blueimp template) |
| `/exception` | 500 with `Error: There's an exception` |
| `/timeout` | route-level 5s timeout; fetches a remote video — **needs network; may fail fast on cert error** |
| `/terminate` | ends the response then terminates the whole server |

## Evidence

- Save response bodies to files under a scratch dir (e.g. `/tmp/wsgilite-evidence/`).
- For JSON routes, record the parsed fields you asserted on, not just the raw body.
- For `/csrf` + `/upload`, record the cookie jar, the token you extracted, and
  the POST result.

## Cleanup

- `curl -s http://localhost:3333/terminate` stops the server cleanly.
- Or `kill <master-pid>` — workers exit with the master.
- Remove only files you created (evidence dir, logs). Do not touch `demo/`,
  `node_modules/`, or the repo.

## Known pitfalls

- **Launch directory matters.** From `demo/`, `/file` and `/template` 404.
  From repo root, `/file/../package.json` serves `repo_root/package.json` —
  a real path-traversal quirk of the demo's static-file helper.
- `/csrf` needs a cookie jar (`curl -c/-b`); the first request returns
  `undefined` because the token cookie is set on that same response.
- `/timeout` fetches an external video; offline or on cert mismatch it fails
  fast (~1s, 500), not a 5s hang.
- `/terminate` kills the server; run it last or restart after.
- Cluster mode means PID in logs is a worker, not the master; kill the master.
