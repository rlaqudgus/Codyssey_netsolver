# 트러블슈팅 보고서

> 프로젝트: 전개도 해설기 (net-solver) · EC2 1대 배포 (ap-northeast-2)
> 작성자: `________` · 작성일: 2026-11-02
> 배포 방식: AWS CLI로 리소스 생성 → EC2 user-data(첫 부팅 스크립트)가 GitHub에서 코드를 받아 `deploy/setup-ec2.sh` 실행
>
> **작성 규칙**: 실제로 겪은 오류만 적는다. 각 사례는 **증상 → 가설 → 검증 → 조치 → 결과 → 재발 방지** 6단계를 모두 채우고,
> "검증" 칸에는 **로그·명령 출력 같은 근거**를 붙인다. (제출 최소 1건)

---

## 사례 1. 설치 직후 `/api/health`가 502 Bad Gateway

| 항목 | 내용 |
|---|---|
| **발생 시각** | 2026-11-02 14:54 KST (05:54 UTC) |
| **증상** | 설치 스크립트 마지막 점검에서 `/health`는 `OK (200)`인데 `http://localhost/api/health`만 **`502 Bad Gateway`**. Nginx는 살아 있고 그 뒤(Node)로 넘기는 구간만 실패 |
| **원인 가설** | ① Node 서비스(`net-solver`)가 시작에 실패했다 (코드 오류, `.env` 권한 등) ② Node가 3000이 아닌 다른 포트/주소에서 듣고 있다 ③ Node는 정상인데 **아직 시작되기 전에** 점검이 실행됐다 (타이밍) |
| **검증 방법** | SSH로 접속해 아래를 확인 (근거 참고). `systemctl is-active net-solver` → `active` 이므로 ① 기각. `ss -tlnp` → `127.0.0.1:3000`에서 node가 LISTEN 이므로 ② 기각. 시각 비교: Nginx error.log의 `connect() failed (111: Connection refused)` 는 **05:54:05**, Node 로그의 `listening on http://127.0.0.1:3000` 은 **05:54:06** → 점검이 Node보다 1초 먼저 실행됨. 다시 요청하니 200 → **③ 확정** |
| **조치 내용** | `deploy/setup-ec2.sh`에서 `systemctl enable --now net-solver` 직후 바로 점검하던 것을, `/api/health`가 응답할 때까지 최대 30초 기다린 뒤 점검하도록 수정 (`for ... curl -fs ... && break; sleep 1`) |
| **결과** | 같은 요청 `curl http://localhost/api/health` → `{"ok":true,"keyConfigured":false}` **200**. 외부에서 `http://43.201.254.210/api/health`도 200 |
| **재발 방지** | ① 스크립트에 "준비될 때까지 대기" 반영 (위 조치) ② **systemctl의 `active` ≠ 요청을 받을 준비 완료**라는 점을 체크리스트에 기록: 서비스 재시작 직후 502가 보이면 몇 초 뒤 재시도 후 판단 ③ 502를 보면 Nginx error.log의 `upstream` 줄부터 확인 |

**근거 (로그/명령 출력)**

```text
# 설치 로그 (/var/log/net-solver-setup.log) 마지막 점검
OK  (200)
<html><head><title>502 Bad Gateway</title></head> ...  (502)
outbound example.com -> 200

# sudo tail /var/log/nginx/net-solver.error.log
2026/11/02 05:54:05 [error] 3150#3150: *3 connect() failed (111: Connection refused) while connecting to upstream,
  client: ::1, server: _, request: "GET /api/health HTTP/1.1", upstream: "http://127.0.0.1:3000/api/health", host: "localhost"

# journalctl -u net-solver
Nov 02 05:54:05 ip-10-0-1-206 systemd[1]: Started net-solver.service - net-solver API (Node, behind Nginx).
Nov 02 05:54:06 ip-10-0-1-206 node[3252]: net-solver API listening on http://127.0.0.1:3000 (model claude-opus-5-5, .env not found, key MISSING)
Nov 02 05:54:14 ip-10-0-1-206 node[3252]: GET /api/health 200 16ms ip=::1

# systemctl is-active net-solver  /  sudo ss -tlnp | grep 3000
active
LISTEN 0  511  127.0.0.1:3000  0.0.0.0:*  users:(("node",pid=3252,fd=21))

# 재요청
$ curl -s -w "  (%{http_code})\n" http://localhost/api/health
{"ok":true,"keyConfigured":false}  (200)
```

