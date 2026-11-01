#!/usr/bin/env python3
"""
generate_member4_report.py

팀원 4(김승현 / Frontend & Mobile App Lead)의 **남은 작업(TODO) 목록**을 생성한다.

입력 자료
  1. 다른 팀원이 올린 PR 본문 (gh CLI) 중 팀원 4를 지목해 확인/검토/협의를 요청한 항목
  2. docs/implementation_plan/김승현_향후_구현계획.md 의 "남은 구현 및 인수 계획" (P0/P1) 및 일정표

출력
  docs/member4/YYYY-MM-DD_member4_todo.md  (날짜별 파일)

체크 상태 유지
  생성된 md 의 체크박스를 `[x]` 로 바꿔 두면, 다음 실행 때 같은 항목(<!-- key:... -->)은
  자동으로 완료 상태로 유지된다. (과거 날짜 파일 포함)

사용법
  python scripts/generate_member4_report.py              # 오늘(KST) 기준 생성
  python scripts/generate_member4_report.py 2026-10-19   # 날짜 지정
"""

import glob
import hashlib
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))

# 팀원 4 본인 계정/브랜치: 본인이 올린 PR 은 "요청 받은 일" 이 아니므로 분석에서 제외
MEMBER4_LOGINS = {"gigantess", "true9090"}
MEMBER4_BRANCH_HINT = "member4"

# PR 본문에서 팀원 4를 지목하는 표현
MENTION = re.compile(r"@gigantess|@true9090|김승현|승현\s?님|팀원\s?4|Member\s?4", re.IGNORECASE)
# 지목만 있고 요청이 없는 '안내성 문구' 를 걸러내는 요청 표현
REQUEST = re.compile(r"부탁|검토|협의|판단|맞춰|말씀|해\s?주|봐\s?주|논의|확인이 필요")
# 긴급도가 높은 표현
URGENT = re.compile(r"500|충돌|장애|오류|버그|다시 생|실패")

PLAN_FILE = os.path.join("docs", "implementation_plan", "김승현_향후_구현계획.md")
PLAN_SECTION = "## 남은 구현 및 인수 계획"
OUT_DIR = os.path.join("docs", "member4")
PR_LIMIT = 60


def run(cmd, cwd):
    res = subprocess.run(cmd, cwd=cwd, shell=True, capture_output=True,
                         text=True, encoding="utf-8", check=False)
    return res.stdout, res.stderr, res.returncode


def make_key(prefix, text):
    normalized = re.sub(r"\s+", " ", text)
    return prefix + "-" + hashlib.sha1(normalized.encode("utf-8")).hexdigest()[:8]


def clean(text, limit=160):
    """마크다운 장식과 멘션을 제거한 한 줄 요약."""
    text = re.sub(r"^\s*(?:[-*]|\d+\.)\s+", "", text)
    text = re.sub(r"^\s*(?:@gigantess|@true9090)\s*(?:승현\s?님)?\s*[:：]?", "", text)
    text = text.replace("**", "").strip(" :：")
    return text if len(text) <= limit else text[: limit - 1] + "…"


# ---------------------------------------------------------------- PR 분석
def fetch_prs(root):
    out, err, code = run(
        f"gh pr list --state all --limit {PR_LIMIT} "
        "--json number,title,state,mergedAt,createdAt,url,headRefName,author,body", root)
    if code != 0 or not out:
        print(f"[경고] gh pr list 실패: {err}")
        return []
    return json.loads(out)


BULLET = re.compile(r"^\s*(?:[-*]|\d+\.)\s+")
HEADING = re.compile(r"^\s*#{1,6}\s")


def _indent(line):
    return len(line) - len(line.lstrip(" \t"))


def _group(lines, i):
    """i 번째 줄과 그에 딸린 하위 줄을 묶는다.

    불릿 줄이면 더 깊게 들여쓴 줄만, 일반 문단 줄이면 이어지는 불릿을 하위로 본다.
    """
    base_is_bullet = bool(BULLET.match(lines[i]))
    base_indent = _indent(lines[i])
    group = [lines[i]]
    j = i + 1
    while j < len(lines) and lines[j].strip() and not HEADING.match(lines[j]):
        if base_is_bullet:
            is_child = _indent(lines[j]) > base_indent
        else:
            is_child = bool(BULLET.match(lines[j])) or _indent(lines[j]) > base_indent
        if not is_child:
            break
        group.append(lines[j])
        j += 1
    return group, j


def _is_candidate(line, heading_hit):
    """지목된 섹션의 불릿, 또는 본문 중 지목 줄이면 요청 후보."""
    return bool((heading_hit and BULLET.match(line)) or MENTION.search(line))


