#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
project_name="$(basename "$project_root")"
db_path="$project_root/data/otodo.sqlite"
backup_dir="/home/michael/Documents/Backups/$project_name"
timestamp="$(date +%Y%m%d-%H%M%S)"

if [[ ! -f "$db_path" ]]; then
  echo "Database not found: $db_path" >&2
  exit 1
fi

mkdir -p "$backup_dir"
backup_path="$backup_dir/otodo-$timestamp.sqlite"

if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$db_path" ".backup '$backup_path'"
else
  cp "$db_path" "$backup_path"
  if [[ -f "$db_path-wal" ]]; then
    cp "$db_path-wal" "$backup_dir/otodo-$timestamp.sqlite-wal"
  fi
  if [[ -f "$db_path-shm" ]]; then
    cp "$db_path-shm" "$backup_dir/otodo-$timestamp.sqlite-shm"
  fi
fi

echo "Database backup created at: $backup_path"
