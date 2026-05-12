#!/usr/bin/env bash
# release.sh — build + deploy web (Vercel) e gera AAB Android pronto pro Play Console
# Uso:
#   ./release.sh              → faz tudo (web + android)
#   ./release.sh web          → só Vercel
#   ./release.sh android      → só AAB
#   ./release.sh android 1.0.1 → AAB com versionName específico

set -e
cd "$(dirname "$0")"

MODE="${1:-all}"
NEW_VERSION="${2:-}"

GRADLE_FILE="android/app/build.gradle"
AAB_OUT="android/app/build/outputs/bundle/release/app-release.aab"
DESKTOP_AAB="$HOME/Desktop/trokvibe-release.aab"

bump_version() {
  CURRENT_CODE=$(grep -E "^\s*versionCode" "$GRADLE_FILE" | grep -oE "[0-9]+")
  NEW_CODE=$((CURRENT_CODE + 1))
  CURRENT_NAME=$(grep -E "^\s*versionName" "$GRADLE_FILE" | grep -oE "\"[^\"]+\"" | tr -d '"')

  if [ -n "$NEW_VERSION" ]; then
    NAME="$NEW_VERSION"
  else
    # auto bump patch: 1.0.0 → 1.0.1
    IFS='.' read -r MAJ MIN PAT <<< "$CURRENT_NAME"
    PAT=$((PAT + 1))
    NAME="${MAJ}.${MIN}.${PAT}"
  fi

  sed -i '' "s/versionCode $CURRENT_CODE/versionCode $NEW_CODE/" "$GRADLE_FILE"
  sed -i '' "s/versionName \"$CURRENT_NAME\"/versionName \"$NAME\"/" "$GRADLE_FILE"
  echo "📱 Android: versionCode $CURRENT_CODE → $NEW_CODE | versionName $CURRENT_NAME → $NAME"
}

build_web() {
  echo "🌐 Building web..."
  npm run build
  echo "🚀 Deploy Vercel..."
  if command -v vercel >/dev/null 2>&1; then
    vercel --prod --yes
  else
    echo "⚠️  vercel CLI não instalado. Push pro GitHub que o auto-deploy roda."
    git status --short
  fi
}

build_android() {
  bump_version
  echo "🔄 Sync Capacitor..."
  npx cap sync android
  echo "🔨 Build AAB (release)..."
  cd android
  ./gradlew bundleRelease
  cd ..
  if [ -f "$AAB_OUT" ]; then
    cp "$AAB_OUT" "$DESKTOP_AAB"
    SIZE=$(du -h "$DESKTOP_AAB" | cut -f1)
    echo "✅ AAB pronto: $DESKTOP_AAB ($SIZE)"
    echo "🚀 Upload automático para o Play Console..."
    python3 "$(dirname "$0")/scripts/upload_to_play.py" "$AAB_OUT"
  else
    echo "❌ AAB não encontrado em $AAB_OUT"
    exit 1
  fi
}

case "$MODE" in
  web)     build_web ;;
  android) build_android ;;
  all)     build_web; build_android ;;
  *) echo "Uso: $0 [web|android|all] [versionName]"; exit 1 ;;
esac

echo ""
echo "✨ Done."