**스크린샷**: `docs/img/ts1-before.png`, `docs/img/ts1-after.png` (선택)

---

## 사례 2. 인스턴스 시작 직후 외부 `/health`가 404 Not Found

| 항목 | 내용 |
|---|---|
| **발생 시각** | 2026-11-02 14:53 KST |
| **증상** | EC2가 `running`이 된 직후 내 PC에서 `curl -i http://43.201.254.210/health` → **`404 Not Found`** (`Server: nginx/1.24.0 (Ubuntu)`). 기대값은 `200 OK` |
| **원인 가설** | ① 우리 Nginx 설정(`deploy/nginx.conf`)이 적용되지 않고 Ubuntu **기본 사이트**가 응답 중이다 ② 첫 부팅 설치 스크립트가 아직 진행 중이다 ③ 설치 스크립트가 중간에 실패했다 |
| **검증 방법** | 404 응답이 왔다는 것 자체로 **네트워크(IGW·라우팅·SG 80)는 정상**이라고 판단 (막혔다면 시간 초과). 응답 헤더에 버전(`nginx/1.24.0`)이 노출 → 우리 설정의 `server_tokens off`가 아직 적용 전 → ① 유력. SSH 접속 후 `ls /etc/nginx/sites-enabled` → `default`만 있음, `systemctl is-active net-solver` → `inactive`, `cloud-init status` → **`running`**, 설치 로그 마지막 줄이 NodeSource 설치 중 → ② 확정, ③ 기각 |
| **조치 내용** | 설정을 고치지 않고 `cloud-init status --wait`로 첫 부팅 스크립트가 끝날 때까지 대기 |
| **결과** | `status: done`, 로그 끝 `SETUP_DONE`. 외부에서 `/health` → **`200 OK` / `OK`**, `Server: nginx` (버전 숨김) |
| **재발 방지** | 인스턴스 `running` ≠ 서비스 준비 완료. 자동 설치를 쓰면 외부 검증 전에 `cloud-init status --wait`(또는 로그의 `SETUP_DONE`)부터 확인한다. "시간 초과 vs 404 vs 502"로 어느 계층 문제인지 먼저 나눈다 (부록 A) |

**근거 (로그/명령 출력)**

```text
# 내 PC, 14:53:38
HTTP/1.1 404 Not Found
Server: nginx/1.24.0 (Ubuntu)

# EC2 안
$ ls /etc/nginx/sites-enabled
default
$ systemctl is-active nginx net-solver
active
inactive
$ cloud-init status
status: running
$ tail /var/log/net-solver-setup.log
2026-11-02 05:53:42 - Installing pre-requisites      (NodeSource 설치 진행 중)

# 대기 후
$ cloud-init status --wait; cloud-init status
status: done
$ curl -s -I http://43.201.254.210/health | head -2     (내 PC)
HTTP/1.1 200 OK
Server: nginx
```

---

## 사례 3. 내 브라우저에서만 접속 시간 초과 (`ERR_CONNECTION_TIMED_OUT`)

| 항목 | 내용 |
|---|---|
| **발생 시각** | 2026-11-02 15:05 KST 무렵 |
| **증상** | 크롬 주소창에 `43.201.254.210/health`(앞에 `http://` 없이)를 입력 → **"사이트에 연결할 수 없음 / 응답하는 데 시간이 너무 오래 걸립니다 / ERR_CONNECTION_TIMED_OUT"**. 같은 시각 `curl`로는 정상이었음 |
| **원인 가설** | ① 인스턴스가 중지되었거나 퍼블릭 IP가 바뀌었다 ② 보안 그룹/네트워크가 내 PC의 접속을 막는다 ③ 브라우저가 주소를 **`https://`(443 포트)로 자동 변환**했는데, SG에는 443이 없어 패킷이 조용히 버려졌다 |
| **검증 방법** | `aws ec2 describe-instances` → `running`, IP `43.201.254.210` 그대로 → ① 기각. 같은 PC에서 `curl http://43.201.254.210/health` → **200 (0.055초)** → 경로와 SG 80은 정상, ② 기각. `curl https://43.201.254.210/health` → **응답 없음(exit 28, 시간 초과)**. SG 인바운드는 80·22뿐 → 443 요청은 SG가 응답 없이 버림 → 증상(시간 초과)과 일치, **③ 확정**. 근거: 최신 크롬은 스킴 없이 입력한 주소를 먼저 HTTPS로 시도함 |
| **조치 내용** | 주소를 **`http://43.201.254.210/health`로 스킴까지 명시**해서 입력. 크롬의 "안전하지 않음" 경고에서 사이트로 계속 이동 (비밀번호 입력이 없는 페이지라 위험 낮음). SG에 443을 여는 것은 하지 않음: 열어도 Nginx에 인증서가 없어 오류만 바뀌고, 필요 없는 포트를 여는 것은 최소 허용 원칙에 어긋남 |
| **결과** | 브라우저에 **`OK`** 표시 (주소창 "주의 요함" = HTTP 접속). 스크린샷: [img/external-health.png](img/external-health.png) |
| **재발 방지** | ① README 접속 안내에 **`http://`를 반드시 붙이라**고 명시 ② "시간 초과"면 먼저 **어느 포트로 갔는지**(http 80 / https 443) 확인 ③ 장기적으로는 도메인 + Let's Encrypt로 HTTPS 적용(보너스 1) 후 SG에 443 추가 |

