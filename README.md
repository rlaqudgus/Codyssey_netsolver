# 전개도 해설기

전개도 문제 사진을 올리면 AI가 전개도와 보기를 읽고, 페이지가 직접 접어서 3D 모형과 보기 대조로 정답을 보여 주는 웹사이트입니다. 정사면체·정육면체·정팔면체를 지원합니다.

AWS EC2 한 대(서울 리전)에 Nginx + Node로 배포합니다.

## 외부 접속 검증 (제출 정보)

| 항목 | 값 |
|---|---|
| **선택한 방식** | **(B) `GET http://<퍼블릭IP>/health` → `200 OK` / `OK`** (참고: (A) 브라우저 `http://<퍼블릭IP>`로도 사이트가 열림) |
| 접속 주소 | **http://43.201.254.210/health** (사이트: http://43.201.254.210) |
| 확인 명령 | `curl -i http://43.201.254.210/health` |
| 확인 일시 | 2026-11-02 14:54 KST, 외부(내 PC)에서 200 OK 확인 |
| 결과 스크린샷 | [docs/img/external-health.png](docs/img/external-health.png) (내 PC 크롬에서 `OK` 확인) |
| 명령 출력 기록 | [docs/evidence/ec2-instance-checks.txt](docs/evidence/ec2-instance-checks.txt), [docs/evidence/aws-resources.txt](docs/evidence/aws-resources.txt) |

> ⚠️ 주소는 반드시 **`http://`까지** 입력하세요. 스킴 없이 치면 크롬이 `https://`(443)로 먼저 시도하는데, 보안 그룹은 80만 열려 있어 시간 초과가 납니다 ([트러블슈팅 사례 3](docs/troubleshooting.md)).
>
> ![external health check](docs/img/external-health.png)
>
> 퍼블릭 IP는 인스턴스를 중지/시작하면 바뀌고, 실습 종료 후 리소스를 삭제하면 이 주소는 더 이상 열리지 않습니다.

```text
기대 결과
HTTP/1.1 200 OK
Content-Type: text/plain

OK
```

## 아키텍처

![architecture](docs/architecture.png)

```
인터넷 → Internet Gateway → (라우팅 0.0.0.0/0 → igw) → Public Subnet → Security Group(80, 22=내 IP) → EC2
EC2 안:  Nginx :80 ─┬─ /health  → 200 "OK" (Nginx가 직접 응답)
                    ├─ /api/*   → Node 127.0.0.1:3000 (server/server.js)
                    └─ 그 외    → public/ 정적 파일
```

## 구조

```
public/index.html        화면 (업로드, 결과, 3D 뷰어, 보기 대조)
public/engine.js         전개도 해석·접기·보기 대조 엔진 (브라우저에서 실행)
server/server.js         API 서버 (Node 기본 모듈만 사용): 사진을 Claude 또는 Gemini API로 보내 JSON을 받아 옴
server/prompt.js         AI에게 보내는 지시문 (두 AI 공통, 인식 품질은 여기서 조정)
deploy/nginx.conf        Nginx 사이트 설정 (/health, /api 프록시, 10m 업로드, 300s 타임아웃)
deploy/net-solver.service  systemd 서비스 (Node를 127.0.0.1:3000에서 실행)
deploy/Dockerfile        (보너스) API 컨테이너 이미지
deploy/setup-ec2.sh      EC2 첫 설정 스크립트 (Nginx·Node 설치, 파일 배치, 서비스 등록)
docs/                    아키텍처, 트러블슈팅, 정리 체크리스트, IAM 정책, 학습 자료
.env.example             환경 변수 예시 (.env는 git에 올리지 않음)
```

API 키는 EC2의 `.env`(권한 600)에만 있고 브라우저로는 절대 나가지 않습니다. 사진은 저장하지 않고 요청 한 번에만 쓰입니다.

## 로컬 실행

Node 18 이상만 있으면 됩니다 (`npm install` 불필요).

```bash
cp .env.example .env        # GEMINI_API_KEY 또는 ANTHROPIC_API_KEY 채우기 (예시 문제만 볼 거면 생략 가능)
node server/server.js --static
```

http://127.0.0.1:3000 접속 → "예시 문제로 보기" → 정답 ③. `--static`은 로컬에서 Nginx 역할(정적 파일 + `/health`)까지 Node가 대신하는 개발용 옵션입니다.

## EC2 배포

