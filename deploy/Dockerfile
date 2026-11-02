# net-solver API container (bonus 2). Nginx on the host still serves public/ and /health.
# Build (from the project root):
#   docker build -f deploy/Dockerfile -t net-solver:1.0 .
# Run (port bound to host loopback only, so the API is reachable only through Nginx):
#   docker run -d --name net-solver --restart unless-stopped \
#     --env-file .env -p 127.0.0.1:3000:3000 net-solver:1.0
# Check:
#   docker ps                              # STATUS Up ... (healthy)
#   curl -s http://127.0.0.1:3000/api/health
# Stop the systemd service first if it is running: sudo systemctl disable --now net-solver

FROM node:22-alpine

WORKDIR /app
COPY package.json ./
COPY server ./server

# Inside the container it must listen on all container interfaces so -p can reach it;
# the -p 127.0.0.1:... mapping is what keeps it off the public interface of the host.
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server/server.js"]
