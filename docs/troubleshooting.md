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

## 부록 A. 증상별 원인 찾기 (이 구조에서 자주 생기는 것)

외부 요청은 **인터넷 → IGW → 라우팅 테이블 → 보안 그룹 → EC2 (Nginx :80) → /api/만 Node :3000** 순서로 지나간다.
**어느 단계에서 끊겼는지**를 먼저 좁히면 원인이 빨리 나온다.

| 증상 | 어디서 끊겼나 | 먼저 볼 것 | 흔한 원인 |
|---|---|---|---|
| `ssh` / `curl`이 **응답 없이 시간 초과** | 네트워크 (Nginx까지 못 옴) | SG 인바운드, 라우팅 테이블, 퍼블릭 IP | SG에 80/22 없음, 22의 소스가 바뀐 내 IP와 다름, `0.0.0.0/0 → igw` 경로 없음, 퍼블릭 IP 미할당 |
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
