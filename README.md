# Health & Fitness Agent

A personal health tracking system built around Claude Code. The agent runs in your terminal, communicates with family members via Telegram, and persists all data to a local SQLite database. A lightweight web app provides a dashboard for reviewing trends.

## What it does

- Sends daily workouts to users via Telegram each morning
- Applies progressive overload automatically (+5 lb/week on compounds, hold on rep breakdown)
- Parses workout shorthand logged by users and inserts structured data into the database
- Tracks sleep against a 6-week progressive sleep plan with nightly check-ins
- Logs blood pressure, medications, symptoms, and other health metrics
- Supports multiple family members with independent tracking profiles

## Stack

- **Agent:** Claude Code CLI with Telegram MCP plugin
- **Database:** SQLite (local, never leaves your machine)
- **Web app:** Vanilla JS + Python SimpleHTTPServer (local dashboard)
- **Messaging:** Telegram Bot API via MCP plugin

## Quick start

### 1. Prerequisites

- [Claude Code](https://claude.ai/code) installed
- Telegram bot token (from [@BotFather](https://t.me/botfather))
- Python 3.x
- SQLite3

### 2. Initialize the database

```bash
mkdir -p app/data
sqlite3 app/data/health_tracker.db < app/schema.sql
```

### 3. Configure the Claude Code Telegram plugin

Follow the Claude Code documentation to configure the Telegram MCP plugin with your bot token.

### 4. Install the skills and configure placeholders

Copy the skill files and set your Telegram chat IDs:

```bash
cp commands/*.md ~/.claude/commands/
```

Edit each file in `~/.claude/commands/` and replace:
- `YOUR_USER1_CHAT_ID` — your Telegram chat ID
- `YOUR_USER2_CHAT_ID` — second user's Telegram chat ID (if applicable)
- `PLAN_START_DATE` in `log-sleep.md` — your sleep plan start date (YYYY-MM-DD)

### 5. (Optional) Install the shell hook

The Telegram plugin can leave orphaned processes behind when a Claude session ends, causing messages to be silently swallowed in future sessions. The hook at `shell/telegram_cleanup.zsh` kills those stale processes each time you open a new terminal, keeping only the one attached to the current session.

Add to your `~/.zshrc` (or `~/.bashrc`):

```bash
source /path/to/health-fitness-agent/shell/telegram_cleanup.zsh
```

### 6. Start the web app

```bash
cd app && python server.py
```

Open http://localhost:8000

## Skills

| Skill | Usage | Description |
|-------|-------|-------------|
| `/workout` | `/workout [user] [day]` | Sends workout for the day via Telegram |
| `/log-workout` | `/log-workout user\|date\|template_id\|data` | Logs workout from shorthand |
| `/log-sleep` | `/log-sleep user date shorthand` | Logs sleep data against the sleep plan |

### Workout shorthand format

```
Bench 115# 5 5 5 5
Row 115# 5 5 5 5
OHP 50# 8 8 8
Pulldown 77.5# 10 10 10
Plank bw 60 60
```

### Sleep shorthand format

```
11:30p 7:30a 8h12m | 18aw 95rem 240core 54deep | 82score
11:30p 7:30a 8h12m | 82score
11:30p 7:30a 8h12m | 82score | sick kid
```

## Database

All data is stored locally in `app/data/health_tracker.db`. The database is excluded from this repo via `.gitignore` — it contains personal health data and should never be committed.

See `app/schema.sql` for the full schema and `CLAUDE.md` for table descriptions.

## Privacy

This repo contains no personal health data. The `.gitignore` excludes:
- The SQLite database and all data files
- User-specific directories
- CSV exports and health documents
- Log files and environment config

## License

MIT
