#!/usr/bin/env bash
# deploy.sh — push + deploy num so comando.
#
# Substitui `git push origin main` enquanto o webhook Vercel<->GitHub
# nao for reconectado. O webhook esta apontando pro repo antigo
# (guilhermelimabh-eng/papo-de-alunos); pra restaurar o auto-deploy no
# push, precisa instalar o Vercel GitHub App no org
# opapodeintercambio-technology (so admin do org consegue).
#
# Uso:
#   ./deploy.sh                  # commit nao precisa, push + deploy
#   ./deploy.sh "msg de commit"  # add . + commit + push + deploy

set -euo pipefail

cd "$(dirname "$0")"

# 1) Se passou mensagem de commit, faz commit primeiro
if [ "${1:-}" != "" ]; then
  echo "→ git add + commit"
  git add -A
  git commit -m "$1"
fi

# 2) Push pro origin
BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "→ git push origin $BRANCH"
git push origin "$BRANCH"

# 3) Deploy production no Vercel
echo "→ vercel deploy --prod"
vercel deploy --prod --yes

echo ""
echo "✓ Deploy completo. Conferindo prod:"
sleep 5
curl -s https://studentclub.app/sw.js 2>/dev/null | grep "SW_VERSION" | head -1
curl -s https://studentclub.app/ 2>/dev/null | grep -oE 'index-[A-Za-z0-9_-]+\.js' | head -1