**근거 (로그/명령 출력)**

```text
# 브라우저 (스킴 없이 입력)
사이트에 연결할 수 없음 — 43.201.254.210에서 응답하는 데 시간이 너무 오래 걸립니다.  ERR_CONNECTION_TIMED_OUT

# 같은 PC에서 비교
$ curl -s -o /dev/null -w '%{http_code} (%{time_total}s)\n' http://43.201.254.210/health
200 (0.055362s)
$ curl -s -m 8 https://43.201.254.210/health
(응답 없음, curl exit 28 = timeout)

# 인스턴스 상태
$ aws ec2 describe-instances --instance-ids i-00eb66dc541b0a140 --query "...[State.Name,PublicIpAddress]"
running   43.201.254.210

# 보안 그룹 인바운드 (443 없음)
tcp 80 80 0.0.0.0/0
tcp 22 22 121.135.181.35/32
```

**스크린샷**: [img/external-health.png](img/external-health.png) (조치 후)

---

## 사례 4. Gemini 분석 요청이 응답 없이 시간 초과

| 항목 | 내용 |
|---|---|
| **발생 시각** | 2026-11-02 15:45 KST |
| **증상** | 사진 분석용 AI를 Gemini로 바꾸고(`AI_PROVIDER=gemini`, 기본 모델 `gemini-3.8-flash`) EC2에서 테스트 요청 → **90초 동안 0바이트 수신 후 `curl: (28) Operation timed out`**. 서버 `/api/health`는 `provider: gemini, keyConfigured: true`로 정상 |
| **원인 가설** | ① EC2에서 Google로 나가는 통신이 막혔다 (SG 아웃바운드·라우팅) ② API 키가 틀렸거나 권한이 없다 ③ 요청 형식(JSON 필드)이 잘못됐다 ④ **해당 모델 자체가 (무료 구간에서) 응답하지 않는다** |
| **검증 방법** | EC2에서 같은 호스트로 **모델 정보 조회(GET)** → `200`, 연결 0.018초 → ① 기각. 같은 키로 조회가 200 → ② 기각. **내 PC에서도** 같은 생성 요청이 120초 시간 초과 → EC2 문제가 아님. 형식을 그대로 두고 **모델만 바꿔** 비교: `gemini-3.6-flash` 200 (2.3초), `gemini-3.5-flash-lite` 200 (1.3초), `gemini-2.5-flash` 404 ("no longer available to new users") → 형식은 정상이라 ③ 기각, **④ 확정** (가격표에는 무료로 나와 있지만 실제로는 응답 없음) |
| **조치 내용** | 기본 모델을 `gemini-3.6-flash`로 변경 (`server.js`의 `GEMINI_MODEL` 기본값, `.env.example`, README). 이미지 포함 요청도 200, `finishReason: STOP` (9.4초) 확인 |
| **결과** | EC2 서버 재배포 후 `/api/health` → `gemini-3.6-flash`, 실제 분석 경로(`/api/analyze`) 200 |
| **재발 방지** | ① 모델은 문서만 믿지 말고 **작은 요청으로 실측**한 뒤 기본값으로 정한다 ② "시간 초과"는 **네트워크 → 인증 → 형식 → 모델** 순서로 하나씩 바꿔 가며 좁힌다 (한 번에 하나만 변경) ③ 모델은 `GEMINI_MODEL` 환경 변수로 코드 수정 없이 바꿀 수 있게 유지 |

**근거 (로그/명령 출력)**

