# 미션 체크리스트 — "내가 만든 웹사이트를 인터넷에 올려 누구나 쓰게 하기"

> 기준일: 2026-11-02 · 프로젝트: 전개도 해설기 (net-solver)
>
> | 표시 | 뜻 |
> |:---:|---|
> | ✅ | **완료** — 저장소 안에서 끝났고 로컬에서 확인함 |
> | 🟡 | **준비 완료, AWS 작업 필요** — 파일·명령은 준비됨. 실제 AWS에서 실행하고 증빙을 채워야 함 |
> | ⬜ | **학습자가 직접** — 콘솔 작업, 스크린샷 등 대신할 수 없는 일 |

---

## 한눈에 보기

| 구분 | ✅ | 🟡 | ⬜ |
|---|:---:|:---:|:---:|
| A. 요청 작업 (코드·설정) | 13 | 0 | 0 |
| B. 최종 결과물 4종 | 1 | 3 | 0 |
| C. 기능 요구사항 | 4 | 13 | 3 |
| D. 제약 사항 | 2 | 3 | 4 |
| E. 보너스 | 0 | 2 | 0 |

**남은 핵심 일**: AWS에 실제로 만들기 → IP 적기 → 스크린샷 4~6장 → 트러블슈팅 실제 사례 1건 → 정리 후 체크리스트 채우기.

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

> ⚠️ 실제 Nginx·systemd·Docker는 Windows에 없어 **로컬에서 돌려 보지 못했다**. EC2에서 `sudo nginx -t`, `systemctl status`, `docker build`로 첫 확인 필요.

---

## B. 최종 결과물 4종

| # | 결과물 | 제출 규격 | 상태 | 남은 일 |
|---|---|---|:---:|---|
| B1 | 아키텍처 다이어그램 | `docs/architecture.(png\|pdf)` 1개. VPC·Subnet·IGW·EC2·SG + 외부→서비스 흐름 | ✅ | [docs/architecture.png](architecture.png) 완성. 실제 CIDR/IP가 다르면 [architecture.py](architecture.py) 고쳐 다시 그리기 |
| B2 | 외부 접속 증빙 | README에 방식(A/B) + URL/IP, 스크린샷 1장+ | 🟡 | README에 **(B) /health** 선택 기재됨 → `__.__.__.__`를 실제 IP로, `docs/img/external-health.png` 추가 |
| B3 | 트러블슈팅 보고서 | `docs/troubleshooting.(md\|pdf)`, 6단계 최소 1건 | 🟡 | 템플릿 + 증상별 표 준비됨 → **실제 겪은 사례 1건** 채우기 |
| B4 | 리소스 정리 체크리스트 | `docs/cleanup-checklist.md` (+선택 Billing 스크린샷) | 🟡 | 추적표·순서·확인 명령 준비됨 → 정리 후 ID·근거 채우기 |

---

## C. 기능 요구사항

### 네트워크

| 요구사항 | 상태 | 어떻게 확인하나 |
|---|:---:|---|
| VPC 1개 | 🟡 | 콘솔 VPC 목록 (예: `10.0.0.0/16`, 태그 `Project=net-solver`) |
| Public Subnet 1개 | 🟡 | 서브넷 `10.0.1.0/24`, "퍼블릭 IPv4 자동 할당" 켜기 |
| IGW를 VPC에 연결 | 🟡 | IGW 상태 `Attached` |
| 라우팅 테이블 `0.0.0.0/0 → igw` | 🟡 | 서브넷에 연결된 RT의 Routes 탭 |
| 인스턴스 아웃바운드 (`curl https://example.com`) | 🟡 | `setup-ec2.sh` 마지막 줄이 자동 확인 |

### 컴퓨트·웹 서버

| 요구사항 | 상태 | 어떻게 확인하나 |
|---|:---:|---|
| Public Subnet에 EC2 1대 | 🟡 | t3.micro, Ubuntu LTS, EBS 8GiB |
| SSH 접속 | ⬜ | `ssh -i net-solver-key.pem ubuntu@<IP>` |
| Nginx 설치·실행 | 🟡 | `setup-ec2.sh` → `systemctl status nginx` |
| `curl http://localhost` → 200 | 🟡 | `setup-ec2.sh` 마지막 체크가 출력 |

### 보안 그룹

