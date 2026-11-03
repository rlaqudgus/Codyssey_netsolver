# 리소스 정리 체크리스트

> 리전: **ap-northeast-2 (서울)** · 작성자: `________` · 정리일: `YYYY-MM-DD`
>
> 사용법: ① 리소스를 **만들 때** 아래 1번 표에 ID를 적는다 → ② 실습이 끝나면 2번 순서대로 지운다 →
> ③ 3번 명령이나 콘솔 화면으로 "없음"을 확인하고 근거를 남긴다.

## 1. 생성 리소스 추적표 (만들 때 바로 기록)

| # | 리소스 | ID / 이름 | 생성 시각 | 정리 상태 | 정리 근거 (화면·명령 결과) |
|---|---|---|---|---|---|
| 1 | EC2 인스턴스 | `i-00eb66dc541b0a140` (t3.micro, net-solver-web) | 2026-11-02 14:52 | ☐ Terminated | |
| 2 | EBS 볼륨 (루트 + 추가분) | `vol-0a9640545ec87f5b0` (8GiB gp3, 종료 시 삭제 켜짐) | 2026-11-02 14:52 | ☐ 삭제됨 | |
| 3 | Elastic IP (할당했다면) | 할당 안 함 (자동 퍼블릭 IP 43.201.254.210 사용) | — | ☐ Released / ☐ 해당 없음 | |
| 4 | 보안 그룹 | `sg-0067eb94c6bf9da5c` (net-solver-sg) | 2026-11-02 14:52 | ☐ 삭제됨 | |
| 5 | 키 페어 | `net-solver-key` (로컬 ~/.ssh/net-solver-key.pem) | 2026-11-02 14:52 | ☐ 삭제됨 (+ 로컬 .pem 처리) | |
| 6 | Internet Gateway | `igw-038259e638b1cc5bf` | 2026-11-02 14:52 | ☐ Detach ☐ 삭제됨 | |
| 7 | 라우팅 테이블 (커스텀) | `rtb-0478e3664a0482fcc` | 2026-11-02 14:52 | ☐ 삭제됨 | |
| 8 | 서브넷 | `subnet-030d49d1a95fe9ff7` (10.0.1.0/24, 2a) | 2026-11-02 14:52 | ☐ 삭제됨 | |
| 9 | VPC | `vpc-0ca361fd25c910867` (10.0.0.0/16) | 2026-11-02 14:52 | ☐ 삭제됨 | |
| 10 | NAT Gateway (만들었다면) | 만들지 않음 | — | ☐ 삭제됨 / ☐ 해당 없음 | |
| 11 | ELB/ALB (만들었다면) | 만들지 않음 | — | ☐ 삭제됨 / ☐ 해당 없음 | |
| 12 | RDS (만들었다면) | 만들지 않음 | — | ☐ 삭제됨 / ☐ 해당 없음 | |
| 13 | 스냅샷 / AMI (만들었다면) | 만들지 않음 | — | ☐ 삭제됨 / ☐ 해당 없음 | |
| 14 | AI API 키 | Gemini 키: 서버 `/opt/net-solver/.env`(600)에 있음 · Anthropic 키: 서버에 없음 | 2026-11-02 15:40 | ☐ Gemini 키 삭제 (aistudio.google.com/apikey) | |

## 2. 정리 순서와 이유

의존 관계 때문에 **위에서 아래로** 지워야 오류(`DependencyViolation`)가 나지 않는다.

- [ ] **1. EC2 인스턴스 Terminate** — 과금 1순위. 인스턴스가 볼륨·ENI·EIP를 붙잡고 있어서 이것부터 지워야 나머지가 풀린다.
      "중지(Stop)"는 정리가 아니다. 중지해도 EBS 요금은 계속 나간다.
- [ ] **2. 상태가 `terminated`가 될 때까지 기다리기** (1~2분)
- [ ] **3. EBS 볼륨 확인** — 루트 볼륨은 "종료 시 삭제(Delete on termination)"가 켜져 있으면 같이 지워진다.
      볼륨 목록에서 `available`(미사용) 볼륨이 남았는지 꼭 본다. 남아 있으면 삭제.
