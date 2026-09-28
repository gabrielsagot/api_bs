#!/bin/bash
# Démarrage automatique du dashboard à l'ouverture de session (macOS, launchd).
#
#   ./scripts/macos-autostart.sh install     installe et démarre le service
#   ./scripts/macos-autostart.sh uninstall   arrête et supprime le service
#   ./scripts/macos-autostart.sh restart     redémarre (après une mise à jour du code)
#   ./scripts/macos-autostart.sh status      état du service
#   ./scripts/macos-autostart.sh logs        suit le journal en direct
set -euo pipefail

LABEL="com.brawl-dashboard"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$HOME/Library/Logs/brawl-dashboard.log"
DOMAIN="gui/$(id -u)"

if [ "$(uname)" != "Darwin" ]; then
  echo "Ce script est prévu pour macOS (launchd)." >&2
  exit 1
fi

case "${1:-}" in
  install)
    NODE_BIN="$(command -v node || true)"
    if [ -z "$NODE_BIN" ]; then
      echo "Node.js introuvable : installe-le (brew install node, ou https://nodejs.org)." >&2
      exit 1
    fi
    cd "$ROOT"
    if [ ! -d node_modules ]; then
      echo "→ Installation des dépendances…"
      npm install
    fi
    echo "→ Compilation de l'interface…"
    npm run build >/dev/null
    mkdir -p "$HOME/Library/LaunchAgents" "$(dirname "$LOG")"
    cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>--import</string>
    <string>tsx</string>
    <string>server/index.ts</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$ROOT</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$(dirname "$NODE_BIN"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>30</integer>
  <key>StandardOutPath</key>
  <string>$LOG</string>
  <key>StandardErrorPath</key>
  <string>$LOG</string>
</dict>
</plist>
EOF
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    launchctl bootstrap "$DOMAIN" "$PLIST"
    echo "✓ Installé : le dashboard tourne maintenant et redémarrera à chaque ouverture de session."
    echo "  Ouvre http://localhost:${PORT:-4777} · journal : $LOG"
    ;;
  uninstall)
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"
    echo "✓ Service supprimé. Tes données (dossier data/) sont conservées."
    ;;
  restart)
    cd "$ROOT"
    npm run build >/dev/null
    launchctl kickstart -k "$DOMAIN/$LABEL"
    echo "✓ Redémarré."
    ;;
  status)
    launchctl print "$DOMAIN/$LABEL" 2>/dev/null | grep -E "state|pid|last exit" || echo "Service non installé."
    ;;
  logs)
    touch "$LOG"
    tail -n 50 -f "$LOG"
    ;;
  *)
    sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