def _to_item(group):
    """요청 표현이 있는 묶음이면 (제목, [세부...]) 로 변환, 아니면 None."""
    if not REQUEST.search(" ".join(group)):
        return None
    title = clean(group[0])
    if not title:
        return None
    return title, [clean(d, 200) for d in group[1:]]


def extract_requests(body):
    """PR 본문에서 팀원 4 대상 요청 항목 [(제목, [세부...])] 을 추출."""
    lines = (body or "").replace("\r\n", "\n").split("\n")
    items, i, heading_hit = [], 0, False
    while i < len(lines):
        line = lines[i]
        if HEADING.match(line):
            heading_hit = bool(MENTION.search(line))
            i += 1
        elif not line.strip():
            i += 1
        else:
            group, i = _group(lines, i)
            item = _to_item(group) if _is_candidate(line, heading_hit) else None
            if item:
                items.append(item)
    return items


def collect_pr_todos(prs):
    todos = []
    for pr in prs:
        login = (pr.get("author") or {}).get("login", "")
        if login in MEMBER4_LOGINS or MEMBER4_BRANCH_HINT in pr.get("headRefName", "").lower():
            continue
        if pr["state"] == "CLOSED":
            continue
        when = pr.get("mergedAt") or pr.get("createdAt")
        date = datetime.fromisoformat(when.replace("Z", "+00:00")).astimezone(KST).strftime("%Y-%m-%d")
        for title, details in extract_requests(pr.get("body")):
            todos.append({
                "pr": pr, "login": login, "date": date, "title": title, "details": details,
                "urgent": bool(URGENT.search(title + " ".join(details))),
                "key": make_key(f"pr{pr['number']}", title),
            })
    return todos


# ---------------------------------------------------------------- 계획서 분석
DATE_TOKEN = re.compile(r"(\d{1,2})/(\d{1,2})")


def _read_plan_section(path):
    """계획서에서 PLAN_SECTION 제목 아래 줄들을 반환."""
    with open(path, encoding="utf-8") as f:
        lines = f.read().replace("\r\n", "\n").split("\n")
    if PLAN_SECTION not in [l.strip() for l in lines]:
        return []
    rest = lines[[l.strip() for l in lines].index(PLAN_SECTION) + 1:]
    section = []
    for line in rest:
        if line.startswith("## "):
            break
        section.append(line)
    return section


def _plan_todos(section):
    """본문에서 'P0: ... P1: ...' 문장을 우선순위별 항목으로 분해."""
    prose = " ".join(l.strip() for l in section if l.strip() and not l.lstrip().startswith("|"))
    parts = re.split(r"(P\d+):", prose)
    todos = []
    for level, body in zip(parts[1::2], parts[2::2]):
        sentences = [s.strip() for s in re.split(r"(?<=다)\.\s*", body)]
        todos += [{"level": level, "text": s, "key": make_key("plan", s)} for s in sentences if s]
    return todos


def _milestone(line, year):
    """일정표 한 줄을 마일스톤으로 변환 (일정 행이 아니면 None)."""
    cells = [c.strip() for c in line.strip().strip("|").split("|")]
    if len(cells) != 2:
        return None
    nums = DATE_TOKEN.findall(cells[0])
    if not nums:
        return None
    start = datetime(year, int(nums[0][0]), int(nums[0][1]), tzinfo=KST).date()
    end = datetime(year, int(nums[-1][0]), int(nums[-1][1]), tzinfo=KST).date()
    return {"period": cells[0], "goal": cells[1], "start": start, "end": end}


def parse_plan(root, today):
    path = os.path.join(root, PLAN_FILE)
    if not os.path.exists(path):
        return [], []
    section = _read_plan_section(path)
    milestones = [m for m in (_milestone(l, today.year) for l in section) if m]
    return _plan_todos(section), milestones


# ---------------------------------------------------------------- 체크 상태 유지
def load_checked(root):
    checked = set()
    for path in glob.glob(os.path.join(root, OUT_DIR, "*_member4_todo.md")):
        with open(path, encoding="utf-8") as f:
            for line in f:
                m = re.search(r"- \[x\].*<!-- key:(\S+) -->", line, re.IGNORECASE)
                if m:
                    checked.add(m.group(1))
    return checked


# ---------------------------------------------------------------- 문서 생성
def box(key, checked):
    return "[x]" if key in checked else "[ ]"


