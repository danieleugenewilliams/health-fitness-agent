---
allowed-tools: Bash(sqlite3*, date), mcp__plugin_telegram_telegram__reply
description: 'Parse and log a sleep entry from shorthand format. Usage: /log-sleep <user> <date> <shorthand>'
---

# /log-sleep — Parse and Log Sleep Data

Parse sleep shorthand and insert into the health_tracker sleep_logs table.

Arguments passed: `$ARGUMENTS`

## Parse Arguments

Arguments: `<user> <date> <shorthand>`

- `user`: user1 or user2 → user_id 1 or 2
- `date`: YYYY-MM-DD (the date you woke up — always validate, never assume today)
- `shorthand`: the sleep data string (see formats below)

If date is missing or ambiguous, ask. Do NOT assume.

## Database

- Path: `~/path/to/health_tracker.db`
- Do NOT run PRAGMA queries.

### Schema

**sleep_logs:** id, user_id, date, bedtime, wake_time, total_sleep_minutes, awake_minutes, rem_minutes, core_minutes, deep_minutes, sleep_score, duration_score, phase, hit_target, notes

## Shorthand Format

### Full format (all sleep stages):
```
<bedtime> <wake_time> <total> | <awake>aw <rem>rem <core>core <deep>deep | <score>score | <notes>
```

Example:
```
11:30p 7:30a 8h12m | 18aw 95rem 240core 54deep | 82score | sick kid
```

### Minimal format (no stages):
```
<bedtime> <wake_time> <total> | <score>score
```

Example:
```
12:00a 7:45a 7h45m | 74score
```

### Time parsing

- Bedtime/wake_time: accept 12hr (11:30p, 12:00a, 1:45a) or 24hr (23:30, 00:00, 07:45)
- Store as 24hr TEXT ("23:30", "00:00", "07:45")
- Bedtime crossing midnight (e.g. 11:30p → stored as "23:30"; 12:30a → stored as "00:30")

### Duration parsing

- `8h12m` → 492 minutes
- `7h45m` → 465 minutes
- `8h` → 480 minutes

### Stage parsing (all in minutes)

- `18aw` → awake_minutes = 18
- `95rem` → rem_minutes = 95
- `240core` → core_minutes = 240
- `54deep` → deep_minutes = 54

### Score parsing

- `82score` → sleep_score = 82
- duration_score: derive from wearable duration component if provided separately (e.g. `38/50`), otherwise leave NULL

## Phase Detection

Determine current phase based on the log date and the sleep plan ramp. **Update `PLAN_START_DATE` below to match your plan start date.**

- Phase 1 (Weeks 1-2 from plan start): bed by 12:00am target
- Phase 2 (Weeks 3-4): bed by 11:30pm target
- Phase 3 (Weeks 5-6): bed by 11:00pm target
- Maintenance (Week 7+): bed by 11:00pm target

Phase start date: `PLAN_START_DATE` (e.g. 2026-01-01 — set this to your actual plan start)

Calculate which phase based on how many weeks since start. Set `phase` column accordingly (1, 2, or 3; NULL for maintenance).

## Hit Target Detection

Determine `hit_target` (1 or 0) based on phase:

- Phase 1: bedtime ≤ 00:00 AND total_sleep_minutes ≥ 450 (7.5 hrs)
- Phase 2: bedtime ≤ 23:30 AND total_sleep_minutes ≥ 480 (8 hrs)
- Phase 3: bedtime ≤ 23:00 AND total_sleep_minutes ≥ 510 (8.5 hrs)
- Maintenance: bedtime ≤ 23:00 AND total_sleep_minutes ≥ 480 (8 hrs)

If bedtime is after midnight (00:xx or 01:xx etc.) it is LATER than 00:00, so Phase 1 target is missed.

## Insertion

```sql
INSERT INTO sleep_logs (user_id, date, bedtime, wake_time, total_sleep_minutes,
  awake_minutes, rem_minutes, core_minutes, deep_minutes,
  sleep_score, duration_score, phase, hit_target, notes)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
SELECT last_insert_rowid();
```

## Send Confirmation via Telegram

After logging, send a recap to the user via Telegram:

- Date, bedtime → wake time, total sleep
- Sleep stages if logged (REM / Core / Deep)
- Score
- Phase and whether they hit the target (with the target reminder)
- Notes if any
- Weekly hit rate: query the last 7 days and show X/7 nights on target

**Weekly hit rate query:**
```sql
SELECT COUNT(*) as total, SUM(hit_target) as hits
FROM sleep_logs
WHERE user_id=<USER_ID> AND date >= date('<DATE>', '-6 days') AND date <= '<DATE>';
```

**Telegram chat IDs:**
- User 1: `YOUR_USER1_CHAT_ID`
- User 2: `YOUR_USER2_CHAT_ID`

## Terminal Output

Briefly confirm: "Logged [user]'s sleep for [date] ([total] hrs, phase [N], target [hit/missed])."
