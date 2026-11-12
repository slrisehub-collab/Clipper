#!/usr/bin/env bash
# ClipForge one-command installer for a fresh Ubuntu 22.04+/Debian 12 server (x86-64 or ARM).
#
#   curl -fsSL https://raw.githubusercontent.com/slrisehub-collab/Clipper/claude/clipforge-platform-0o3kxw/deploy/install.sh | sudo bash
#
# Optional settings, passed as environment variables (put them after `sudo`):
#   DOMAIN=clips.example.com     use this domain with automatic HTTPS (point its DNS A record at the server first)
#   ADMIN_EMAIL=you@example.com  promote this account to admin once it has registered (or run make-admin later)
#   REPO_URL=...                 git URL to install from (a private repo needs a URL with an access token)
#   BRANCH=...                   branch to install
#
# Re-running the script updates an existing install (pulls, rebuilds, migrates) and keeps your data.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/slrisehub-collab/Clipper.git}"
BRANCH="${BRANCH:-claude/clipforge-platform-0o3kxw}"
DIR="${DIR:-/opt/clipforge}"
DOMAIN="${DOMAIN:-}"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mError: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run as root: curl ... | sudo bash"
command -v apt-get >/dev/null || die "This script supports Ubuntu and Debian only."

say "Installing Docker, git and openssl"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl git openssl >/dev/null
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker >/dev/null 2>&1 || true

# Small VMs run out of memory during the Next.js build; add swap if there is none.
if [ "$(swapon --show | wc -l)" -eq 0 ] && [ "$(awk '/MemTotal/ {print $2}' /proc/meminfo)" -lt 4000000 ]; then
  say "Adding 2 GB of swap (less than 4 GB of RAM detected)"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Oracle Cloud's Ubuntu images block inbound traffic with iptables; open 80 and 443.
if command -v iptables >/dev/null && iptables -S INPUT 2>/dev/null | grep -q -- '-j REJECT'; then
  say "Opening ports 80 and 443 in the local firewall"
  for p in 80 443; do
    iptables -C INPUT -p tcp --dport "$p" -j ACCEPT 2>/dev/null || iptables -I INPUT 5 -p tcp --dport "$p" -j ACCEPT
  done
  if command -v netfilter-persistent >/dev/null; then netfilter-persistent save >/dev/null 2>&1 || true; fi
fi
if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
fi

say "Fetching ClipForge ($BRANCH)"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch -q origin "$BRANCH"
  git -C "$DIR" checkout -q "$BRANCH"
  git -C "$DIR" reset -q --hard "origin/$BRANCH"
else
  git clone -q --branch "$BRANCH" "$REPO_URL" "$DIR" || die "Could not clone $REPO_URL. If the repository is private, pass REPO_URL=https://<token>@github.com/owner/repo.git"
fi
cd "$DIR"

PUBLIC_IP="$(curl -fsS --max-time 5 https://api.ipify.org || hostname -I | awk '{print $1}')"
if [ -n "$DOMAIN" ]; then
  APP_URL="https://$DOMAIN"; SITE_ADDRESS="$DOMAIN"
else
  APP_URL="http://$PUBLIC_IP"; SITE_ADDRESS=":80"
fi

if [ ! -f .env ]; then
  say "Writing configuration (.env)"
  cp .env.example .env
  sed -i "s#^SIGNING_SECRET=.*#SIGNING_SECRET=$(openssl rand -hex 32)#" .env
fi
# Keep these in step with the current DOMAIN on every run.
set_env() { if grep -q "^$1=" .env; then sed -i "s#^$1=.*#$1=$2#" .env; else echo "$1=$2" >> .env; fi; }
set_env APP_URL "$APP_URL"
set_env SITE_ADDRESS "$SITE_ADDRESS"
set_env STORAGE_DRIVER local
set_env UNSAFE_ALLOW_PRIVATE_URLS false

say "Building and starting the containers (the first build takes several minutes)"
docker compose up -d --build

say "Applying database migrations"
for i in $(seq 1 30); do
  docker compose exec -T postgres pg_isready -U clipforge >/dev/null 2>&1 && break
  sleep 2
done
docker compose run --rm web npm run migrate

if [ -n "${ADMIN_EMAIL:-}" ]; then
  docker compose run --rm web npm run make-admin -- "$ADMIN_EMAIL" || true
fi

say "Checking the site responds"
ok=""
for i in $(seq 1 60); do
  if curl -fsS -o /dev/null --max-time 5 http://127.0.0.1/ -H "Host: ${DOMAIN:-localhost}"; then ok=1; break; fi
  sleep 3
done
[ -n "$ok" ] || echo "The site didn't answer yet. Check: docker compose -f $DIR/docker-compose.yml logs web"

cat <<EOF

ClipForge is running at: $APP_URL

Next steps
  1. Open $APP_URL and create your account.
  2. Make yourself an admin:
       cd $DIR && sudo docker compose run --rm web npm run make-admin -- you@example.com
  3. If the page doesn't load from your computer, open TCP ports 80 and 443 in your
     cloud provider's firewall (on Oracle Cloud: the VCN security list ingress rules).

Useful commands (run in $DIR)
  sudo docker compose ps                 status of every service
  sudo docker compose logs -f worker     watch video processing
  sudo bash deploy/install.sh            update to the latest code (data is kept)
EOF
