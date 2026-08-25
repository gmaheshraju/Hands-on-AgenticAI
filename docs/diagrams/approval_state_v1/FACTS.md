# FACTS — 25-agent-executor, ApprovalRequest lifecycle (L2, extracted 2026-08-25)

Source of truth: `projects/25-agent-executor/src/approvals.js`.
**Every state, transition and guard below cites code. The diagram may contain
nothing that is not on this page.**

Altitude: **L2 — legality.** Which transitions exist, what enforces them, which
states are terminal. The executor's tool-call path, risk scoring and the
dashboard are L1 and are deliberately excluded.

Two claims on this page were **verified by execution**, not by reading. Where a
line says `[RAN]`, it was produced by instantiating `ApprovalQueue` and printing
the result; the transcript is reproduced under *Verification* at the bottom.

## States

There is no status enum and no transition table in this file. The set below is
the complete list of strings ever assigned to a record's `.status`, found by
enumerating every `status:` and `.status =` site in the module.

| State | Class | Where assigned |
|---|---|---|
| `pending` | active | `approvals.js:32` — record born, then `pending.set(id, record)` at `approvals.js:38` |
| `auto_approved` | **terminal** | `approvals.js:16` — born decided, pushed straight to `history` at `approvals.js:20` |
| `approved` | **terminal** | `approvals.js:47` |
| `denied` | **terminal** | `approvals.js:62` |
| `expired` | **terminal** | `approvals.js:95` |

`pending` is the only non-terminal state, and the only state a record can be
observed in via `getPending()` (`approvals.js:119-121`).

## Transitions — the complete set

| From | To | Trigger | Where |
|---|---|---|---|
| *(birth)* | `auto_approved` | a rule in `autoApproveRules` matched | `submit()` `approvals.js:13-21` |
| *(birth)* | `pending` | no rule matched | `submit()` `approvals.js:24-39` |
| `pending` | `approved` | `approve(id, approver, notes)` | `approvals.js:42-55`, assignment at `approvals.js:47` |
| `pending` | `denied` | `deny(id, approver, reason)` | `approvals.js:57-70`, assignment at `approvals.js:62` |
| `pending` | `expired` | `checkExpired()` finds `now > expiresAt` | `approvals.js:89-104`, assignment at `approvals.js:95` |
| `pending` | `pending` | `escalate(id)` — **raises escalation level, does not change status** | `approvals.js:72-87` |

The last row is a self-loop on purpose. See *Finding 2*.

## Finding 1 — the guard is the Map, not the status check `[RAN]`

`approve()` and `deny()` each open with two guards:

```js
if (!request) return { error: 'not_found' };                              // approvals.js:44 and :59
if (request.status !== 'pending') return { error: 'already_decided' };    // approvals.js:45 and :60
```

The second guard is **unreachable**. Every decision removes the record from the
`pending` Map before pushing it to `history` — `approvals.js:52`, `approvals.js:67`, `approvals.js:97` — so a second
call to `approve()` finds nothing and returns at the *first* guard. And no record
inside the Map can hold a non-`pending` status: `pending` is the only status ever
written into it (`approvals.js:32`), `auto_approved` records never enter it (`approvals.js:20` pushes
straight to `history`), and `escalate()` never writes `.status` at all.

`[RAN]` a second `approve()` on the same id returns `{"error":"not_found"}` —
not `already_decided`. So does `deny()` after `approve()`, and so does
`escalate()` after `approve()`.

This is not a bug; the request is still correctly rejected. It is a **guard whose
stated reason is not the operative one**. Anyone reading `approvals.js:45` will believe
status is what protects the record. Map membership is.

## Finding 2 — `escalated` is reported, never stored `[RAN]`

`escalate()` at `approvals.js:72-87` increments `escalationLevel` (`approvals.js:76`), sets `escalatedTo`
(`approvals.js:83`) and `escalatedAt` (`approvals.js:84`) — and then returns:

```js
return { status: 'escalated', level: ..., escalatedTo: nextApprover };   // approvals.js:86
```

It never assigns `request.status`. The record remains `pending`.

`[RAN]` after one `escalate()`: the call returns
`{"status":"escalated","level":1,"escalatedTo":"lead"}` while the record reads
`status: "pending", escalationLevel: 1`.

The consequence is at `approvals.js:126`, where `getHistory()` filters on `r.status`:
`getHistory({ status: 'escalated' })` returns **0 records, always** — verified.
`escalated` is a status word that exists in the return channel and nowhere in
the data.

`escalate()` also has no status guard of its own, but it does not need one: it
reads from the `pending` Map (`approvals.js:73`), and a decided record is no longer there.
Finding 1's mechanism is what protects it.

## Terminality — how it is enforced

It is not enforced by a table, as it is in `18-workflow-engine`. It is enforced
by **removal from the Map**: once a record reaches `approved`, `denied` or
`expired` it lives only in the append-only `history` array, and every mutating
method (`approve`, `deny`, `escalate`, `checkExpired`) reaches records through
`this.pending` only. Nothing in the module can write a record's `.status` after
it leaves the Map.

`auto_approved` is terminal for the same reason, more strongly: such a record is
never in the Map at any point.

## Deliberately NOT drawn

- The auto-approve rule matcher `_checkAutoApprove()` (`approvals.js:106-117`) — its three
  filters decide *which birth* happens, and are on the diagram as a card, not as
  states. Its internals are an L1 concern.
- `getPending()` / `getHistory()` read paths, except where Finding 2 depends on
  the `status` filter at `approvals.js:126`.
- The `timeout`/`expiresAt` clock. `checkExpired()` is a polled sweep, not a
  scheduled transition; nothing calls it automatically inside this module.

## Verification

```
$ node probe_approvals.mjs
escalate() RETURNS   : {"status":"escalated","level":1,"escalatedTo":"lead"}
record .status IS    : "pending" | escalationLevel: 1
getHistory({status:"escalated"}) -> 0 records

first approve  : {"status":"approved","id":"approval_..."}
second approve : {"error":"not_found"}   <-- not "already_decided"
deny after appr: {"error":"not_found"}

escalate after approve: {"error":"not_found"}

auto submit    : {"status":"auto_approved","id":"approval_...","rule":"safe_reads"}
pending size   : 0 | history size: 1
```
