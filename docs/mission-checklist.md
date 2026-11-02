# 미션 체크리스트 — "내가 만든 웹사이트를 인터넷에 올려 누구나 쓰게 하기"

> 기준일: 2026-11-02 · 프로젝트: 전개도 해설기 (net-solver) · 사이트: **http://43.201.254.210**
>
> | 표시 | 뜻 |
> |:---:|---|
> | ✅ | **완료** — 실제 AWS(또는 로컬)에서 확인했고 근거가 남아 있음 |
> | 🟡 | **일부 남음** — 대부분 끝났고 스크린샷이나 실습 후 정리만 남음 |
> | ⬜ | **학습자가 직접** — 대신할 수 없는 일 |
>
> 근거 파일: [evidence/aws-resources.txt](evidence/aws-resources.txt) (AWS 쪽 설정), [evidence/ec2-instance-checks.txt](evidence/ec2-instance-checks.txt) (서버 안 점검)

---

## 한눈에 보기

| 구분 | ✅ | 🟡 | ⬜ |
|---|:---:|:---:|:---:|
| A. 요청 작업 (코드·설정) | 13 | 0 | 0 |
| B. 최종 결과물 4종 | 2 | 2 | 0 |
| C. 기능 요구사항 | 19 | 1 | 0 |
| D. 제약 사항 | 7 | 1 | 1 |
| E. 보너스 | 0 | 2 | 0 |

### 🙋 남은 일 (사용자님)
1. **스크린샷 찍기** → `docs/img/`에 저장
   - (필수) 브라우저 주소창에 `http://43.201.254.210/health` → 화면에 `OK` → `external-health.png`
   - (권장) `http://43.201.254.210` 사이트 화면 → `external-browser.png`
   - (권장) IAM → 사용자 `net-solver-lab` → 권한 탭 (관리자 권한 없음) → `iam-user.png`
   - (권장) EC2 → 보안 그룹 `net-solver-sg` → 인바운드 규칙 → `security-group.png`
2. **실습이 끝나면 "정리해 줘"라고 말하기** → 제가 전부 삭제 후 정리 체크리스트를 채움
3. 정리 후 **루트로 Billing 화면 확인** (+ 액세스 키 삭제)

---

## A. 요청 작업 (코드·설정)

| # | 요청 | 상태 | 결과물 / 근거 |
|---|---|:---:|---|
| A1 | Nginx가 `public/` 정적 파일 서빙 | ✅ | [deploy/nginx.conf](../deploy/nginx.conf) `root /opt/net-solver/public`, `location /` |
| A2 | `/health`는 Nginx가 직접 200 `"OK"` | ✅ | `location = /health { return 200 "OK"; }` — Node가 꺼져도 응답 |
| A3 | `/api/`만 127.0.0.1:3000으로 프록시 | ✅ | `location /api/ { proxy_pass http://127.0.0.1:3000; }` |
| A4 | `api/analyze.js` → 외부 의존성 없는 `server/server.js` | ✅ | [server/server.js](../server/server.js): `node:http`, `fs`, `path`만 사용. `package.json`에 dependencies 없음. `api/`, `vercel.json` 삭제 |
| A5 | API 키는 `.env`에서 읽기 | ✅ | server.js 내장 `.env` 로더. [.env.example](../.env.example) 제공 |
| A6 | `.env`를 `.gitignore`에 추가 | ✅ | [.gitignore](../.gitignore): `.env`, `.env.*`, `*.pem` (`.env.example`은 예외). `.dockerignore`에도 추가 |
| A7 | `client_max_body_size 10m` | ✅ | nginx.conf. Node도 `MAX_BODY = 10MB`로 맞춤 |
| A8 | `proxy_read_timeout 300s` | ✅ | nginx.conf. Node의 외부 API 제한은 280s로 그보다 짧게 |
| A9 | `deploy/`에 nginx.conf, systemd, Dockerfile | ✅ | [nginx.conf](../deploy/nginx.conf), [net-solver.service](../deploy/net-solver.service), [Dockerfile](../deploy/Dockerfile) + 덤으로 [setup-ec2.sh](../deploy/setup-ec2.sh) |
| A10 | Docker는 127.0.0.1:3000에만 바인딩 | ✅ | `-p 127.0.0.1:3000:3000` (Dockerfile 주석, README) |
| A11 | `docs/troubleshooting.md`, `cleanup-checklist.md` 템플릿 | ✅ | [troubleshooting.md](troubleshooting.md), [cleanup-checklist.md](cleanup-checklist.md) |
| A12 | `docs/iam-policy.json` 최소 권한 (EC2/VPC/SG/키페어/EIP, 서울 한정) | ✅ | [iam-policy.json](iam-policy.json): 모든 Allow에 `aws:RequestedRegion = ap-northeast-2`, 서울 외 Deny, micro 외 인스턴스 Deny, 30GiB 초과 볼륨 Deny |
| — | CLAUDE.md 갱신 | ✅ | [CLAUDE.md](../CLAUDE.md) |

