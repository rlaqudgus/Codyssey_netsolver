import sys
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

plt.rcParams["font.family"] = "Malgun Gothic"
out = sys.argv[1]

fig, ax = plt.subplots(figsize=(16, 9.4), dpi=150)
ax.set_xlim(0, 166); ax.set_ylim(-4, 90); ax.axis("off")

def box(x, y, w, h, fc, ec, lw=1.6, ls="-", r=1.2):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle=f"round,pad=0,rounding_size={r}",
                                fc=fc, ec=ec, lw=lw, ls=ls))

def text(x, y, s, size=10, weight="normal", color="#1c1c1c", ha="left", va="top"):
    ax.text(x, y, s, fontsize=size, fontweight=weight, color=color, ha=ha, va=va, linespacing=1.4)

def arrow(p, q, color, lw=2.2, ls="-", rad=0.0):
    ax.add_patch(FancyArrowPatch(p, q, arrowstyle="-|>", mutation_scale=16, color=color, lw=lw,
                                 ls=ls, connectionstyle=f"arc3,rad={rad}"))

BLUE, ORANGE, GREEN, RED, GRAY = "#1f5fbf", "#c25e00", "#1d6b3a", "#c0392b", "#555"

text(83, 88, "전개도 해설기 (net-solver) — AWS 아키텍처 (ap-northeast-2, 서울)", 15, "bold", ha="center")

# Region / VPC / Subnet
box(22, 4, 116, 78, "#fafafa", GRAY, 1.2, "--"); text(24, 81, "Region: ap-northeast-2 (서울)", 9, color=GRAY)
box(26, 7, 108, 69, "#eef4fc", BLUE, 2); text(28, 75, "VPC  10.0.0.0/16", 12, "bold", BLUE)
box(30, 10, 100, 58, "#e8f5ec", GREEN, 2); text(32, 67, "Public Subnet  10.0.1.0/24  (ap-northeast-2a, 퍼블릭 IP 자동 할당)", 11, "bold", GREEN)

# Route table
box(94, 50, 33, 13, "#ffffff", GREEN, 1.4)
text(96, 62, "Route Table (public-rt)", 9.5, "bold", GREEN)
text(96, 58.5, "10.0.0.0/16  →  local\n0.0.0.0/0    →  igw-xxxx", 9, color="#1c1c1c")

# Security group
box(34, 13, 58, 47, "#fff6f5", RED, 2, (0, (6, 3)))
text(36, 59, "Security Group (net-solver-sg)", 10.5, "bold", RED)
text(36, 55.5, "IN  80/tcp   ← 0.0.0.0/0\nIN  22/tcp   ← 내 IP/32 만\nOUT 전체     → 0.0.0.0/0", 9, color=RED)

# EC2
box(38, 16, 50, 27, "#ffffff", ORANGE, 2)
text(40, 42, "EC2  t3.micro · Ubuntu LTS · EBS 8GiB gp3", 10, "bold", ORANGE)
text(40, 38.8, "퍼블릭 IP  x.x.x.x  /  프라이빗 IP 10.0.1.x", 8.5, color=GRAY)
box(40, 19, 21, 15, "#fff3e6", ORANGE, 1.4)
text(41.2, 33, "Nginx  :80", 10, "bold")
text(41.2, 29.5, "/health → 200 \"OK\"\npublic/ 정적 파일\n/api/ → 프록시", 8.3)
box(65, 19, 21, 15, "#fff3e6", ORANGE, 1.4)
text(66.2, 33, "Node  127.0.0.1:3000", 9.3, "bold")
text(66.2, 29.5, "server/server.js\n(systemd 또는 Docker)\n.env: API 키", 8.3)
arrow((61, 24), (65, 24), ORANGE, 1.8)
text(63, 23, "/api/", 7.5, color=ORANGE, ha="center")

# IGW on VPC edge
box(14, 35, 16, 11, "#ffffff", BLUE, 2)
text(22, 43.6, "Internet\nGateway", 10, "bold", BLUE, ha="center")

# Outside
box(1, 62, 18, 12, "#ffffff", "#333", 1.5); text(10, 71.5, "사용자 브라우저\n(어디서나)", 9.5, "bold", ha="center")
box(1, 8, 18, 12, "#ffffff", "#333", 1.5); text(10, 17.5, "관리자 PC\n(내 IP)", 9.5, "bold", ha="center")
box(1, 36, 11, 9, "#ffffff", "#333", 1.2); text(6.5, 43, "Internet", 9.5, "bold", ha="center")
box(142, 18, 23, 14, "#ffffff", "#666", 1.2, "--")
text(143.5, 30.5, "외부 API (인터넷)", 9, "bold", GRAY)
text(143.5, 26.5, "api.anthropic.com:443\nHTTPS 아웃바운드", 8.5, color=GRAY)

# Flows
arrow((10, 62), (8, 45.2), BLUE, 2.4)                    # user -> internet
text(11.5, 56, "① HTTP :80\nhttp://x.x.x.x", 8.5, color=BLUE)
arrow((10, 20), (7, 36), "#7a3db8", 2, (0, (4, 2)))      # admin -> internet
text(11.2, 27, "SSH :22", 8.5, color="#7a3db8")
arrow((12, 40.5), (14, 40.5), BLUE, 2.4)                 # internet -> igw
arrow((30, 40.5), (40, 30), BLUE, 2.4)                   # igw -> nginx (through SG)
ax.text(14.5, 33.5, "② IGW → 라우팅 테이블\n③ SG 80 허용 → Nginx", fontsize=8.5, color=BLUE, va="top", linespacing=1.4,
        bbox=dict(fc="white", ec="none", pad=1.5), zorder=5)
arrow((86, 26), (142, 25), GRAY, 1.6, (0, (4, 2)), 0.0)  # node -> anthropic
text(94, 19.5, "④ 응답·외부 API 호출은\n0.0.0.0/0 → IGW 경로로 나감", 8.5, color=GRAY)

text(80, -3.2, "3000 포트는 127.0.0.1에만 열려 SG에서도 열지 않음 → 외부에서는 Nginx(80)만 보임  ·  SSH는 내 IP/32만 허용  ·  0.0.0.0/0 전체 포트 허용 규칙 없음",
     8.5, color=RED, ha="center", va="bottom")

fig.savefig(out, bbox_inches="tight", facecolor="white")
print("saved", out)