AWS 쪽 준비(VPC, 서브넷, IGW, 라우팅, 보안 그룹, 키 페어, EC2)는 `docs/study-guide.md`의 "콘솔 작업 순서"를 따릅니다.

```bash
# 내 PC → EC2로 코드 복사 (.env는 따로 만들기)
scp -i net-solver-key.pem -r public server deploy package.json .env.example ubuntu@<퍼블릭IP>:~/net-solver/

# EC2 안에서
cd ~/net-solver
bash deploy/setup-ec2.sh
sudo cp .env.example /opt/net-solver/.env && sudo nano /opt/net-solver/.env   # API 키 입력
sudo chown netsolver:netsolver /opt/net-solver/.env && sudo chmod 600 /opt/net-solver/.env
sudo systemctl restart net-solver

curl -i http://localhost/           # 200
curl http://localhost/health        # OK
curl http://127.0.0.1:3000/api/health   # {"ok":true,"keyConfigured":true}
```

| 환경 변수 | 설명 |
|---|---|
| `AI_PROVIDER` | `gemini` 또는 `claude`. 비우면 키가 있는 쪽 (둘 다 있으면 Claude) |
| `GEMINI_API_KEY` | Gemini를 쓸 때. https://aistudio.google.com 에서 무료 발급 (무료 구간 데이터는 Google 서비스 개선에 쓰일 수 있음, 하루 호출 한도 있음) |
| `GEMINI_MODEL` | 선택, 기본 `gemini-3.8-flash` (무료 구간 모델) |
| `ANTHROPIC_API_KEY` | Claude를 쓸 때. https://platform.claude.com 에서 선불 충전 (Claude Pro 구독과 별도 결제) |
| `CLAUDE_MODEL` | 선택, 기본 `claude-opus-5-5` (분석 1회 약 150~480원) |
| `ACCESS_CODE` | 선택, 정하면 이 코드를 아는 사람만 분석 가능 |
| `RATE_PER_10MIN` | 선택, IP당 10분에 허용할 분석 횟수, 기본 10 |
| `HOST` / `PORT` | 선택, 기본 `127.0.0.1` / `3000` |

## (보너스 2) Docker로 API 실행

systemd 서비스 대신 컨테이너로 Node를 띄웁니다. Nginx는 그대로 호스트에서 정적 파일과 `/health`를 맡습니다.

| 항목 | 값 |
|---|---|
| 이미지 | `net-solver:1.0` (베이스 `node:22-alpine`, `deploy/Dockerfile`로 빌드) |
| 실행 방식 | `docker run -d --restart unless-stopped --env-file .env` |
| 포트 매핑 | `127.0.0.1:3000 → 컨테이너 3000` (호스트 루프백에만 바인딩, 보안 그룹에서도 3000은 닫힘) |
| 스크린샷 | `docs/img/docker-ps.png` (컨테이너 Up), `docs/img/docker-external.png` (외부 /health 또는 브라우저) |

```bash
sudo apt-get install -y docker.io && sudo usermod -aG docker ubuntu   # 다시 로그인
sudo systemctl disable --now net-solver          # 3000 포트 충돌 방지
docker build -f deploy/Dockerfile -t net-solver:1.0 .
docker run -d --name net-solver --restart unless-stopped \
  --env-file /opt/net-solver/.env -p 127.0.0.1:3000:3000 net-solver:1.0
docker ps                                       # STATUS: Up ... (healthy)
curl -i http://localhost/                       # 인스턴스 내부 200
curl http://<퍼블릭IP>/health                   # 외부 OK
```

## 정리

실습이 끝나면 `docs/cleanup-checklist.md` 순서대로 EC2 → EBS → Elastic IP → IGW → VPC를 지우고 근거를 남깁니다.

## 알아 둘 점

- 분석 1회마다 API 비용이 운영자 계정에 청구됩니다. 공개 전에 Anthropic 콘솔에서 월 사용 한도를 꼭 설정하세요.
- 속도 제한은 Node 프로세스 메모리 기반이라 재시작하면 초기화됩니다.
- 분석은 1~2분 걸릴 수 있습니다. Nginx `proxy_read_timeout 300s`, Node 쪽 외부 호출 제한 280s로 맞춰 두었습니다.
- 사용자가 올리는 문제는 출판사 교재일 수 있습니다. 사진을 저장하거나 다시 공개하지 않는 현재 구조를 유지하는 것이 안전합니다.
