# Kill stale Telegram plugin processes from old Claude sessions on shell startup.
# Keeps only the process parented to the most recent active Claude session (if any)
# so that message delivery isn't silently swallowed by an orphaned instance.
#
# Add to ~/.zshrc (or ~/.bashrc for bash):
#   source /path/to/health-fitness-agent/shell/telegram_cleanup.zsh

_cleanup_stale_telegram() {
  local current_claude_pid
  current_claude_pid=$(pgrep -n -f 'claude.*--channels.*telegram' 2>/dev/null)

  while IFS= read -r line; do
    local pid ppid
    pid=$(echo "$line" | awk '{print $1}')
    ppid=$(echo "$line" | awk '{print $2}')
    # Spare the plugin process that belongs to the current live Claude session
    [[ -n "$current_claude_pid" && "$ppid" == "$current_claude_pid" ]] && continue
    kill "$pid" 2>/dev/null
  done < <(ps -o pid,ppid -c -p \
    "$(pgrep -f 'bun.*telegram.*start' 2>/dev/null | tr '\n' ',')" 2>/dev/null)
}

_cleanup_stale_telegram
