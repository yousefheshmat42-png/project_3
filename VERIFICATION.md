# Verification

Checked on 2026-10-17 with Node.js v24.18.0 on Windows.

| Project | Integration tests | Demo workflow |
|---|---:|---|
| Task Manager API | 6 passed | Passed |
| Store Orders API | 7 passed | Passed |
| Appointment Booking API | 6 passed | Passed |

All 19 tests execute the actual application/router code and real in-memory SQLite databases through an in-process request/response adapter. Coverage includes registration, password hashing, login/logout, expired sessions, malformed JSON, private record access, task CRUD, order totals, multi-item transaction rollback, competing checkout attempts, provider slot overlaps, competing booking attempts and cancellation.

Each demo was also executed successfully. The store demo returned 409 for insufficient stock, and the booking demo returned 409 for a duplicate booking before releasing the slot on cancellation.

HTTP client connections to localhost were blocked by this execution environment (EACCES). Consequently, these results do not claim end-to-end socket verification or deployment verification. Real HTTP test mode and demo mode are included; see each project's README for instructions to run them locally.

The concurrency checks submit competing requests within one application process. They do not constitute distributed or multi-process load testing. Authentication has no rate limiting, and these examples are intended for local student portfolio demonstrations.

No external npm dependencies are required. No frontend, payment integration, email delivery, cloud infrastructure or live deployment is included.
