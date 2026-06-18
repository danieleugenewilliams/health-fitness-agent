---
allowed-tools: Bash(sqlite3*), mcp__plugin_telegram_telegram__reply
description: 'Parse and log a workout from shorthand format. Usage: /log-workout <user> <date> <template_id> <raw workout text>'
---

# /log-workout — Parse and Log Workout Data

Parse shorthand workout data and insert into the health_tracker database.

Arguments passed: `$ARGUMENTS`

## Parse Arguments

Arguments are pipe-delimited: `<user>|<date>|<template_id>|<raw_text>`

- `user`: user1 or user2 -> user_id 1 or 2
- `date`: YYYY-MM-DD (ALWAYS validate -- never assume today)
- `template_id`: the workout template ID
- `raw_text`: the raw workout shorthand from the user

If arguments are missing or unclear, ask the user to clarify. Do NOT assume dates.

## Database

- Path: `~/path/to/health_tracker.db`
- Do NOT run PRAGMA queries.

### Schema (baked in)

**workout_logs:** id, user_id, template_id, date, start_time, end_time, duration_minutes, overall_difficulty, overall_notes, completed
**exercise_logs:** id, workout_log_id, template_exercise_id, exercise_name, superset_group, superset_order, sort_order, notes
**set_logs:** id, exercise_log_id, set_number, target_reps, target_weight, actual_reps, actual_weight, weight_unit, rpe, completed, notes
**cardio_logs:** id, user_id, workout_log_id, date, activity_type, duration_minutes, duration_seconds, distance, distance_unit, speed, speed_unit, avg_heart_rate, max_heart_rate, target_hr_min, target_hr_max, incline, notes

### Template exercise lookup

Before parsing, get the template exercises to match labels to exercise names:

```sql
SELECT superset_group, superset_order, exercise_name, target_sets, target_reps,
       target_weight, weight_unit, weight_note, rest_seconds, sort_order
FROM template_exercises WHERE template_id=<TEMPLATE_ID>
ORDER BY sort_order;
```

## Shorthand Format

Users log in this format (one line per exercise, optional cardio line at end):

```
<label> <weight># <reps>/<reps>/... <notes>
```

User 2's format starts from a pre-filled template (label + weight + first set rep count). They add remaining set reps with `/`, then optional notes after. Examples:

```
A1 105# 10/10/10/10 doable; try 110#
A2 17.5# 8/8/8/8 hard from start
B1 75# 10/10/10 didn't need hooks
C1 32.5# 12/12/12 hard
4mph 28:47 2m 148HR
```

User 1 may send in a different format (full exercise names, "3x12 @ 20 lb" style). Handle both.

### Exercise lines

| Component | Pattern | Examples |
|-----------|---------|----------|
| Label | A1, A2, B1, B2, C, C1, C2 | `A1`, `B2`, `C` |
| Weight | number + `#` or `lb` | `105#`, `20#`, `bw` (bodyweight) |
| Reps | slash-separated | `10/10/10/10`, `8/8/8/8` |
| Time (for planks/holds) | number + `sec` or just numbers for holds | `75/75/75` (seconds) |
| Notes | everything after reps | `doable; try 110#`, `hard from start` |

### Label-to-exercise mapping

Match labels to template exercises:
- `A1` = superset_group='A', superset_order=1
- `A2` = superset_group='A', superset_order=2
- `B1` = superset_group='B', superset_order=1
- `B2` = superset_group='B', superset_order=2
- `C` or `C1` = superset_group='C', superset_order=1
- `C2` = superset_group='C', superset_order=2
- Unlabeled standalone = match by sort_order (exercises with empty superset_group)

### Cardio line

Cardio is typically the last line with a different format:
```
<speed>mph [<elevation>e] <duration> <distance>m <hr>HR
```

Examples:
- `2.9mph 5.4e 14:02 0.69m 140HR` -> 2.9 mph, 5.4% incline, 14 min 2 sec, 0.69 miles, 140 avg HR
- `4mph 26:44 1.8m 153HR` -> 4 mph, 26 min 44 sec, 1.8 miles, 153 avg HR
- `4.1mph .5e 28:47 2m 148HR` -> 4.1 mph, 0.5% incline, 28 min 47 sec, 2 miles, 148 avg HR

## Insertion Steps

### 1. Insert workout_log

```sql
INSERT INTO workout_logs (user_id, template_id, date, overall_notes, completed)
VALUES (<user_id>, <template_id>, '<date>', '<summary_notes>', 1);
SELECT last_insert_rowid();
```

Generate `overall_notes` as a brief summary of the session from the parsed data.

### 2. Insert exercise_logs (one per exercise)

```sql
INSERT INTO exercise_logs (workout_log_id, template_exercise_id, exercise_name,
    superset_group, superset_order, sort_order, notes)
VALUES (<log_id>, NULL, '<name>', '<group>', <order>, <sort>, '<notes>');
SELECT last_insert_rowid();
```

The `notes` field should contain the user's notes for that exercise (everything after reps).

### 3. Insert set_logs (one per set per exercise)

```sql
INSERT INTO set_logs (exercise_log_id, set_number, target_reps, target_weight,
    actual_reps, actual_weight, weight_unit)
VALUES (<ex_log_id>, <set_num>, <template_target_reps>, <template_target_weight>,
    <actual_reps>, <actual_weight>, 'lbs');
```

- `target_reps` and `target_weight` come from the template
- `actual_reps` and `actual_weight` come from the parsed shorthand
- For bodyweight exercises, actual_weight = 0
- For timed exercises (planks, dead bug), actual_reps = seconds held

### 4. Insert cardio_log (if cardio line present)

```sql
INSERT INTO cardio_logs (user_id, workout_log_id, date, activity_type,
    duration_minutes, duration_seconds, distance, distance_unit,
    speed, speed_unit, avg_heart_rate, incline, notes)
VALUES (<user_id>, <log_id>, '<date>', '<activity_type>',
    <minutes>, <seconds>, <distance>, 'miles',
    <speed>, 'mph', <hr>, <incline>, '<notes>');
```

Activity type: infer from template (Zone 2 Walking, Zone 2 Walking/Running, etc.)

## Send Confirmation via Telegram

After logging, send a recap to the user via Telegram confirming what was logged. Include:
- Exercise name, sets x reps @ weight for each exercise
- Any coaching observations (weight bumps, rep drops, form notes)
- Cardio summary with HR relative to any configured Zone 2 HR cap

**Telegram chat IDs:**
- User 1: `YOUR_USER1_CHAT_ID`
- User 2: `YOUR_USER2_CHAT_ID`

## Terminal Output

Briefly confirm to terminal: "Logged [user]'s [day] workout ([N] exercises, [M] sets, [cardio if any])."
