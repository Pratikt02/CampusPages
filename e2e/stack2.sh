#!/bin/bash
# Single-origin deployment: ONE server on :4000 serves the API and the built frontend.
pkill -x node; pkill -x mongod; pkill -x geckodriver; pkill -x firefox; sleep 1
rm -rf /tmp/mdb2 && mkdir -p /tmp/mdb2
/tmp/mongoenv/bin/mongod --dbpath /tmp/mdb2 --port 27666 --bind_ip 127.0.0.1 --fork --logpath /tmp/mdb2.log > /dev/null 2>&1
export MONGODB_URI=mongodb://127.0.0.1:27666/campuspages_e2e
cd /home/claude/campuspages/server
node src/scripts/init-db.js > /dev/null 2>&1
CAMPUSPAGES_NEW_PASSWORD='e2e-password-123' node src/scripts/create-user.js --role admin --email admin@e2e.test --name "Ada Admin" > /dev/null 2>&1
CAMPUSPAGES_NEW_PASSWORD='e2e-password-123' node src/scripts/create-user.js --email student@e2e.test --name "Sam Student" > /dev/null 2>&1
LT_ENV=""; [ "$LT" = "1" ] && LT_ENV="API_MAX_PER_MIN=100000000 CONTENT_MAX_PER_MIN=100000000 PUBLIC_MAX_PER_MIN=100000000 MAX_STREAMS_PER_USER=1000 MAX_STREAMS_GLOBAL=100000 MAX_SESSIONS_PER_USER=100 LOGIN_MAX_PER_15MIN=100000"
env $LT_ENV SERVE_CLIENT=true PORT=4000 NODE_ENV=development CLIENT_ORIGINS=http://localhost:4000 LOG_REQUESTS=false setsid nohup node src/server.js > /tmp/e2e/api.log 2>&1 < /dev/null &
sleep 0.5; pgrep -xo node > /tmp/e2e/api.pid
for i in $(seq 1 40); do curl -sf localhost:4000/api/health > /dev/null && break; sleep 0.5; done
cat > /home/claude/campuspages/client/dist/__frame.html <<'HTML'
<!doctype html><meta charset="utf-8"><body style="margin:0;background:#777"><iframe id="f" name="f" style="border:0;background:#fff;display:block"></iframe>
HTML
E2E_BASE=http://localhost:4000 python3 /tmp/e2e/seed.py | tail -1
