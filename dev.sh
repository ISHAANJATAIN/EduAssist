#!/usr/bin/env bash
# Starts Postgres, the FastAPI backend and the Vite frontend for local development.
# Usage: ./dev.sh        start everything
#        ./dev.sh stop   stop everything
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

LOG_DIR="$ROOT/.dev-logs"
BACKEND_PID=""
FRONTEND_PID=""
STARTED_DB=0

# PID of the process LISTENING on a local port, empty when the port is free.
# Sockets left in FIN_WAIT/CLOSE_WAIT belong to processes that already exited
# and do not block a rebind, so they must not count as "in use".
listener_pid() {
  netstat -ano 2>/dev/null | awk -v p=":$1" '$2 ~ p"$" && $4 == "LISTENING" && $NF != "0" {print $NF; exit}' || true
}

# Any PID still holding a socket on a local port, in any state. Used when
# stopping so a half-dead uvicorn reloader is cleaned up, not just the listener.
socket_pid() {
  netstat -ano 2>/dev/null | awk -v p=":$1" '$2 ~ p"$" && $NF != "0" && $NF != "" {print $NF; exit}' || true
}

# Waits up to ~5s for a port to be released by its listener.
wait_port_free() {
  local port="$1" pid
  for _ in {1..25}; do
    pid="$(listener_pid "$port")"
    [[ -z "$pid" ]] && return 0
    sleep 0.2
  done
  return 1
}

kill_tree() {
  local pid="$1"
  [[ -n "$pid" && "$pid" != "0" ]] || return 0
  taskkill //F //T //PID "$pid" >/dev/null 2>&1 || true
}

# Vite and uvicorn --reload spawn grandchildren that can outlive a port kill.
# The reload worker is a multiprocessing child that inherits the listening
# socket, so it must be cleared even when its parent is already gone.
stop_project_processes() {
  powershell -NoProfile -Command "\
    \$procs = Get-CimInstance Win32_Process; \
    \$procs | Where-Object { \$_.Name -match '^(node|python|cmd)\.exe$' -and \$_.CommandLine -match 'eduassist' -and \$_.CommandLine -match 'vite|uvicorn|npm' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }; \
    \$procs | Where-Object { \$_.Name -eq 'python.exe' -and \$_.CommandLine -match '--multiprocessing-fork' -and -not (Get-Process -Id \$_.ParentProcessId -ErrorAction SilentlyContinue) } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }" >/dev/null 2>&1 || true
}

cleanup() {
  trap - INT TERM EXIT
  echo
  echo "Stopping EduAssist..."
  kill_tree "$FRONTEND_PID"
  kill_tree "$BACKEND_PID"
  stop_project_processes
  wait_port_free 5173 || true
  wait_port_free 8000 || true
  if [[ "$STARTED_DB" == "1" ]]; then
    docker compose stop db >/dev/null 2>&1 || true
  fi
  echo "Stopped. Logs: $LOG_DIR"
}

parent_pid() {
  powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=$1').ParentProcessId" 2>/dev/null | tr -d '\r'
}

stop_existing() {
  local killed=0 pid parent
  for port in 5173 8000; do
    pid="$(socket_pid "$port")"
    if [[ -n "$pid" && "$pid" != "0" ]]; then
      echo "Stopping process on :$port (pid $pid)"
      parent="$(parent_pid "$pid")"
      kill_tree "$pid"
      [[ -n "$parent" && "$parent" != "0" ]] && kill_tree "$parent"
      killed=1
    fi
  done
  stop_project_processes
  for port in 5173 8000; do
    if ! wait_port_free "$port"; then
      echo "Port $port is still held by pid $(listener_pid "$port"). Stop it manually, then retry."
    fi
  done
  docker compose stop db >/dev/null 2>&1 || true
  if [[ "$killed" == "1" ]]; then
    echo "Ports cleared."
  else
    echo "Ports were already free."
  fi
  echo "Database stopped."
}

case "${1:-}" in
  stop)
    stop_existing
    exit 0
    ;;
  -h | --help)
    echo "Usage: ./dev.sh [stop]"
    exit 0
    ;;
esac

for port in 5173 8000; do
  pid="$(listener_pid "$port")"
  if [[ -n "$pid" && "$pid" != "0" ]]; then
    echo "Port $port is already in use (pid $pid). Run ./dev.sh stop first."
    exit 1
  fi
done

docker info >/dev/null 2>&1 || {
  echo "Docker Desktop is not running. Start it, then rerun ./dev.sh."
  exit 1
}

export NO_PROXY=localhost,127.0.0.1
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy 2>/dev/null || true

mkdir -p "$LOG_DIR"
trap cleanup INT TERM EXIT

echo "1/3 Starting PostgreSQL..."
docker compose up -d db >/dev/null
STARTED_DB=1
status="missing"
for _ in {1..60}; do
  status="$(docker inspect -f '{{.State.Health.Status}}' eduassist-db-1 2>/dev/null || echo missing)"
  [[ "$status" == "healthy" ]] && break
  sleep 1
done
if [[ "$status" != "healthy" ]]; then
  echo "Database did not become healthy. Check: docker compose logs db"
  exit 1
fi
echo "    db ready"

echo "2/3 Starting backend..."
(cd "$ROOT/backend" && exec .venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000) \
  >"$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
for _ in {1..60}; do
  curl -sf --noproxy '*' http://127.0.0.1:8000/api/health >/dev/null 2>&1 && break
  sleep 1
done
if ! kill -0 "$BACKEND_PID" 2>/dev/null || ! curl -sf --noproxy '*' http://127.0.0.1:8000/api/health >/dev/null 2>&1; then
  echo "Backend did not start. Last log lines:"
  tail -20 "$LOG_DIR/backend.log" || true
  exit 1
fi
echo "    api ready"

echo "3/3 Starting frontend..."
(cd "$ROOT/frontend" && exec npm run dev -- --port 5173 --strictPort) >"$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
for _ in {1..60}; do
  curl -sf --noproxy '*' http://localhost:5173/ >/dev/null 2>&1 && break
  sleep 1
done
if ! kill -0 "$FRONTEND_PID" 2>/dev/null || ! curl -sf --noproxy '*' http://localhost:5173/ >/dev/null 2>&1; then
  echo "Frontend did not start. Last log lines:"
  tail -20 "$LOG_DIR/frontend.log" || true
  exit 1
fi
echo "    ui ready"

echo
echo "Landing: http://localhost:5173"
echo "App:     http://localhost:5173/chat"
echo "API:     http://localhost:8000/docs"
echo "Logs:    $LOG_DIR"
echo "Press Ctrl+C to stop everything."

wait -n "$BACKEND_PID" "$FRONTEND_PID" || true
