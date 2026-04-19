#!/usr/bin/env bash
# =============================================================================
# backup-db.sh — Backup automático de PostgreSQL para PymeFlow
# =============================================================================
# Crea un dump comprimido de la base de datos y elimina backups de más de
# 30 días. Diseñado para ejecutarse desde cron o launchd.
#
# Uso manual:
#   chmod +x scripts/backup-db.sh
#   ./scripts/backup-db.sh
#
# Configurar en crontab (diario a las 3:00 AM):
#   0 3 * * * /Users/jorgepinto/Desktop/pymeflow/scripts/backup-db.sh >> /var/log/pymeflow-backup.log 2>&1
# =============================================================================

set -euo pipefail

# ─── Configuración ──────────────────────────────────────────────────────────
DB_HOST="${PGHOST:-localhost}"
DB_PORT="${PGPORT:-5432}"
DB_USER="${PGUSER:-pymeflow}"
DB_NAME="${PGDATABASE:-pymeflow}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/pymeflow-backups}"
RETENTION_DAYS=30
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/pymeflow_${TIMESTAMP}.dump"

# ─── Crear directorio de backups si no existe ───────────────────────────────
mkdir -p "$BACKUP_DIR"

echo "[$(date)] Iniciando backup de $DB_NAME..."

# ─── Ejecutar pg_dump ────────────────────────────────────────────────────────
pg_dump \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --username="$DB_USER" \
  --format=custom \
  --compress=9 \
  --no-password \
  "$DB_NAME" \
  > "$BACKUP_FILE"

BACKUP_SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
echo "[$(date)] Backup completado: $BACKUP_FILE ($BACKUP_SIZE)"

# ─── Eliminar backups más antiguos que RETENTION_DAYS ───────────────────────
DELETED=$(find "$BACKUP_DIR" -name "pymeflow_*.dump" -mtime "+$RETENTION_DAYS" -print -delete | wc -l | tr -d ' ')
if [[ "$DELETED" -gt 0 ]]; then
  echo "[$(date)] $DELETED backup(s) antiguos eliminados (>${RETENTION_DAYS}d)"
fi

echo "[$(date)] ✅ Backup finalizado correctamente."

# ─── Instrucciones de restauración ──────────────────────────────────────────
# Para restaurar:
#   pg_restore --host=localhost --username=pymeflow --dbname=pymeflow \
#              --clean --no-password <archivo.dump>
