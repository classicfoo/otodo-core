#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
project_name="$(basename "$project_root")"
backup_dir="/home/michael/Documents/Backups/$project_name"
timestamp="$(date +%Y%m%d-%H%M%S)"
backup_source="${BACKUP_SOURCE:-local}"
db_name="${DB_NAME:-otodo.sqlite}"
db_path="${DB_PATH:-$project_root/data/$db_name}"
remote_db_path="${REMOTE_DB_PATH:-}"
ftp_host="${FTP_HOST:-}"
ftp_user="${FTP_USER:-}"
ftp_pass="${FTP_PASS:-}"
ftp_dir="${FTP_DIR:-}"
ftp_ssl_mode="${FTP_SSL_MODE:-off}"
max_backups="${MAX_BACKUPS:-3}"

prune_old_backups() {
  local base_name="${db_name%.sqlite}"
  local pattern="$backup_dir/${base_name}-"*.sqlite
  local backups=()
  local backup_path=""

  shopt -s nullglob
  backups=($pattern)
  shopt -u nullglob

  if (( ${#backups[@]} <= max_backups )); then
    return
  fi

  mapfile -t backups < <(printf '%s\n' "${backups[@]}" | sort -r)

  for backup_path in "${backups[@]:max_backups}"; do
    rm -f "$backup_path" "$backup_path-wal" "$backup_path-shm"
  done
}

download_remote_database() {
  local base_name="${db_name%.sqlite}"
  local local_db_path="$backup_dir/${base_name}-${timestamp}.sqlite"
  local local_wal_path="$backup_dir/${base_name}-${timestamp}.sqlite-wal"
  local local_shm_path="$backup_dir/${base_name}-${timestamp}.sqlite-shm"
  local remote_wal_path=""
  local remote_shm_path=""

  if [[ -z "$ftp_host" || -z "$ftp_user" || -z "$ftp_pass" ]]; then
    echo "FTP_HOST, FTP_USER, and FTP_PASS are required for remote backups" >&2
    exit 1
  fi

  if [[ -z "$remote_db_path" ]]; then
    if [[ -z "$ftp_dir" ]]; then
      echo "Set REMOTE_DB_PATH or FTP_DIR for remote backups" >&2
      exit 1
    fi
    remote_db_path="${ftp_dir%/}/data/$db_name"
  fi
  remote_wal_path="${remote_db_path}-wal"
  remote_shm_path="${remote_db_path}-shm"

  if ! command -v lftp >/dev/null 2>&1; then
    echo "lftp is required for remote backups" >&2
    exit 1
  fi

  mkdir -p "$backup_dir"

  local ssl_allow="false"
  local ssl_force="false"
  local ssl_verify="false"
  case "$ftp_ssl_mode" in
    off)
      ;;
    explicit|on|true)
      ssl_allow="true"
      ssl_force="true"
      ;;
    *)
      echo "Unsupported FTP_SSL_MODE: $ftp_ssl_mode" >&2
      exit 1
      ;;
  esac

  lftp -u "$ftp_user","$ftp_pass" "ftp://$ftp_host" <<EOF
set cmd:fail-exit true
set ftp:ssl-allow $ssl_allow
set ftp:ssl-force $ssl_force
set ssl:verify-certificate $ssl_verify
get "$remote_db_path" -o "$local_db_path"
bye
EOF

  if [[ ! -f "$local_db_path" ]]; then
    echo "Remote database download failed: $remote_db_path" >&2
    exit 1
  fi

  lftp -u "$ftp_user","$ftp_pass" "ftp://$ftp_host" <<EOF || true
set cmd:fail-exit true
set ftp:ssl-allow $ssl_allow
set ftp:ssl-force $ssl_force
set ssl:verify-certificate $ssl_verify
get "$remote_wal_path" -o "$local_wal_path"
bye
EOF

  lftp -u "$ftp_user","$ftp_pass" "ftp://$ftp_host" <<EOF || true
set cmd:fail-exit true
set ftp:ssl-allow $ssl_allow
set ftp:ssl-force $ssl_force
set ssl:verify-certificate $ssl_verify
get "$remote_shm_path" -o "$local_shm_path"
bye
EOF

  prune_old_backups
  echo "Remote database backup downloaded to: $local_db_path"
}

backup_local_database() {
  local backup_path="$backup_dir/${db_name%.sqlite}-$timestamp.sqlite"

  if [[ ! -f "$db_path" ]]; then
    echo "Database not found: $db_path" >&2
    exit 1
  fi

  mkdir -p "$backup_dir"

  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$db_path" ".backup '$backup_path'"
  else
    cp "$db_path" "$backup_path"
    if [[ -f "$db_path-wal" ]]; then
      cp "$db_path-wal" "$backup_dir/${db_name%.sqlite}-$timestamp.sqlite-wal"
    fi
    if [[ -f "$db_path-shm" ]]; then
      cp "$db_path-shm" "$backup_dir/${db_name%.sqlite}-$timestamp.sqlite-shm"
    fi
  fi

  prune_old_backups
  echo "Local database backup created at: $backup_path"
}

case "$backup_source" in
  local)
    backup_local_database
    ;;
  remote)
    download_remote_database
    ;;
  *)
    echo "Unsupported BACKUP_SOURCE: $backup_source" >&2
    exit 1
    ;;
esac
