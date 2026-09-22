# Feature: csrf-upload

`source_commit: 125808d` · `last_verified_at: 2026-09-22` · `verification_status: passed`

User goal: obtain a CSRF token, then submit a protected POST.

## Preconditions

- Server running (`VERIFY.md` → Launch, Doctor).
- CSRF secret is `abcdefg` (demo config, `simple-routing.js`).
- A cookie jar is required — the token cookie is set on the `/csrf` response.

## Entry points

| Path | Method | What it proves |
| --- | --- | --- |
| `/csrf` | GET | Token issue + hidden form input |
| `/upload` | POST | Form-field CSRF check (`CSRF_token` field) |
| `/upload2` | POST | Header `x-csrf-token` + form `CSRF_token` check |

## Drive

```bash
# 1. Get a token — first call sets the cookie, second reads it
curl -s -c /tmp/cj.txt http://localhost:3333/csrf > /dev/null
TOKEN=$(curl -s -b /tmp/cj.txt http://localhost:3333/csrf | awk '{print $1}')

# 2a. Form-field check (field name is CSRF_token, not _csrf)
curl -s -b /tmp/cj.txt -X POST -F "CSRF_token=$TOKEN" -F "file=@demo/text.txt" http://localhost:3333/upload

# 2b. Header + form check (both required)
curl -s -b /tmp/cj.txt -X POST -H "x-csrf-token: $TOKEN" -F "CSRF_token=$TOKEN" http://localhost:3333/upload2
```

## Observable outcomes

- `/csrf` first request → `undefined` (cookie not yet set); second request with
  the cookie jar → a real token + hidden `<input name="CSRF_token">`.
- `/upload` with valid `CSRF_token` field → `CSRF_token ok`.
- `/upload2` with valid `x-csrf-token` header **and** `CSRF_token` form field →
  `x-csrf-token ok`.
- Either POST **without** the token → 403 `CSRF detected.`

## Failure paths

- Token accepted across a server restart → tokens are not bound to the secret.
- POST without token returning `ok` → CSRF check is bypassed (security bug).
- Token from `/csrf` rejected on `/upload` → token issue/validation mismatch.
- `/upload2` succeeding with header only → the form-field half of the check is
  not enforced.

## Evidence

- The cookie jar, the extracted token, the POST result, and the
  negative-control result (same POST without token).

## Additional quirks (found by source-level verification)

- Every request without a `CSRF_token` cookie gets `Set-Cookie:
  CSRF_token=...` globally, on any route — not just `/csrf`.
- `/upload2`'s header check compares `x-csrf-token` against `meta.CSRF_token`,
  so the token must also appear in the form body or query — header alone is
  never sufficient.
