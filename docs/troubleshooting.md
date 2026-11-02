# 트러블슈팅 보고서

> 프로젝트: 전개도 해설기 (net-solver) · EC2 1대 배포 (ap-northeast-2)
> 작성자: `________` · 작성일: `YYYY-MM-DD`
>
> **작성 규칙**: 실제로 겪은 오류만 적는다. 각 사례는 **증상 → 가설 → 검증 → 조치 → 결과 → 재발 방지** 6단계를 모두 채우고,
> "검증" 칸에는 **로그·명령 출력 같은 근거**를 붙인다. (제출 최소 1건)

---

## 사례 1. `________________` (예: 퍼블릭 IP로 접속하면 브라우저가 계속 로딩만 하다 실패)

| 항목 | 내용 |
|---|---|
| **발생 시각** | `YYYY-MM-DD HH:MM` |
| **증상** | 무엇을 했을 때, 무엇이 기대와 달랐나 (오류 문구·HTTP 코드 그대로) |
| **원인 가설** | 가능한 원인 1~3개를 가능성 높은 순으로 |
| **검증 방법** | 가설마다 무엇을 확인했고 결과가 어땠나 (아래 "근거"에 출력 첨부) |
| **조치 내용** | 무엇을 어떻게 바꿨나 (콘솔 경로 또는 명령) |
| **결과** | 조치 후 같은 요청을 다시 했을 때의 응답 |
| **재발 방지** | 체크리스트 항목 추가, 설정 파일에 반영 등 |

**근거 (로그/명령 출력)**

```text
# 예: curl -v http://<퍼블릭IP>/health 출력, sudo tail /var/log/nginx/net-solver.error.log, journalctl -u net-solver
```

**스크린샷**: `docs/img/ts1-before.png`, `docs/img/ts1-after.png` (선택)

---

## 사례 2. `________________` (선택)

| 항목 | 내용 |
|---|---|
| **발생 시각** | |
| **증상** | |
| **원인 가설** | |
| **검증 방법** | |
| **조치 내용** | |
| **결과** | |
| **재발 방지** | |

**근거 (로그/명령 출력)**

```text
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
