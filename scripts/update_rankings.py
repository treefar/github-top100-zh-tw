#!/usr/bin/env python3
"""Fetch GitHub's cumulative-star Top 100 and refresh the static site data.

Uses only Python's standard library. Existing Traditional Chinese summaries are
cached/curated. New or materially changed repositories can be summarized through
OpenAI Responses API when OPENAI_API_KEY is present; otherwise a transparent
Traditional Chinese fallback is generated.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
ASSETS_DIR = ROOT / "assets"
TOP100_PATH = DATA_DIR / "top100.json"
HISTORY_PATH = DATA_DIR / "history.json"
OVERRIDES_PATH = DATA_DIR / "manual-overrides.json"
CACHE_PATH = DATA_DIR / "summary-cache.json"
INITIAL_JS_PATH = ASSETS_DIR / "initial-data.js"

GITHUB_API = "https://api.github.com/search/repositories"
QUERY = "stars:>1"
try:
    TIMEZONE = ZoneInfo("Asia/Taipei")
except ZoneInfoNotFoundError:
    # Windows 的標準 Python 可能未附 IANA tzdata；台灣全年固定 UTC+8。
    TIMEZONE = timezone(timedelta(hours=8), name="Asia/Taipei")
OPENAI_ENDPOINT = "https://api.openai.com/v1/responses"
DEFAULT_OPENAI_MODEL = "gpt-5-mini"

GRADE_LABELS = {
    "A": "立即採用／保留",
    "B": "專案按需",
    "C": "收藏／暫緩",
    "D": "不建議",
}

CATEGORY_USE_CASES = {
    "教材／清單／學習資源": "適合課程備課、學生自學、專題靈感與技術選型前的資料蒐集。",
    "教材／API清單": "適合學生網頁或遊戲原型快速尋找可用資料來源。",
    "教材／課程地圖": "適合規劃課程軸線、能力指標與學生自學路徑。",
    "論文閱讀清單": "適合研究生讀書會、方法課與研究延伸閱讀。",
    "AI Agent／技能／提示": "適合先在小型專案測試，再挑選少量能力補入既有 Agent 工作流。",
    "AI程式代理": "適合程式庫分析、規格化實作、除錯與驗證，但需限制權限與版本控制。",
    "框架／函式庫": "只有在明確採用對應技術棧的專案中才需要安裝或加入依賴。",
    "自動化平台": "適合通知、文獻追蹤、資料處理與跨服務排程。",
    "LLM應用平台": "適合把知識庫、RAG 或 Agent 原型部署成可用服務。",
    "本機LLM執行器": "適合私有資料、離線展示與本機模型原型。",
    "生成式內容工具": "適合可重現的影像、影片、音訊或遊戲素材流程。",
    "遊戲引擎": "適合遊戲原型、教學比較與開源引擎研究。",
    "開發工具": "適合日常程式、版本控制、測試與專案管理工作。",
    "可安裝工具／平台": "適合先在隔離環境驗證是否能補上現有流程缺口。",
}

CATEGORY_CAUTIONS = {
    "教材／清單／學習資源": "高星不代表每個連結仍有效，也不表示需要安裝整個儲存庫。",
    "教材／API清單": "各 API 的費用、資料品質、授權與可用性需逐項確認。",
    "AI Agent／技能／提示": "先檢查安裝腳本、工具權限、資料傳送與既有規則衝突。",
    "AI程式代理": "允許執行命令或修改檔案前，應使用 Git、分支與最小權限保護資料。",
    "框架／函式庫": "版本、相依套件、授權與長期維護成本需由實際專案需求決定。",
    "自動化平台": "連接信箱、雲端或個資時，需先設定憑證保護、最小權限與備份。",
    "高風險／不相干": "不可只依 Stars 判斷安全與合法性；正式設備不建議安裝。",
    "授權規避工具": "涉及軟體授權規避，不應用於學校、研究或工作設備。",
    "可安裝工具／平台": "只從官方 Release 取得，並先檢查簽章、權限、網路連線與供應鏈來源。",
}


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        print(f"warning: cannot read {path}: {exc}", file=sys.stderr)
        return default


def save_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def http_json(url: str, *, headers: dict[str, str], data: bytes | None = None, timeout: int = 45) -> Any:
    request = urllib.request.Request(url, headers=headers, data=data, method="POST" if data is not None else "GET")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
        return json.loads(raw)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} from {url}: {body[:800]}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Network error for {url}: {exc.reason}") from exc


def fetch_github_top100() -> list[dict[str, Any]]:
    params = urllib.parse.urlencode({
        "q": QUERY,
        "sort": "stars",
        "order": "desc",
        "per_page": 100,
        "page": 1,
    })
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "github-top100-zh-tw-dashboard/1.0",
    }
    token = os.getenv("GITHUB_TOKEN", "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    payload = http_json(f"{GITHUB_API}?{params}", headers=headers)
    items = payload.get("items", [])
    if payload.get("incomplete_results"):
        print("warning: GitHub returned incomplete_results=true", file=sys.stderr)
    if len(items) < 100:
        raise RuntimeError(f"GitHub returned only {len(items)} repositories; refusing to overwrite the complete dataset")
    return items[:100]


def normalize_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def license_name(repo: dict[str, Any]) -> str | None:
    license_obj = repo.get("license") or {}
    value = license_obj.get("spdx_id") or license_obj.get("name")
    if not value or value == "NOASSERTION":
        return None
    return str(value)


def fingerprint(repo: dict[str, Any]) -> str:
    material = {
        "description": normalize_text(repo.get("description")),
        "topics": sorted(repo.get("topics") or []),
        "language": repo.get("language"),
        "license": license_name(repo),
        "archived": bool(repo.get("archived")),
        "homepage": repo.get("homepage"),
    }
    return hashlib.sha256(json.dumps(material, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()[:20]


def infer_profile(repo: dict[str, Any]) -> dict[str, Any]:
    full_name = str(repo.get("full_name") or "")
    text = " ".join([
        full_name,
        normalize_text(repo.get("description")),
        " ".join(repo.get("topics") or []),
        normalize_text(repo.get("language")),
    ]).lower()

    high_risk = any(term in text for term in ["activation script", "crack", "piracy", "iptv", "v2ray", "clash proxy"])
    learning = any(term in text for term in ["awesome", "book", "roadmap", "tutorial", "course", "learn", "interview", "algorithm", "papers"])
    game = any(term in text for term in ["game engine", "godot", "unity", "unreal", "three.js", "webgl"])
    agent = any(term in text for term in ["agent", "claude code", "codex", "prompt", "skills", "autogpt"])
    ai_platform = any(term in text for term in ["llm", "rag", "machine learning", "deep learning", "transformer", "stable diffusion", "comfy"])
    framework = any(term in text for term in ["framework", "library", "runtime", "programming language", "sdk", "react", "vue", "typescript"])

    if high_risk:
        category, action, fit, grade = "高風險／不相干", "不建議", 1, "D"
        reason = "星數不能取代授權、安全、合法性與工作需求判斷。"
    elif learning:
        category, action, fit, grade = "教材／清單／學習資源", "收藏閱讀", 3, "C"
        reason = "主要價值是閱讀、查找與課程參考，不需因高星而安裝。"
    elif game:
        category, action, fit, grade = "遊戲引擎" if "engine" in text or "godot" in text else "框架／函式庫", "專案按需", 4, "B"
        reason = "與遊戲教學、Web 3D 或原型相關；先用小型專案驗證。"
    elif agent:
        category, action, fit, grade = "AI Agent／技能／提示", "先評估重疊", 2, "C"
        reason = "現有 Claude Code／Codex／Hermes／Skills 已涵蓋多數需求，同類工具過多會增加衝突與維護。"
    elif ai_platform:
        category, action, fit, grade = "LLM應用平台", "研究專案按需", 4, "B"
        reason = "人工情感、RAG 或 AI 原型有明確需求時再採用。"
    elif framework:
        category, action, fit, grade = "框架／函式庫", "專案按需", 2, "B"
        reason = "只有在對應技術棧成立時才加入，避免為了排名增加維護負擔。"
    else:
        category, action, fit, grade = "可安裝工具／平台", "按需求安裝", 3, "B"
        reason = "先確認能否補上目前工作流缺口，再於隔離環境測試。"

    return {
        "category": category,
        "install_action": action,
        "fit_score": fit,
        "grade": grade,
        "grade_label": GRADE_LABELS[grade],
        "personal_reason": reason,
        "use_case_zh": CATEGORY_USE_CASES.get(category, "先確認實際需求與現有工具缺口，再決定是否採用。"),
        "caution_zh": CATEGORY_CAUTIONS.get(category, "採用前確認授權、維護狀態、官方來源、網路連線與資料安全。"),
    }


def fallback_summary(repo: dict[str, Any], profile: dict[str, Any]) -> dict[str, Any]:
    category = profile["category"]
    description = normalize_text(repo.get("description"))
    if description:
        summary = f"這是一個屬於「{category}」的高星 GitHub 專案；主要功能可由原始說明「{description}」進一步確認。"
    else:
        summary = f"這是一個屬於「{category}」的高星 GitHub 專案；目前缺少足夠說明，採用前應先閱讀 README 與官方文件。"
    use_case = profile["use_case_zh"]
    caution = profile["caution_zh"]
    return {
        "summary_zh": summary,
        "use_case_zh": use_case,
        "caution_zh": caution,
        "key_points_zh": [summary, use_case, f"採用判斷：{profile['install_action']}。{profile['personal_reason']}"],
        "summary_source": "rule-fallback",
    }


def extract_response_text(payload: dict[str, Any]) -> str:
    direct = payload.get("output_text")
    if isinstance(direct, str) and direct.strip():
        return direct.strip()
    parts: list[str] = []
    for output in payload.get("output", []) or []:
        for content in output.get("content", []) or []:
            text = content.get("text")
            if isinstance(text, str):
                parts.append(text)
    return "\n".join(parts).strip()


def parse_json_text(text: str) -> Any:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        first_obj = text.find("{")
        last_obj = text.rfind("}")
        if first_obj >= 0 and last_obj > first_obj:
            return json.loads(text[first_obj:last_obj + 1])
        first_arr = text.find("[")
        last_arr = text.rfind("]")
        if first_arr >= 0 and last_arr > first_arr:
            return json.loads(text[first_arr:last_arr + 1])
        raise


def summarize_with_openai(candidates: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key or not candidates:
        return {}
    model = os.getenv("OPENAI_MODEL", DEFAULT_OPENAI_MODEL).strip() or DEFAULT_OPENAI_MODEL
    compact = [{
        "full_name": repo.get("full_name"),
        "description": normalize_text(repo.get("description")),
        "topics": repo.get("topics") or [],
        "language": repo.get("language"),
        "license": license_name(repo),
        "homepage": repo.get("homepage"),
    } for repo in candidates]

    instructions = (
        "你是熟悉開源軟體、AI 工具與遊戲開發的技術編輯。"
        "請只根據提供的公開 GitHub 中繼資料，以台灣繁體中文撰寫中性、精準、不誇大的功能摘要。"
        "每項輸出 summary_zh（45到95字）、use_case_zh（35到80字）、caution_zh（25到70字），"
        "以及 key_points_zh（三個不重複的重點）。不要宣稱已驗證 README 未提供的功能。"
        "只輸出合法 JSON：{\"items\":[{\"full_name\":...,\"summary_zh\":...,\"use_case_zh\":...,\"caution_zh\":...,\"key_points_zh\":[...]}]}。"
    )
    body = {
        "model": model,
        "instructions": instructions,
        "input": json.dumps(compact, ensure_ascii=False),
        "store": False,
        "max_output_tokens": min(6000, 700 + len(candidates) * 420),
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "github-top100-zh-tw-dashboard/1.0",
    }
    response = http_json(OPENAI_ENDPOINT, headers=headers, data=json.dumps(body).encode("utf-8"), timeout=90)
    parsed = parse_json_text(extract_response_text(response))
    rows = parsed.get("items", []) if isinstance(parsed, dict) else parsed
    result: dict[str, dict[str, Any]] = {}
    for row in rows if isinstance(rows, list) else []:
        if not isinstance(row, dict):
            continue
        full_name = str(row.get("full_name") or "")
        summary = normalize_text(row.get("summary_zh"))
        if not full_name or not summary:
            continue
        key_points = [normalize_text(point) for point in (row.get("key_points_zh") or []) if normalize_text(point)][:3]
        result[full_name] = {
            "summary_zh": summary,
            "use_case_zh": normalize_text(row.get("use_case_zh")),
            "caution_zh": normalize_text(row.get("caution_zh")),
            "key_points_zh": key_points,
            "summary_source": f"openai:{model}",
        }
    return result


def main() -> int:
    now = datetime.now(TIMEZONE)
    today = now.date().isoformat()
    generated_at = now.isoformat(timespec="seconds")

    previous_data = load_json(TOP100_PATH, {"meta": {}, "items": []})
    previous_items = previous_data.get("items", []) if isinstance(previous_data, dict) else []
    previous_by_name = {item.get("full_name"): item for item in previous_items if item.get("full_name")}
    previous_rank = {name: int(item.get("rank", 9999)) for name, item in previous_by_name.items()}
    previous_stars = {name: int(item.get("stars", 0) or 0) for name, item in previous_by_name.items()}

    overrides = load_json(OVERRIDES_PATH, {})
    cache_document = load_json(CACHE_PATH, {"version": 1, "entries": {}})
    cache = cache_document.setdefault("entries", {})

    print("Fetching GitHub Top 100 by cumulative stars…")
    github_repos = fetch_github_top100()

    prepared: list[dict[str, Any]] = []
    ai_candidates: list[dict[str, Any]] = []
    summary_by_name: dict[str, dict[str, Any]] = {}

    for repo in github_repos:
        full_name = str(repo.get("full_name") or "")
        override = overrides.get(full_name, {}) if isinstance(overrides, dict) else {}
        profile = {**infer_profile(repo), **{k: v for k, v in override.items() if k not in {"summary_zh", "use_case_zh", "caution_zh", "locked_summary"}}}
        profile["grade_label"] = profile.get("grade_label") or GRADE_LABELS.get(profile.get("grade"), "待判讀")
        repo_fp = fingerprint(repo)

        if override.get("summary_zh") and override.get("locked_summary", True):
            summary = {
                "summary_zh": override["summary_zh"],
                "use_case_zh": override.get("use_case_zh") or profile["use_case_zh"],
                "caution_zh": override.get("caution_zh") or profile["caution_zh"],
                "key_points_zh": [
                    override["summary_zh"],
                    override.get("use_case_zh") or profile["use_case_zh"],
                    f"採用判斷：{profile['install_action']}。{profile['personal_reason']}",
                ],
                "summary_source": "manual-curated",
            }
        elif isinstance(cache.get(full_name), dict) and cache[full_name].get("fingerprint") == repo_fp:
            summary = {k: cache[full_name].get(k) for k in ["summary_zh", "use_case_zh", "caution_zh", "key_points_zh", "summary_source"]}
        else:
            summary = fallback_summary(repo, profile)
            ai_candidates.append(repo)

        summary_by_name[full_name] = summary
        prepared.append({"repo": repo, "profile": profile, "fingerprint": repo_fp})

    max_ai = max(0, int(os.getenv("MAX_AI_SUMMARIES_PER_RUN", "12")))
    ai_results: dict[str, dict[str, Any]] = {}
    if ai_candidates and os.getenv("OPENAI_API_KEY", "").strip() and max_ai:
        print(f"Generating Traditional Chinese summaries for up to {min(max_ai, len(ai_candidates))} new/changed repositories…")
        try:
            ai_results = summarize_with_openai(ai_candidates[:max_ai])
        except Exception as exc:  # keep ranking update alive if summarization fails
            print(f"warning: OpenAI summarization failed: {exc}", file=sys.stderr)

    new_items: list[dict[str, Any]] = []
    for index, prepared_item in enumerate(prepared, start=1):
        repo = prepared_item["repo"]
        profile = prepared_item["profile"]
        full_name = str(repo["full_name"])
        repo_fp = prepared_item["fingerprint"]
        summary = ai_results.get(full_name) or summary_by_name[full_name]
        if full_name in ai_results:
            cache[full_name] = {"fingerprint": repo_fp, "updated_at": generated_at, **summary}

        old_rank = previous_rank.get(full_name)
        is_new = old_rank is None
        rank_change = 0 if old_rank is None else old_rank - index
        stars = int(repo.get("stargazers_count") or 0)
        stars_change = 0 if full_name not in previous_stars else stars - previous_stars[full_name]
        key_points = summary.get("key_points_zh") or []
        if len(key_points) < 3:
            key_points = [
                summary.get("summary_zh"),
                summary.get("use_case_zh") or profile["use_case_zh"],
                f"採用判斷：{profile['install_action']}。{profile['personal_reason']}",
            ]

        new_items.append({
            "rank": index,
            "previous_rank": old_rank,
            "rank_change": rank_change,
            "is_new": is_new,
            "full_name": full_name,
            "name": repo.get("name"),
            "owner": (repo.get("owner") or {}).get("login"),
            "html_url": repo.get("html_url"),
            "homepage": repo.get("homepage") or None,
            "description": normalize_text(repo.get("description")),
            "description_zh": summary.get("summary_zh"),
            "summary_zh": summary.get("summary_zh"),
            "use_case_zh": summary.get("use_case_zh") or profile["use_case_zh"],
            "caution_zh": summary.get("caution_zh") or profile["caution_zh"],
            "key_points_zh": [normalize_text(point) for point in key_points if normalize_text(point)][:3],
            "summary_source": summary.get("summary_source", "unknown"),
            "stars": stars,
            "stars_change": stars_change,
            "forks": int(repo.get("forks_count") or 0),
            "open_issues": int(repo.get("open_issues_count") or 0),
            "watchers": int(repo.get("watchers_count") or 0),
            "language": repo.get("language"),
            "license": license_name(repo),
            "topics": sorted(repo.get("topics") or []),
            "archived": bool(repo.get("archived")),
            "created_at": repo.get("created_at"),
            "updated_at": repo.get("updated_at"),
            "pushed_at": repo.get("pushed_at"),
            "category": profile["category"],
            "install_action": profile["install_action"],
            "fit_score": int(profile["fit_score"]),
            "grade": profile["grade"],
            "grade_label": profile["grade_label"],
            "personal_reason": profile["personal_reason"],
        })

    grade_counts = dict(Counter(item["grade"] for item in new_items))
    new_entries = sum(1 for item in new_items if item["is_new"])
    data = {
        "meta": {
            "title": "GitHub 前百大中文精選｜下載、重點與個人推薦",
            "generated_at": generated_at,
            "ranking_snapshot_date": today,
            "data_status": "GitHub API 每日更新；繁中摘要採人工快取與新進榜增量摘要",
            "timezone": "Asia/Taipei",
            "source_url": f"{GITHUB_API}?q=stars%3A%3E1&sort=stars&order=desc&per_page=100",
            "methodology": "依 GitHub 累積 Stars 排序；Public 不必然等於開源，仍須檢查 README、LICENSE、SECURITY、Release 與實際需求。",
            "count": len(new_items),
            "grade_counts": grade_counts,
            "new_entries": new_entries,
            "summary_mode": "人工快取＋OpenAI 增量摘要" if os.getenv("OPENAI_API_KEY", "").strip() else "人工快取＋規則式繁中備援",
        },
        "items": new_items,
    }

    history = load_json(HISTORY_PATH, {"timezone": "Asia/Taipei", "snapshots": []})
    snapshots = history.setdefault("snapshots", [])
    snapshot = {
        "date": today,
        "generated_at": generated_at,
        "top10": [{"rank": item["rank"], "full_name": item["full_name"], "stars": item["stars"]} for item in new_items[:10]],
        "grade_counts": grade_counts,
        "new_entries": new_entries,
    }
    snapshots = [row for row in snapshots if row.get("date") != today]
    snapshots.append(snapshot)
    snapshots.sort(key=lambda row: row.get("date", ""))
    history["snapshots"] = snapshots[-120:]

    save_json(TOP100_PATH, data)
    save_json(HISTORY_PATH, history)
    save_json(CACHE_PATH, cache_document)
    INITIAL_JS_PATH.write_text(
        "window.__INITIAL_DATA__ = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )

    print(f"Updated {len(new_items)} repositories; {new_entries} new entries; grades={grade_counts}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"fatal: {exc}", file=sys.stderr)
        raise SystemExit(1)
