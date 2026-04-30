# Deployment Guide

Production deployment of the SolarNetwork platform. Tested with the contract delivery
v1.1 (April 2026).

---

## Architecture

A typical production layout:

```
                   ┌──────────────┐
       HTTPS  ───▶ │    Nginx     │ ──▶ React static  (frontend/dist)
                   │ reverse proxy│ ──▶ Express API   (localhost:4000)
                   └──────────────┘ ──▶ /uploads/*   (backend/uploads)
                                   │
                                   ▼
                  ┌────────────┐    ┌────────────┐    ┌────────────┐
                  │  MongoDB   │    │   Redis    │    │ BullMQ     │
                  │   (data)   │    │  (queue +  │◀───│  worker    │
                  │            │    │   cache)   │    │ (in-proc)  │
                  └────────────┘    └────────────┘    └────────────┘
```

The backend process hosts both the API and the BullMQ worker (started in
`backend/src/index.ts`). For higher load, split the worker into a separate process by
running `node dist/index.js` with an env flag and skipping `app.listen()`.

---

## 1. Server preparation

Recommended: a single VPS (Hetzner CX22 / DigitalOcean 2GB / similar) running
Ubuntu 22.04 LTS, with Docker installed.

```bash
# install Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx

# install Docker for Mongo + Redis
curl -fsSL https://get.docker.com | sh
sudo systemctl enable docker
```

---

## 2. Mongo + Redis (Docker compose)

Use the same `docker-compose.yml` from the repo root. In production, bind ports to
localhost only (already done), and add a backup volume.

```bash
cd /srv/solarnetwork
docker compose up -d
```

---

## 3. Backend

```bash
sudo mkdir -p /srv/solarnetwork && sudo chown $USER /srv/solarnetwork
cd /srv/solarnetwork
git clone <YOUR-GIT-URL> .   # or: scp -r the source

cd backend
npm ci --omit=dev
mkdir -p uploads             # for signed contract scans
cp .env.example .env         # then edit JWT secrets, Mongo/Redis URLs, CORS_ORIGIN
```

Edit `backend/.env`:

```env
NODE_ENV=production
PORT=4000
MONGO_URI=mongodb://localhost:27017/photovoltaic
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=<openssl rand -hex 32>
JWT_REFRESH_SECRET=<openssl rand -hex 32>
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
CORS_ORIGIN=https://app.your-domain.com
LOG_LEVEL=info
```

Run with PM2 (or systemd — example below):

```bash
sudo npm install -g pm2
pm2 start "npm start" --name solar-api --cwd /srv/solarnetwork/backend
pm2 startup       # follow the printed instruction
pm2 save
```

---

## 4. Frontend

```bash
cd /srv/solarnetwork/frontend
npm ci --omit=dev
echo "VITE_API_BASE=https://app.your-domain.com/v1" > .env
npm run build
# Output is in /srv/solarnetwork/frontend/dist
```

---

## 5. Nginx

`/etc/nginx/sites-available/solarnetwork`:

```nginx
server {
  listen 80;
  server_name app.your-domain.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name app.your-domain.com;

  # Certificate paths (use certbot --nginx for Let's Encrypt)
  ssl_certificate     /etc/letsencrypt/live/app.your-domain.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/app.your-domain.com/privkey.pem;

  client_max_body_size 12m;  # signed-scan uploads cap is 10 MB; leave headroom

  # SPA static files
  root /srv/solarnetwork/frontend/dist;
  index index.html;

  # API
  location /v1/ {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 60s;
  }

  # Uploaded signed scans
  location /uploads/ {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
  }

  # Health check
  location /health {
    proxy_pass http://127.0.0.1:4000/health;
  }

  # SPA fallback — every non-asset path serves index.html
  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/solarnetwork /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d app.your-domain.com
```

---

## 6. Backups

### MongoDB

Daily logical dump:

```bash
# /etc/cron.daily/mongo-backup
#!/bin/bash
TS=$(date +%Y%m%d-%H%M%S)
docker exec pv-mongo mongodump --db photovoltaic --archive=/data/db/dump-$TS.archive --gzip
mv /var/lib/docker/volumes/photovoltaic_mongo_data/_data/dump-$TS.archive /srv/backups/
find /srv/backups -name 'dump-*.archive' -mtime +14 -delete
```

### Uploads

Signed contract scans live under `/srv/solarnetwork/backend/uploads/`. Sync to off-site
storage daily with `rsync` or `restic`.

### Redis

Redis is rebuildable (it's queue state + cache). The `appendonly yes` flag in
`docker-compose.yml` ensures durability across container restarts; further backup is
optional.

---

## 7. Monitoring + logs

Pino structured logs go to stdout. Either:

- Capture via PM2 (`pm2 logs solar-api`) and forward to your aggregator (Loki, Datadog,
  CloudWatch).
- Or run with `node dist/index.js | pino-pretty -l` during ad-hoc debugging.

Health endpoint: `GET /health` returns `{ status: "ok", mongo: "up" | "down" }`. Wire
into your uptime monitor (UptimeRobot, BetterStack, etc.).

---

## 8. Upgrades / migrations

Schemas evolve via Mongoose. There is no migration runner today (intentional — the data
model is additive so far). When adding a destructive migration:

1. Write a one-shot script under `backend/scripts/migrate-<short-name>.ts`
2. Run with `npx tsx backend/scripts/migrate-<name>.ts`
3. Document the irreversible parts in `TECHNICAL-SUMMARY.md`

---

## 9. Hardening checklist

- [ ] Rotate `JWT_*_SECRET` if anyone has seen the dev values
- [ ] Restrict Mongo + Redis container ports to `127.0.0.1` (already done in
      `docker-compose.yml`)
- [ ] Enable Mongo authentication (`docker-compose.yml` runs unauth on localhost — fine
      behind the firewall, fix if exposing)
- [ ] Add Nginx rate-limiting for `/v1/auth/*` to slow brute-force
- [ ] Review the BullMQ scheduler timezone (defaults to UTC — see
      `bonus.worker.ts`)
- [ ] Set `CORS_ORIGIN` to the production domain only
- [ ] Run `npm audit --omit=dev` periodically
- [ ] Configure off-site backups for `uploads/` and Mongo dumps

---

## 10. Smoke test post-deploy

```bash
# health
curl https://app.your-domain.com/health

# login as admin
TOKEN=$(curl -s -X POST https://app.your-domain.com/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"<your-pw>"}' | jq -r .accessToken)

# user list
curl -H "Authorization: Bearer $TOKEN" https://app.your-domain.com/v1/users

# trigger a bonus run for the previous month
curl -X POST -H "Authorization: Bearer $TOKEN" https://app.your-domain.com/v1/bonuses/run
```

If all four return success, the deployment is healthy.
