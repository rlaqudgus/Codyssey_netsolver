# Project notes for Claude Code

전개도(polyhedron net) 문제 사진 → 3D 풀이 웹사이트. Plain static frontend + one dependency-free Node HTTP server, deployed on a single AWS EC2 instance (ap-northeast-2) behind Nginx. No build step, no framework, no npm dependencies.

## Layout
- `public/` static frontend (`index.html`, `engine.js`), served by Nginx on EC2.
- `server/server.js` Node `http` server, `/api/analyze` + `/api/health`. Reads `.env` itself (tiny loader, real env wins; `ENV_FILE` overrides the path). Listens on `HOST`/`PORT`, default `127.0.0.1:3000`.
- `server/prompt.js` instruction sent to Claude with the photo.
- `deploy/` `nginx.conf`, `net-solver.service` (systemd), `Dockerfile` (bonus; run with `-p 127.0.0.1:3000:3000`), `setup-ec2.sh`.
- `docs/` mission deliverables: `architecture.png` (+ `architecture.py` source), `troubleshooting.md`, `cleanup-checklist.md`, `iam-policy.json`, `mission-checklist.md`, `study-guide.md`.
- `.env` is git-ignored; `.env.example` lists the variables.

## Request path on EC2
Internet → IGW → SG (80 open, 22 my IP only) → Nginx :80
- `/health` → Nginx returns `200 "OK"` itself (no Node involved).
- `/api/*` → `proxy_pass http://127.0.0.1:3000` (`proxy_read_timeout 300s`, `client_max_body_size 10m`).
- everything else → files from `/opt/net-solver/public`.
Port 3000 is never opened in the SG and Node binds to loopback. Node trusts `X-Real-IP` for rate limiting because only Nginx can reach it.

## Local run
`node server/server.js --static` (or `npm run dev`) also serves `public/` and `/health` so the site works without Nginx at http://127.0.0.1:3000. Without `--static` it serves only `/api/*`, as in production.

## Data flow
1. `public/index.html` resizes the photo to ≤1568px JPEG and POSTs `{image(base64), mediaType, memo, code}` to `/api/analyze`.
2. `server/server.js` validates (access code, rate limit, ≤4MB base64, ≤10MB body, media type), calls the Anthropic Messages API with the image + `server/prompt.js` (280s timeout, under Nginx's 300s), extracts one JSON object, returns `{data}` or `{error: code}`. Error codes map to Korean messages in `index.html` (`ERR`).
3. `public/engine.js` (`window.NetEngine.build(data)`) normalizes faces to CCW, builds the fold tree, folds by the solid's dihedral angle, paints the net texture, and for every option enumerates face/rotation correspondences on the folded solid, renders the "real" view and pixel-compares it with the option drawing. Lowest difference = can be made. This computed answer is primary; the model's own `answer` is only cross-checked.
4. three.js r128 (CDN) renders the folding model; option cards rotate the model to the matched configuration.

## JSON contract (from the model)
`solid` (tetrahedron|cube|octahedron), `questionType` (can|cannot), `net.faces[{id, lattice[[i,j]], pattern[]}]`, `options[{label, faces[{pts[[x,y]], pattern[]}], verdict, reason}]`, `answer`, `principle[]`, `confidence`, `readingNotes`.
Pattern primitives use weights over the face's own vertex list: `poly`, `circle`, `line`, `text`. See `server/prompt.js`.
Triangle lattice point [i,j] = (i + j/2, j·√3/2); cube lattice = integer grid. y is up.

## Keep in sync
- Body limit: `client_max_body_size` (nginx.conf) ↔ `MAX_BODY` (server.js).
- Timeout: `proxy_read_timeout 300s` (nginx.conf) > `UPSTREAM_TIMEOUT` 280s (server.js).
- App path `/opt/net-solver` appears in nginx.conf, net-solver.service, setup-ec2.sh.

## Ideas / TODO
- Streaming response so long analyses show progress.
- Let users correct the recognized net in the UI (tap a face, move its black mark) instead of a text memo.
- More solids (rectangular box, prisms) and dice-pip orientation.
- HTTPS (bonus 1): certbot `--nginx` once a domain points at the Elastic IP.
- Test fixtures: `public/index.html` contains the 04번 example (`EXAMPLE`, "예시 문제로 보기") — expected answer ③. It runs fully client-side, no API key needed.
