# Feature: errors

User goal: see failures surface correctly — exceptions, timeouts, shutdown.

## Preconditions

- Server running (`VERIFY.md` → Launch, Doctor).
- `/timeout` needs outbound network; on cert mismatch or offline it fails fast
  (~1s, 500), it does not hang for 5s.

## Entry points

| Path | Method | What it proves |
| --- | --- | --- |
| `/exception` | GET | Handler exception → 500 with message |
| `/timeout` | GET | Route-level timeout or upstream fetch failure |
| `/terminate` | GET | Clean server shutdown |

## Drive

```bash
curl -s -o /dev/null -w '%{http_code}' http://localhost:3333/exception
time curl -s http://localhost:3333/timeout   # ~1s cert error, or ~5s timeout
curl -s http://localhost:3333/terminate    # run LAST — kills the server
```

## Observable outcomes

- `/exception` → HTTP 500, body contains `There's an exception`.
- `/timeout` → either a ~5s route timeout (network reachable but slow) or a
  fast 500 `FetchError` on cert/hostname mismatch — both are valid; a hang
  past ~6s is not.
- `/terminate` → response `terminate`, then the port stops accepting.

## Failure paths

- `/exception` returning 200 → exception middleware is broken.
- `/timeout` hanging past ~6s → route timeout not enforced.
- `/terminate` returning but port still serving → shutdown is incomplete.

## Evidence

- Status codes, elapsed time for `/timeout`, post-terminate connection refusal.