```text
# EC2, gemini-3.8-flash generateContent
http 000 in 90.002398s
curl: (28) Operation timed out after 90002 milliseconds with 0 bytes received

# EC2 → 같은 호스트 모델 정보 조회 (네트워크·키 정상)
metadata GET (IPv4): http 200 connect 0.017976s total 0.167566s

# 내 PC에서도 동일 (EC2 문제 아님)
curl: (28) Operation timed out after 120007 milliseconds with 0 bytes received

# 같은 요청, 모델만 변경
gemini-3.6-flash         http 200 2.341696s
gemini-3.5-flash-lite    http 200 1.303413s
gemini-2.5-flash         http 404  "This model models/gemini-2.5-flash is no longer available to new users."

# gemini-3.6-flash + 이미지 + JSON 모드
http 200 in 9.359839s   "finishReason": "STOP"
```

---

## 부록 A. 증상별 원인 찾기 (이 구조에서 자주 생기는 것)

외부 요청은 **인터넷 → IGW → 라우팅 테이블 → 보안 그룹 → EC2 (Nginx :80) → /api/만 Node :3000** 순서로 지나간다.
**어느 단계에서 끊겼는지**를 먼저 좁히면 원인이 빨리 나온다.

| 증상 | 어디서 끊겼나 | 먼저 볼 것 | 흔한 원인 |
|---|---|---|---|
| `ssh` / `curl`이 **응답 없이 시간 초과** | 네트워크 (Nginx까지 못 옴) | SG 인바운드, 라우팅 테이블, 퍼블릭 IP | SG에 80/22 없음, 22의 소스가 바뀐 내 IP와 다름, `0.0.0.0/0 → igw` 경로 없음, 퍼블릭 IP 미할당 |
| 브라우저만 **시간 초과**, `curl http://`는 정상 | 브라우저가 https(443)로 감 | 주소창 스킴, `curl https://...` | SG에 443 없음 + 크롬의 HTTPS 자동 시도 → `http://` 명시 (사례 3) |
| `Connection refused` | EC2까지 왔지만 80을 듣는 프로세스 없음 | `sudo systemctl status nginx`, `sudo ss -tlnp` | Nginx 미설치/중지, 설정 오류로 시작 실패 |
| `/health`는 OK, `/api/...`가 **502 Bad Gateway** | Nginx → Node 구간 | `journalctl -u net-solver -n 50`, `curl 127.0.0.1:3000/api/health` | Node 서비스 중지, 포트 불일치, `.env` 권한 문제로 크래시 |
| 분석 중 **504 Gateway Time-out** | Nginx가 Node 응답을 기다리다 포기 | Nginx error.log의 `upstream timed out` | `proxy_read_timeout`이 기본 60s |
| 업로드 시 **413 Request Entity Too Large** | Nginx 본문 크기 제한 | Nginx error.log의 `client intended to send too large body` | `client_max_body_size` 기본 1m |
| `/api/analyze`가 **500 not_configured** | Node는 정상, 키 없음 | `curl 127.0.0.1:3000/api/health` → `keyConfigured:false` | `.env` 없음/경로 다름/오타 |
| 인스턴스에서 `curl https://example.com` 실패 | 아웃바운드 | 라우팅 테이블, SG 아웃바운드, NACL | IGW 미연결, 아웃바운드 규칙 삭제 |
| 콘솔에서 `You are not authorized to perform: ec2:XXX` | IAM | 오류 메시지의 액션 이름, 리전 | 정책에 액션 없음, 서울 외 리전 선택 |

## 부록 B. 진단 명령 모음

```bash
# (내 PC) 바깥에서
curl -v http://<퍼블릭IP>/health
curl -s https://checkip.amazonaws.com         # 지금 내 공인 IP: SG의 22 소스와 같은지 확인

# (EC2 안) 위에서 아래로
curl -s -o /dev/null -w '%{http_code}\n' http://localhost/
curl -s http://localhost/health
curl -s http://127.0.0.1:3000/api/health
sudo ss -tlnp                                  # 80은 0.0.0.0, 3000은 127.0.0.1 이어야 정상
sudo nginx -t
sudo systemctl status nginx net-solver --no-pager
sudo tail -n 50 /var/log/nginx/net-solver.error.log
journalctl -u net-solver -n 50 --no-pager
curl -s -o /dev/null -w '%{http_code}\n' https://example.com   # 아웃바운드
docker ps; docker logs net-solver --tail 50    # Docker로 띄운 경우
```