| 요구사항 | 상태 | 비고 |
|---|:---:|---|
| 필요한 포트만 | 🟡 | 인바운드 딱 2줄: 80, 22. **3000은 열지 않는다** (Nginx가 내부에서 프록시) |
| 80 ← 0.0.0.0/0 | 🟡 | |
| 22 ← 내 IP/32 | 🟡 | 콘솔 "내 IP" 선택. IP 바뀌면 규칙 수정 (트러블슈팅 단골) |
| 0.0.0.0/0 전체 포트 규칙 없음 | ✅ (설계) | 설계상 없음. 콘솔에서 실제로 확인 필요 |

### IAM 최소 권한

| 요구사항 | 상태 | 비고 |
|---|:---:|---|
| IAM 사용자/Role 1개 사용 | ⬜ | 예: `net-solver-lab` 사용자 + 콘솔 로그인 |
| EC2/VPC/SG 범위로 제한 | ✅ (초안) | [iam-policy.json](iam-policy.json)을 고객 관리형 정책으로 붙이기 |
| S3/RDS 등 무관한 서비스 권한 없음 | ✅ (초안) | 정책에 `ec2:*` 액션만 있음 |
| AdministratorAccess 미부여 | ⬜ | 사용자 권한 탭 스크린샷 권장 |

### 외부 접속 검증 · 과금 방지

| 요구사항 | 상태 | 비고 |
|---|:---:|---|
| (A) 또는 (B) 중 1개 증명 | 🟡 | (B) `/health` 선택. 두 방식 모두 동작하는 구조 |
| README에 방식 명시 | ✅ | README "외부 접속 검증" 표 |
| 정리 + 체크리스트 근거 | 🟡 | EC2, EBS, EIP, IGW, VPC 필수 항목 포함 |

---

## D. 제약 사항

| 제약 | 상태 | 비고 |
|---|:---:|---|
| 프리 티어 범위 | 🟡 | IAM 정책이 micro 외 인스턴스와 30GiB 초과 볼륨을 막음. NAT GW·ALB·RDS는 정책에 없어 만들 수도 없음 |
| 루트 계정 사용 금지 | ⬜ | 루트는 IAM 사용자 만들 때만, 그 뒤 로그아웃 |
| 실습 후 전부 삭제 | 🟡 | cleanup-checklist.md |
| 서울 리전 | ✅ | 정책이 다른 리전을 Deny |
| t2/t3.micro, Ubuntu/Amazon Linux, EBS 8~10GiB | 🟡 | 문서 기본값 t3.micro / Ubuntu / 8GiB |
| 키 페어 1개 안전 보관 | ⬜ | `.pem`은 `.gitignore`에 포함됨. 권한: `chmod 400` (Windows는 `icacls`) |
| SSH 소스 제한 유지 | ⬜ | 실습 내내 `/32` 유지 |
| API 키 노출 금지 (프로젝트 고유) | ✅ | `.env` git 제외, Docker 이미지에도 미포함, EC2에선 600 권한 |
| Billing 확인 (권장) | ⬜ | 실습용 IAM 사용자는 Billing 권한이 없음 → 루트로 확인하거나 별도 읽기 권한 |

---

## E. 보너스 (선택)

| 보너스 | 상태 | 비고 |
|---|:---:|---|
| 1. HTTPS (Let's Encrypt) | 🟡 | 도메인 필요. `sudo apt install certbot python3-certbot-nginx && sudo certbot --nginx -d <도메인>` + SG에 443 추가 |
| 2. Docker 배포 | 🟡 | Dockerfile + README에 이미지명·실행 방식·포트 매핑 표 준비. `docker ps`, 외부 접속 스크린샷 2장 필요 |

---

## 제출 직전 최종 점검

- [ ] `docs/architecture.png` — 실제 구성과 일치
- [ ] README의 `__.__.__.__`를 실제 IP로 바꿈
- [ ] `docs/img/`에 외부 접속 스크린샷 (+보너스 시 `docker ps`)
- [ ] `docs/troubleshooting.md`에 **실제 사례** 1건 이상, 6단계 모두 채움
- [ ] `docs/cleanup-checklist.md` 정리 근거 채움, EC2·EBS·EIP·IGW·VPC 삭제 확인
- [ ] `git status`에 `.env`, `.pem`이 안 보임
- [ ] Anthropic API 키 폐기
- [ ] `docs/study-guide.md`의 "말로 설명하기" 5문항을 소리 내어 답해 봄
