#!/bin/bash
# Brings up MongoDB + API + production preview, creates users with the real CLI, seeds through the real admin API.
rm -rf /tmp/mdb2 && mkdir -p /tmp/mdb2
/tmp/mongoenv/bin/mongod --dbpath /tmp/mdb2 --port 27666 --bind_ip 127.0.0.1 --fork --logpath /tmp/mdb2.log > /dev/null 2>&1
export MONGODB_URI=mongodb://127.0.0.1:27666/campuspages_e2e
cd /home/claude/campuspages/server
CAMPUSPAGES_NEW_PASSWORD='e2e-password-123' node src/scripts/create-user.js --role admin --email admin@e2e.test --name "Ada Admin" > /dev/null 2>&1
CAMPUSPAGES_NEW_PASSWORD='e2e-password-123' node src/scripts/create-user.js --email student@e2e.test --name "Sam Student" > /dev/null 2>&1
PORT=4000 NODE_ENV=development CLIENT_ORIGINS=http://localhost:5173 LOGIN_MAX_PER_15MIN=5000 LOGIN_MAX_PER_ACCOUNT_15MIN=5000 API_MAX_PER_MIN=20000 CONTENT_MAX_PER_MIN=20000 MAX_SESSIONS_PER_USER=100 LOG_REQUESTS=false \
  setsid nohup node src/server.js > /tmp/e2e/api.log 2>&1 < /dev/null &
if [ "$CSP" = "1" ]; then setsid nohup node /tmp/e2e/csp_server.mjs > /tmp/e2e/preview.log 2>&1 < /dev/null &
else cd /home/claude/campuspages/client && setsid nohup npx vite preview --port 5173 --strictPort > /tmp/e2e/preview.log 2>&1 < /dev/null &
fi
for i in $(seq 1 40); do curl -sf localhost:5173/api/health > /dev/null && break; sleep 0.5; done
cat > /home/claude/campuspages/client/dist/__frame.html <<'HTML'
<!doctype html><meta charset="utf-8"><body style="margin:0;background:#777"><iframe id="f" name="f" style="border:0;background:#fff;display:block"></iframe>
HTML
python3 /tmp/e2e/seed.py | tail -1
