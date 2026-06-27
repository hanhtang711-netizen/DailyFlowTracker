#!/bin/bash
# dft-cli.sh — Alfred ↔ DFT Bridge 命令行工具
# 用途：让 Claude/Alfred 通过 HTTP Bridge 操作 DFT，无需直接读写文件
# 端口：127.0.0.1:25713（DFT 默认）

set -o pipefail

HOST="${DFT_HOST:-http://127.0.0.1:25713}"
CMD="$1"; shift

die() { echo "{\"ok\":false,\"error\":\"$1\"}"; exit 1; }

_today() { date +"%Y-%-m-%-d"; }

case "$CMD" in
  ping)
    curl -sf "$HOST/ping" || die "DFT not running"
    ;;

  tasks)
    DATE="${1:-$(_today)}"
    curl -sf "$HOST/tasks?date=$DATE" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for t in d.get('tasks',[]):
    print(f'  {\"✅\" if t[\"done\"] else \"⬜\"} {t[\"id\"]} | {t[\"cat\"]} | {t[\"text\"]}')
"
    ;;

  tasks-json)
    DATE="${1:-$(_today)}"
    curl -sf "$HOST/tasks?date=$DATE"
    ;;

  unfinished)
    curl -sf "$HOST/tasks/unfinished" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for g in d.get('groups',[]):
    print(f'## {g[\"date\"]} ({len(g[\"tasks\"])} tasks)')
    for t in g['tasks']:
        print(f'  ⬜ {t[\"text\"][:60]}')
"
    ;;

  unfinished-json)
    curl -sf "$HOST/tasks/unfinished"
    ;;

  stats)
    DATE="${1:-$(_today)}"
    curl -sf "$HOST/stats?date=$DATE"
    ;;

  add)
    TEXT="$1"; CAT="${2:-Work}"; DATE="${3:-$(_today)}"
    [ -z "$TEXT" ] && die "Usage: dft-cli add <text> [cat] [date]"
    # Safe JSON via jq (no shell injection from $TEXT)
    if command -v jq &>/dev/null; then
      JSON=$(jq -n --arg text "$TEXT" --arg cat "$CAT" --arg date "$DATE" \
        '{text: $text, cat: $cat, date: $date}')
    else
      JSON=$(python3 -c "import json,sys; print(json.dumps({'text':sys.argv[1],'cat':sys.argv[2],'date':sys.argv[3]}))" "$TEXT" "$CAT" "$DATE")
    fi
    curl -sf -X POST "$HOST/add-task" \
      -H "Content-Type: application/json" \
      -d "$JSON"
    ;;

  done)
    ID="$1"; DATE="${2:-$(_today)}"
    [ -z "$ID" ] && die "Usage: dft-cli done <id> [date]"
    if command -v jq &>/dev/null; then
      JSON=$(jq -n --arg id "$ID" --arg date "$DATE" '{id: $id, done: true, date: $date}')
    else
      JSON=$(python3 -c "import json,sys; print(json.dumps({'id':sys.argv[1],'done':True,'date':sys.argv[2]}))" "$ID" "$DATE")
    fi
    curl -sf -X PATCH "$HOST/tasks" \
      -H "Content-Type: application/json" \
      -d "$JSON"
    ;;

  undo)
    ID="$1"; DATE="${2:-$(_today)}"
    [ -z "$ID" ] && die "Usage: dft-cli undo <id> [date]"
    if command -v jq &>/dev/null; then
      JSON=$(jq -n --arg id "$ID" --arg date "$DATE" '{id: $id, done: false, date: $date}')
    else
      JSON=$(python3 -c "import json,sys; print(json.dumps({'id':sys.argv[1],'done':False,'date':sys.argv[2]}))" "$ID" "$DATE")
    fi
    curl -sf -X PATCH "$HOST/tasks" \
      -H "Content-Type: application/json" \
      -d "$JSON"
    ;;

  delete)
    ID="$1"; DATE="${2:-$(_today)}"
    [ -z "$ID" ] && die "Usage: dft-cli delete <id> [date]"
    # URL-encode params to avoid query-string breakage
    EID=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$ID")
    EDATE=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$DATE")
    curl -sf -X DELETE "$HOST/tasks?id=$EID&date=$EDATE"
    ;;

  sync)
    curl -sf -X POST "$HOST/sync"
    ;;

  inject-file)
    FILE="$1"
    [ -z "$FILE" ] && die "Usage: dft-cli inject-file <dft-data.json>"
    # Validate HOST is localhost to prevent data exfiltration
    case "$HOST" in
      http://127.0.0.1:*) ;;
      http://localhost:*) ;;
      *) die "Invalid HOST: must be localhost (got $HOST)";;
    esac
    [ ! -f "$FILE" ] && die "File not found: $FILE"
    # Pass FILE and HOST via environment variables to prevent Python code injection
    DFT_FILE="$FILE" DFT_HOST="$HOST" python3 -c '
import json,os,sys,time
try: import requests
except ImportError:
    import urllib.request as ur
    class FakeResp: pass
    # Fallback: use stdlib only (no pip install needed)
    def _req(method, url, body=None):
        data = json.dumps(body).encode() if body else None
        req = ur.Request(url, data=data, headers={"Content-Type":"application/json"} if data else {}, method=method)
        try:
            with ur.urlopen(req, timeout=5) as resp:
                r = FakeResp(); r.status = resp.status; r.text = resp.read().decode()
                return r
        except Exception as e: raise
else:
    import requests as _requests
    def _req(method, url, body=None):
        return _requests.request(method, url, json=body, timeout=5)

with open(os.environ["DFT_FILE"]) as f: old = json.load(f)
BASE = os.environ["DFT_HOST"]
total = 0
for dk in sorted(old.get("days",{}).keys()):
    for t in old["days"][dk].get("tasks",[]):
        try:
            r = _req("POST", f"{BASE}/add-task", {"text":t.get("text",""),"cat":t.get("cat","Work"),"date":dk})
            if r.status == 200 and t.get("done"):
                r2 = _req("GET", f"{BASE}/tasks?date={dk}")
                tasks = json.loads(r2.text).get("tasks",[])
                match = [x for x in tasks if x.get("text")==t.get("text")]
                if match:
                    _req("PATCH", f"{BASE}/tasks", {"date":dk,"id":match[-1]["id"],"done":True})
            total += 1
            if total % 20 == 0: print(f"  ... {total} tasks injected", file=sys.stderr)
        except Exception as e:
            print(f"  ERR {dk} {t.get(\"text\",\"\")[:20]}: {e}", file=sys.stderr)
        time.sleep(0.05)
print(json.dumps({"ok":True,"injected":total}))
'
    ;;

  *)
    echo "DFT CLI — Alfred ↔ DFT Bridge"
    echo ""
    echo "  dft-cli ping                   健康检查"
    echo "  dft-cli tasks [date]           查看任务（人类可读）"
    echo "  dft-cli tasks-json [date]      查看任务（JSON）"
    echo "  dft-cli unfinished             未完成任务（人类可读）"
    echo "  dft-cli unfinished-json        未完成任务（JSON）"
    echo "  dft-cli stats [date]           每日统计"
    echo "  dft-cli add <text> [cat] [date] 添加任务"
    echo "  dft-cli done <id> [date]       标记完成"
    echo "  dft-cli undo <id> [date]       恢复未完成"
    echo "  dft-cli delete <id> [date]     删除任务"
    echo "  dft-cli sync                   强制同步"
    echo "  dft-cli inject-file <path>     从 dft-data.json 批量注入"
    ;;
esac