- [ ] **4. Elastic IP Disassociate → Release** — 붙어 있지 않은 EIP, 그리고 2024-02부터는 모든 퍼블릭 IPv4에 시간당 요금이 붙는다. "연결 해제"만 하면 계속 과금되니 **Release**까지.
- [ ] **5. (해당 시) NAT Gateway / ELB / RDS 삭제** — 시간당 과금이 크고 프리 티어가 아니거나 한도가 작다.
- [ ] **6. 보안 그룹 삭제** — 기본(default) SG는 VPC와 함께 지워지므로 따로 지울 수 없다.
- [ ] **7. 키 페어 삭제** — 과금은 없지만 남겨 두면 나중에 무슨 키인지 모른다. 로컬 `.pem`도 지우거나 안전하게 보관.
- [ ] **8. Internet Gateway: Detach → Delete** — VPC에 붙어 있으면 삭제되지 않는다.
- [ ] **9. 서브넷, 커스텀 라우팅 테이블 삭제**
- [ ] **10. VPC 삭제** — 콘솔에서 VPC를 지우면 남은 서브넷·RT·IGW·SG를 같이 지워 준다(마지막 정리용).
- [ ] **11. 스냅샷/AMI 확인** — 만들었다면 AMI 등록 취소 후 스냅샷 삭제.
- [ ] **12. Gemini API 키 삭제** — 서버에 있던 키는 서버가 사라져도 유효하다 (AI Studio → API keys → 삭제).
- [ ] **13. (권장) Billing → Bills / Free Tier 화면 확인** — 다음 날 한 번 더 확인 (요금 반영이 몇 시간 늦다).
- [ ] **14. (선택) 실습용 IAM 사용자 액세스 키 비활성화/삭제**

## 3. "없음" 확인 명령 (AWS CLI, 결과가 비어 있어야 정상)

```bash
R=ap-northeast-2
aws ec2 describe-instances --region $R --filters Name=instance-state-name,Values=pending,running,stopping,stopped \
  --query 'Reservations[].Instances[].InstanceId'
aws ec2 describe-volumes     --region $R --query 'Volumes[].VolumeId'
aws ec2 describe-addresses   --region $R --query 'Addresses[].PublicIp'
aws ec2 describe-nat-gateways --region $R --filter Name=state,Values=available,pending --query 'NatGateways[].NatGatewayId'
aws ec2 describe-internet-gateways --region $R --filters Name=tag:Project,Values=net-solver --query 'InternetGateways[].InternetGatewayId'
aws ec2 describe-vpcs        --region $R --filters Name=isDefault,Values=false --query 'Vpcs[].VpcId'
aws ec2 describe-security-groups --region $R --filters Name=group-name,Values='*net-solver*' --query 'SecurityGroups[].GroupId'
aws ec2 describe-snapshots   --region $R --owner-ids self --query 'Snapshots[].SnapshotId'
```

> CLI가 없으면 콘솔 화면으로 대신한다: EC2 → 인스턴스 / 볼륨 / 탄력적 IP / 스냅샷, VPC → 사용자 VPC / 인터넷 게이트웨이 / NAT 게이트웨이.
> 리소스에 `Project=net-solver` 태그를 달아 두면 필터 한 번으로 찾을 수 있다.

## 4. 정리 근거 (스크린샷)

| 화면 | 파일 |
|---|---|
| EC2 인스턴스 목록 (Terminated 또는 비어 있음) | `docs/img/cleanup-ec2.png` |
| 볼륨 목록 (비어 있음) | `docs/img/cleanup-ebs.png` |
| 탄력적 IP 목록 (비어 있음) | `docs/img/cleanup-eip.png` |
| VPC 목록 (실습 VPC 없음) | `docs/img/cleanup-vpc.png` |
| (선택) Billing / Free Tier 화면 | `docs/img/cleanup-billing.png` |

**최종 확인**: ☐ 과금 위험 항목 없음 · 확인일 `YYYY-MM-DD` · 확인자 `________`
