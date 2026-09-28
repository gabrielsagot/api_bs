#!/bin/bash
# Service systemd (Linux, Raspberry Pi) pour faire tourner le dashboard 24 h/24.
#
#   ./scripts/linux-service.sh install     installe et démarre le service
#   ./scripts/linux-service.sh uninstall   arrête et supprime le service
#   ./scripts/linux-service.sh restart     redémarre (après une mise à jour du code)
#   ./scripts/linux-service.sh status      état du service
#   ./scripts/linux-service.sh logs        suit le journal en direct
set -euo pipefail

NAME="brawl-dashboard"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UNIT_DIR="$HOME/.config/systemd/user"
UNIT="$UNIT_DIR/$NAME.service"

case "${1:-}" in
  install)
    NODE_BIN="$(command -v node || true)"
    if [ -z "$NODE_BIN" ]; then
      echo "Node.js introuvable : installe Node 22.13+ (https://nodejs.org)." >&2
      exit 1
    fi
    cd "$ROOT"
    [ -d node_modules ] || npm install
    npm run build >/dev/null
    mkdir -p "$UNIT_DIR"
    cat >"$UNIT" <<EOF
[Unit]
Description=Brawl Dashboard
After=network-online.target

[Service]
WorkingDirectory=$ROOT
ExecStart=$NODE_BIN --import tsx server/index.ts
Restart=always
RestartSec=30

[Install]
WantedBy=default.target
EOF
    systemctl --user daemon-reload
    systemctl --user enable --now "$NAME"
    # Permet au service de tourner même sans session ouverte (utile sur un Raspberry Pi).
    loginctl enable-linger "$USER" 2>/dev/null || true
    echo "✓ Service installé et démarré : http://$(hostname -I 2>/dev/null | awk '{print $1}'):${PORT:-4777}"
    ;;
  uninstall)
    systemctl --user disable --now "$NAME" 2>/dev/null || true
    rm -f "$UNIT"
    systemctl --user daemon-reload
    echo "✓ Service supprimé. Tes données (dossier data/) sont conservées."
    ;;
  restart)
    cd "$ROOT"
    npm run build >/dev/null
    systemctl --user restart "$NAME"
    echo "✓ Redémarré."
    ;;
  status) systemctl --user status "$NAME" --no-pager ;;
  logs) journalctl --user -u "$NAME" -f ;;
  *)
    sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
