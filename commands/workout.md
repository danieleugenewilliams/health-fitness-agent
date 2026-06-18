---
allowed-tools: Bash(sqlite3*), mcp__plugin_telegram_telegram__reply
description: 'Send a user their workout for a given day via Telegram. Usage: /workout [user1|user2] [day-of-week or today]'
---

# /workout — Deliver Daily Workout via Telegram

Send a user their workout for the day with template data, last logged performance, and progressive overload applied.

Arguments passed: `$ARGUMENTS`

## Parse Arguments

- First arg: user name (`user1` or `user2`). If omitted, send BOTH users their workouts.
- Second arg: day (`today`, `monday`-`sunday`, or a date). Default: `today`.
- Map user to `user_id`: user1=1, user2=2
- Map day to `day_of_week`: sunday=0, monday=1, tuesday=2, wednesday=3, thursday=4, friday=5, saturday=6

## Database

- Path: `~/path/to/health_tracker.db`
- Do NOT run PRAGMA queries. Use the schema below.

### Schema (baked in)

**workout_templates:** id, user_id, name, day_of_week, notes, is_active, sort_order
**template_exercises:** id, template_id, superset_group, superset_order, exercise_name, target_sets, target_reps, target_weight, weight_unit, weight_note, rest_seconds, notes, sort_order
**workout_logs:** id, user_id, template_id, date, start_time, end_time, duration_minutes, overall_difficulty, overall_notes, completed
**exercise_logs:** id, workout_log_id, template_exercise_id, exercise_name, superset_group, superset_order, sort_order, notes
**set_logs:** id, exercise_log_id, set_number, target_reps, target_weight, actual_reps, actual_weight, weight_unit, rpe, completed, notes
**cardio_logs:** id, user_id, workout_log_id, date, activity_type, duration_minutes, duration_seconds, distance, distance_unit, speed, speed_unit, avg_heart_rate, max_heart_rate, target_hr_min, target_hr_max, incline, notes

## Steps

### 1. Get the template

```sql
SELECT id, name, day_of_week, notes FROM workout_templates
WHERE user_id=<USER_ID> AND day_of_week=<DAY> AND is_active=1;
```

### 2. Get template exercises

```sql
SELECT superset_group, superset_order, exercise_name, target_sets, target_reps,
       target_weight, weight_unit, weight_note, rest_seconds, notes, sort_order
FROM template_exercises WHERE template_id=<TEMPLATE_ID>
ORDER BY sort_order, superset_group, superset_order;
```

### 3. Get most recent workout log for this template

```sql
SELECT id, date, overall_notes FROM workout_logs
WHERE user_id=<USER_ID> AND template_id=<TEMPLATE_ID>
ORDER BY date DESC LIMIT 1;
```

### 4. Get logged sets from that workout

```sql
SELECT el.exercise_name, el.superset_group, el.superset_order, el.notes as ex_notes,
       sl.set_number, sl.actual_reps, sl.actual_weight, sl.weight_unit, sl.notes as set_notes
FROM exercise_logs el
LEFT JOIN set_logs sl ON sl.exercise_log_id = el.id
WHERE el.workout_log_id = <LOG_ID>
ORDER BY el.sort_order, sl.set_number;
```

### 5. Apply progressive overload

**User 1 (user_id=1):**
- +5 lb/week on compound lifts (Barbell Back Squat, Romanian Deadlift, Leg Press, Barbell Bench Press, Barbell Row/Pendlay, Seated Dumbbell Shoulder Press, Lat Pulldown)
- Show the bumped weight as the target for this session
- If last session had form breakdown or incomplete reps, hold at last weight instead

**User 2 (user_id=2):**
- Follow their own progression notes from exercise_logs.notes and set_logs.notes (look for "try X#" patterns)
- Follow a 3-week progressive overload protocol: 3 weeks at working weight, week 4 deload, week 5 increase
- Increments: 5 lb lower body compounds, 2.5-5 lb upper body, 2.5 lb isolation

### 6. Format the message

**Both users** use the same format:
- Plain text only. No markdown (no bold, no headers, no horizontal rules).
- Each exercise ONE SINGLE LINE containing: label (if any), name, template prescription, last logged sets, today's target (with progressive overload bump if applicable), notes -- all inline.
- Superset header on its own line above the exercises in that group (User 2).
- Blank line between supersets only (User 2). For User 1's non-superset templates, blank line between logical sections (main lifts vs accessories vs mobility).
- Day title and metadata (date, last session date) as plain text at the top.
- Show template prescription AND actual last-logged data side by side on each exercise line.

**User 2-specific:**
- Do NOT include a logging template in the workout message body (sent as a separate second message, see 7b).
- Do NOT include a logging template in the workout message body.
- Reference any active coaching flags stored in User 2's profile notes if relevant (e.g. HR caps, exercise restrictions, form cues).

### 7. Send via Telegram

- User 1 chat_id: `YOUR_USER1_CHAT_ID`
- User 2 chat_id: `YOUR_USER2_CHAT_ID`
- Use the `mcp__plugin_telegram_telegram__reply` tool with `format: "text"`

### 7b. Send pre-filled logging template (BOTH users)

After sending the workout message, send a SECOND separate message with a pre-filled logging template the user can copy and edit. Format:

- One line per exercise
- Pre-fill with the TARGET WEIGHT and TARGET REPS for the FIRST SET only (use today's progressive-overload target, not last session's weight)
- Do NOT include remaining sets, underlines, or forward slashes -- the user will add their own reps
- Do NOT include exercise notes or any extra text -- just compact lines
- For timed exercises (planks, dead bug): `<label> <weight># <seconds>` e.g. `Plank bw 60`
- For bodyweight exercises: `<label> bw <reps>`
- For banded exercises: `<label> band <reps>`
- Pre-fill a cardio line at the end with the LAST LOGGED cardio values (speed, duration, distance, HR). If no previous cardio log, use template defaults. Skip if the workout has no cardio component.
- Example cardio line: `4mph 28:47 2m 148HR`

**User 2's labels:** Use superset labels (A1, A2, B1, B2, C1, C2). Example: `A1 105# 10`, `B1 75# 10`.

**User 1's labels:** Non-superset templates. Use a short exercise nickname (Bench, Row, OHP, Pulldown, Squat, RDL, Press, Plank, etc.). Example: `Bench 110# 5`, `Pulldown 98# 10`, `Plank bw 60`.

### 8. Confirm

Output a brief confirmation to the terminal (not Telegram) that the workout was sent.
