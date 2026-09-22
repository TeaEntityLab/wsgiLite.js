# Feature Map — wsgiLite.js demo app

One file per feature area. Each answers: what exists, how a user reaches it,
how to drive it, what usually lies. Sweep order for a broad regression pass:
`routing.md` → `csrf-upload.md` → `errors.md`.

- [routing.md](routing.md) — path params, redirects, nested routes, static files
- [csrf-upload.md](csrf-upload.md) — CSRF token issue + protected POSTs
- [errors.md](errors.md) — exception, timeout, terminate

## Maintenance

Each feature file carries `source_commit` + `last_verified_at` +
`verification_status`. After any change to `demo/simple-routing.js` or the
wsgilite version, re-run the affected feature's Drive section and update the
metadata. Do not rewrite the map on a schedule — re-verify on relevant code
change only (event-driven, not calendar-driven).

A `verification_status` of `failed` means the product changed; classify the
failure per VERIFY.md §When a check fails before editing the map.