### 로컬 실행 확인 결과 (2026-11-02)

Node 24.18.1(Cursor 내장)과 Node 20.15.1(RStudio 내장)로 실행.

| 확인 | 결과 |
|---|---|
| `GET /health` (`--static`) | `200 OK` ✅ |
| `GET /api/health` | `200 {"ok":true,"keyConfigured":false}` ✅ (`.env` 넣었을 때 `true` 확인) |
| `GET /` , `/engine.js` | 200 ✅ |
| 예시 문제 ("예시 문제로 보기") | 정답 **③** 표시, 3D 모형 렌더링, 콘솔 오류 0건 ✅ |
| 키 없이 `POST /api/analyze` | `500 not_configured` ✅ |
| 잘못된 접근 코드 / 깨진 JSON / 잘못된 형식 | 401 / 400 / 400 ✅ |
| base64 4.1MB / 본문 11MB | 413 / 413 ✅ (11MB가 연결을 끊던 버그를 찾아 수정함) |
| 가짜 키로 실제 API 호출 | Anthropic 401 → `502 upstream_error`, 로그 남음 ✅ |
| `/../.env` 경로 조작 | 404 ✅ |
| `--static` 없이 `/health` | 404 (운영처럼 Node는 `/api/`만 처리) ✅ |

> 로컬에 없던 Nginx·systemd는 EC2에서 확인 완료 (`nginx -t` 통과, `nginx`·`net-solver` 모두 active). Docker는 보너스라 아직 미실행.

---

## B. 최종 결과물 4종

| # | 결과물 | 제출 규격 | 상태 | 근거 / 남은 일 |
|---|---|---|:---:|---|
| B1 | 아키텍처 다이어그램 | `docs/architecture.(png\|pdf)` 1개. VPC·Subnet·IGW·EC2·SG + 외부→서비스 흐름 | ✅ | [architecture.png](architecture.png): 실제 IP·IGW ID 반영 |
| B2 | 외부 접속 증빙 | README에 방식(A/B) + URL/IP, 스크린샷 1장+ | 🟡 | README에 **(B) `http://43.201.254.210/health`** 기재, 외부 200 OK 확인 완료 → **스크린샷만 남음** |
| B3 | 트러블슈팅 보고서 | `docs/troubleshooting.(md\|pdf)`, 6단계 최소 1건 | ✅ | [troubleshooting.md](troubleshooting.md): **실제 사례 2건** (설치 직후 502, 부팅 직후 404) |
| B4 | 리소스 정리 체크리스트 | `docs/cleanup-checklist.md` (+선택 Billing 스크린샷) | 🟡 | 생성한 리소스 ID 전부 기록 완료 → **실습 끝나고 삭제 후 근거 채우기** |

---

## C. 기능 요구사항

### 네트워크

| 요구사항 | 상태 | 근거 |
|---|:---:|---|
| VPC 1개 | ✅ | `vpc-0ca361fd25c910867` `10.0.0.0/16` |
| Public Subnet 1개 | ✅ | `subnet-030d49d1a95fe9ff7` `10.0.1.0/24` ap-northeast-2a, 퍼블릭 IP 자동 할당 `True` |
| IGW를 VPC에 연결 | ✅ | `igw-038259e638b1cc5bf` 상태 `available`(attached) |
| 라우팅 테이블 `0.0.0.0/0 → igw` | ✅ | `rtb-0478e3664a0482fcc`: `0.0.0.0/0 → igw-038259e638b1cc5bf active`, 서브넷 연결 `associated` |
| 인스턴스 아웃바운드 (`curl https://example.com`) | ✅ | 서버 안에서 `200` |

### 컴퓨트·웹 서버

| 요구사항 | 상태 | 근거 |
|---|:---:|---|
| Public Subnet에 EC2 1대 | ✅ | `i-00eb66dc541b0a140` t3.micro, Ubuntu 24.04, 프라이빗 `10.0.1.206`, 퍼블릭 `43.201.254.210` |
| SSH 접속 | ✅ | `ssh -i ~/.ssh/net-solver-key.pem ubuntu@43.201.254.210` 접속 성공 (점검 명령 전부 SSH로 실행) |
| Nginx 설치·실행 | ✅ | `systemctl is-active nginx` → `active`, `nginx -t` 통과 |
| `curl http://localhost` → 200 | ✅ | 서버 안에서 `200` |