def _render_header(today, pr_todos, plan_todos, checked):
    d = today.strftime("%Y-%m-%d")
    open_pr = [t for t in pr_todos if t["key"] not in checked]
    open_plan = [t for t in plan_todos if t["key"] not in checked]
    urgent_n = sum(t["urgent"] for t in open_pr) + sum(t["level"] == "P0" for t in open_plan)
    total = len(pr_todos) + len(plan_todos)
    done = total - len(open_pr) - len(open_plan)

    return [
        f"# ✅ [팀원 4 TODO] 김승현 (Frontend & Mobile App Lead) — {d}",
        "",
        f"> 파일: `docs/member4/{d}_member4_todo.md`  ",
        f"> 생성: {datetime.now(KST).strftime('%Y-%m-%d %H:%M KST')} · `python scripts/generate_member4_report.py`  ",
        f"> 근거: 팀원 PR 본문 최근 {PR_LIMIT}건 + [`{PLAN_FILE.replace(os.sep, '/')}`](/{PLAN_FILE.replace(os.sep, '/')})  ",
        "> 완료한 항목은 `[ ]` → `[x]` 로 바꿔 두면 다음 생성 때도 완료 상태가 유지됩니다.",
        "",
        "## 📊 요약",
        "",
        "| 구분 | 남은 일 | 전체 |",
        "|---|:---:|:---:|",
        f"| 팀원 PR 요청 | **{len(open_pr)}** | {len(pr_todos)} |",
        f"| 계획서 남은 구현 | **{len(open_plan)}** | {len(plan_todos)} |",
        f"| 🔴 긴급(P0/오류·충돌 관련) | **{urgent_n}** | - |",
        f"| ✅ 완료 체크 | {done} | {total} |",
        "",
        "---",
        "",
        "## 1. 팀원 PR에서 요청받은 확인·후속 작업",
        "",
    ]


def _render_pr_group(number, group, checked):
    pr = group[0]["pr"]
    state = "병합" if pr["state"] == "MERGED" else "열림"
    md = [f"### [PR #{number}]({pr['url']}) {pr['title']}",
          f"> 요청자 @{group[0]['login']} · {state} {group[0]['date']}", ""]
    for t in sorted(group, key=lambda x: not x["urgent"]):
        mark = "🔴" if t["urgent"] else "🟡"
        md.append(f"- {box(t['key'], checked)} {mark} {t['title']} <!-- key:{t['key']} -->")
        md += [f"  - {det}" for det in t["details"][:3]]
    md.append("")
    return md


def _render_pr_section(pr_todos, checked):
    if not pr_todos:
        return ["> 팀원 4를 지목한 요청이 없습니다.", ""]
    by_pr = {}
    for t in pr_todos:
        by_pr.setdefault(t["pr"]["number"], []).append(t)
    md = []
    for number in sorted(by_pr, reverse=True):
        md += _render_pr_group(number, by_pr[number], checked)
    return md


def _render_plan_section(plan_todos, checked):
    md = ["---", "", "## 2. 계획서 기준 남은 구현", ""]
    if not plan_todos:
        md += ["> 계획서에서 남은 구현 항목을 찾지 못했습니다.", ""]
    for level in sorted({t["level"] for t in plan_todos}):
        mark = "🔴" if level == "P0" else "🟡"
        md += [f"### {mark} {level}", ""]
        md += [f"- {box(t['key'], checked)} {t['text']}. <!-- key:{t['key']} -->"
               for t in plan_todos if t["level"] == level]
        md.append("")
    return md


def _milestone_status(m, today_date):
    if m["end"] < today_date:
        return "지남"
    if m["start"] <= today_date:
        left = (m["end"] - today_date).days
        return "오늘 마감" if left == 0 else f"진행 중 (D-{left})"
    return f"예정 (D-{(m['start'] - today_date).days})"


def _render_milestones(milestones, today_date):
    md = ["---", "", "## 3. 일정 마일스톤", "",
          "| 기간 | 상태 | 인수 조건 |", "|---|:---:|---|"]
    md += [f"| {m['period']} | {_milestone_status(m, today_date)} | {m['goal']} |" for m in milestones]
    md += ["", "---", "*`scripts/generate_member4_report.py` 로 자동 생성*", ""]
    return md


def render(today, pr_todos, plan_todos, milestones, checked):
    md = _render_header(today, pr_todos, plan_todos, checked)
    md += _render_pr_section(pr_todos, checked)
    md += _render_plan_section(plan_todos, checked)
    md += _render_milestones(milestones, today.date())
    return "\n".join(md)


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    today = datetime.now(KST)
    if len(sys.argv) > 1:
        today = datetime.strptime(sys.argv[1], "%Y-%m-%d").replace(tzinfo=KST)

    prs = fetch_prs(root)
    pr_todos = collect_pr_todos(prs)
    plan_todos, milestones = parse_plan(root, today)
    checked = load_checked(root)

    os.makedirs(os.path.join(root, OUT_DIR), exist_ok=True)
    out = os.path.join(root, OUT_DIR, f"{today.strftime('%Y-%m-%d')}_member4_todo.md")
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write(render(today, pr_todos, plan_todos, milestones, checked))
    print(f"PR {len(prs)}건 분석 → PR 요청 {len(pr_todos)}건, 계획서 {len(plan_todos)}건")
    print(f"저장: {out}")


if __name__ == "__main__":
    main()
