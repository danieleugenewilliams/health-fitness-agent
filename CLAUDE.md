# Health & Fitness Agent

A personal health tracking system combining a Claude Code agent (via Telegram), SQLite database, and a local web app. Supports multiple family members with different tracking needs.

## Architecture

**Claude Code agent** handles real-time operations via the Telegram MCP plugin:
- Delivers daily workouts with progressive overload applied
- Parses and logs workout shorthand into the database
- Logs sleep data against a progressive sleep plan
- Logs health metrics (blood pressure, medications, symptoms)

**Web app** (`app/`) provides a local dashboard for reviewing trends and data.

**Database** (`app/data/health_tracker.db`) is the shared data store — both the agent and web app read/write the same SQLite file.

## Running the Web App

```bash
cd app && python server.py
```

Then open http://localhost:8000

## Claude Code Skills

Skills live in `commands/` and must be copied to `~/.claude/commands/` to be available as slash commands.

Before copying, edit each file and replace:
- `YOUR_USER1_CHAT_ID` — Telegram chat ID for user 1
- `YOUR_USER2_CHAT_ID` — Telegram chat ID for user 2
- `PLAN_START_DATE` in log-sleep.md — your sleep plan start date (YYYY-MM-DD)

Available skills:
- `/workout` — delivers daily workout via Telegram with progressive overload
- `/log-workout` — parses shorthand workout data and logs to DB
- `/log-sleep` — logs sleep data against a progressive sleep plan

## Database Schema

See `app/schema.sql` for the full schema. Key tables:

| Table | Purpose |
|-------|---------|
| `users` | User accounts |
| `profiles` | Demographics, tracking type, goals |
| `workout_templates` | Weekly workout schedule definitions |
| `template_exercises` | Exercises within each template |
| `workout_logs` | Completed workout sessions |
| `exercise_logs` | Per-exercise records within a session |
| `set_logs` | Individual set data (reps, weight, RPE) |
| `cardio_logs` | Cardio session data |
| `sleep_logs` | Sleep tracking with phase/target against a plan |
| `blood_pressure` | BP readings with context |
| `scale_readings` | Smart scale body composition data |
| `seizure_episodes` | Seizure tracking |
| `medication_log` | Medication intake logging |
| `symptom_logs` | General symptom tracking |
| `inbody_scans` | InBody body composition results |
| `labs` | Lab test results |
| `measurements` | Body measurements |
| `notes` | General notes |

## Progressive Overload System

The `/workout` skill applies linear progression automatically:
- +5 lb/week on compound lifts
- Hold weight if the last session had rep breakdown or incomplete sets
- User 2 follows a 3-week progressive overload cycle

## Sleep Plan

The `/log-sleep` skill tracks against a 6-week progressive sleep plan:
- Phase 1 (Weeks 1-2): bed by midnight, 7.5 hrs target
- Phase 2 (Weeks 3-4): bed by 11:30pm, 8 hrs target
- Phase 3 (Weeks 5-6): bed by 11:00pm, 8.5 hrs target
- Maintenance: bed by 11:00pm, 8 hrs target

## Setup

1. Install Claude Code: https://claude.ai/code
2. Configure the Telegram MCP plugin
3. Copy `commands/*.md` to `~/.claude/commands/` (edit placeholders first — see "Before copying" above)
4. Initialize the database: `sqlite3 app/data/health_tracker.db < app/schema.sql`
5. Start the web app: `cd app && python server.py`