### 보안 그룹 (`sg-0067eb94c6bf9da5c`)

| 요구사항 | 상태 | 근거 |
|---|:---:|---|
| 필요한 포트만 | ✅ | 인바운드 딱 2줄: 80, 22. 외부에서 3000 접속 시 **시간 초과(차단)** 확인 |
| 80 ← 0.0.0.0/0 | ✅ | `tcp 80 80 0.0.0.0/0` |
| 22 ← 내 IP/32 | ✅ | `tcp 22 22 121.135.181.35/32` |
| 0.0.0.0/0 전체 포트 규칙 없음 | ✅ | 규칙 목록에 없음 |

### IAM 최소 권한

| 요구사항 | 상태 | 근거 |
|---|:---:|---|
| IAM 사용자/Role 1개 사용 | ✅ | 모든 작업을 `arn:aws:iam::<account>:user/net-solver-lab`로 실행 |
| EC2/VPC/SG 범위로 제한 | ✅ | [iam-policy.json](iam-policy.json) 연결. 다른 리전(us-east-1) 호출 → `explicit deny` 확인 |
| S3/RDS 등 무관한 서비스 권한 없음 | ✅ | 정책에 `ec2:*` 액션만 존재 |
| AdministratorAccess 미부여 | ✅ | 사용자 생성 시 `net-solver-lab-policy`만 연결 (권한 탭 스크린샷 권장) |

### 외부 접속 검증 · 과금 방지

| 요구사항 | 상태 | 근거 |
|---|:---:|---|
| (A) 또는 (B) 중 1개 증명 | ✅ | (B) 외부에서 `GET /health` → `200 OK` / `OK`. (A) 사이트·예시 문제(정답 ③)도 동작 |
| README에 방식 명시 | ✅ | README "외부 접속 검증" 표 |
| 정리 + 체크리스트 근거 | 🟡 | 리소스 ID 기록 완료, **삭제는 실습 종료 후** |

---

## D. 제약 사항

| 제약 | 상태 | 비고 |
|---|:---:|---|
| 프리 티어 범위 | ✅ | 무료 플랜 + 제로 지출 예산 알림. t3.micro(프리 티어 대상), 8GiB, NAT/ALB/RDS/EIP 없음 |
| 루트 계정 사용 금지 | ✅ | 루트는 IAM 사용자 생성·예산 설정에만 사용, 리소스 작업은 전부 IAM 사용자 |
| 실습 후 전부 삭제 | 🟡 | 실습 종료 후 진행 |
| 서울 리전 | ✅ | 모든 리소스 ap-northeast-2, 다른 리전은 정책이 차단 |
| t2/t3.micro, Ubuntu/Amazon Linux, EBS 8~10GiB | ✅ | t3.micro / Ubuntu 24.04 / 8GiB gp3 |
| 키 페어 1개 안전 보관 | ✅ | `net-solver-key` 1개, `~/.ssh`에 본인만 읽기 권한, 저장소 밖 |
| SSH 소스 제한 유지 | ✅ | `121.135.181.35/32` (집 IP가 바뀌면 SSH만 막힘 → 규칙 수정) |
| API 키 노출 금지 (프로젝트 고유) | ✅ | `.env` git 제외, 서버에도 키 없음(분석 기능은 꺼진 상태) |
| Billing 확인 (권장) | ⬜ | 정리 후 루트로 확인 |

---

## E. 보너스 (선택)

| 보너스 | 상태 | 비고 |
|---|:---:|---|
| 1. HTTPS (Let's Encrypt) | 🟡 | 도메인 필요. `sudo apt install certbot python3-certbot-nginx && sudo certbot --nginx -d <도메인>` + SG에 443 추가 |
| 2. Docker 배포 | 🟡 | Dockerfile + README에 이미지명·실행 방식·포트 매핑 표 준비. `docker ps`, 외부 접속 스크린샷 2장 필요 |

---

## 제출 직전 최종 점검

- [x] `docs/architecture.png` — 실제 구성(IP·IGW ID)과 일치
- [x] README에 실제 IP와 선택 방식 (B) 기재
- [ ] `docs/img/`에 외부 접속 스크린샷 (+보너스 시 `docker ps`)
- [x] `docs/troubleshooting.md`에 **실제 사례** 2건, 6단계 모두 채움
- [ ] `docs/cleanup-checklist.md` 정리 근거 채움, EC2·EBS·EIP·IGW·VPC 삭제 확인
- [x] `git status`에 `.env`, `.pem`이 안 보임
- [ ] Billing 확인, 실습용 액세스 키 삭제
- [ ] `docs/study-guide.md`의 "말로 설명하기" 5문항을 소리 내어 답해 봄
