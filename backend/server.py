"""
AI 旅行定制 - FastAPI 后端
提供：行程生成 / AI 生图 / RAG 知识库问答
"""
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
import json
import urllib.request
import urllib.error
import urllib.parse
import os
import math
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

# 把 RAG 脚本的路径加进来
sys.path.insert(0, "/mnt/d/大模型学习资料/ai旅行")
from rag_demo import search, load_vector_db, generate_answer
from db import init_db, save_prefs, load_prefs, save_trip, list_trips, get_trip, delete_history, delete_countdown_by_dest
from db import add_countdown, get_countdowns, delete_countdown

app = FastAPI(title="AI Travel API")

# 初始化数据库
init_db()

# 允许前端跨域访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# 配置
# ============================================================
ZHIPU_API_KEY = os.environ.get("ZHIPU_API_KEY", "")
CHAT_MODEL = "glm-4"
IMAGE_MODEL = "cogview-3-flash"
GAODE_KEY = "7cdd7af52f093440a211cb7db78f59df"  # 高德地图 Web服务 Key

# 启动检查
if not ZHIPU_API_KEY and __name__ == "__main__":
    print("⚠️ 请设置环境变量 ZHIPU_API_KEY")
    print("   export ZHIPU_API_KEY=你的Key")

# ============================================================
# 工具函数
# ============================================================
def call_zhipu(endpoint, body):
    """调用智谱 API"""
    url = f"https://open.bigmodel.cn/api/paas/v4/{endpoint}"
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Authorization", f"Bearer {ZHIPU_API_KEY}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise HTTPException(status_code=e.code, detail=e.read().decode())

# ============================================================
# 数据模型
# ============================================================
class TravelRequest(BaseModel):
    origin: str
    destination: str
    start_date: str
    days: int
    budget: int
    pace: str = "放松"
    people: str = "情侣"
    preferences: str = ""
    transport: str = "高铁"

class RAGRequest(BaseModel):
    query: str

class ImageRequest(BaseModel):
    destination: str
    style: str = "风景照"

# ============================================================
# API 路由
# ============================================================
@app.get("/api/health")
def health():
    return {"status": "ok", "service": "AI Travel API"}

# 托管前端静态文件
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..")
app.mount("/css", StaticFiles(directory=os.path.join(FRONTEND_DIR, "css")), name="css")
app.mount("/js", StaticFiles(directory=os.path.join(FRONTEND_DIR, "js")), name="js")

@app.get("/")
def index():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

@app.post("/api/generate-plan")
def generate_plan(req: TravelRequest, stream: bool = Query(False)):
    """生成旅行行程方案，支持流式输出"""
    people_desc = {
        "情侣": "2人，情侣。女生喜欢拍照、喜欢漂亮风景、喜欢打卡、不喜欢排队。男生喜欢随意放松。",
        "朋友": "2-4人，朋友出行。喜欢自由、轻松，不喜欢太赶。",
        "家人": "2-4人，家人出行。需要兼顾不同年龄段，节奏适中。"
    }

    prompt_text = f"""# 角色
你是一位专业的旅行规划师。你必须**严格按照用户指定的出行方式**来规划交通，不得自行更改。

# 用户需求
- 出发地点：{req.origin}
- 目的地：{req.destination}
- 出发日期：{req.start_date}
- 天数：{req.days}天
- 人均预算：{req.budget}元（预算金额必须真实合理，机票/高铁票价格请基于常识估算实际票价，不要随意编造）
- 出行方式：{req.transport}（必须严格按此方式规划！如果选了飞机就写航班，选高铁就写车次，选自驾就写驾车路线，不要混用。航班号和车次仅供参考，非实时查询）
- 节奏偏好：{req.pace}
- 出行人员：{req.people}
- 特殊偏好：{req.preferences or '无特定要求'}

# 用户画像
{people_desc.get(req.people, people_desc['情侣'])}

# 输出要求
请按以下 Markdown 格式输出完整方案：

## ✈️ 出发与到达
## 📋 行程概览
## 🗓️ 每日详细行程
## 🗺️ 景点坐标（JSON 格式，列出行程中提到的所有景点。每个景点包含 name 景点名称、lat 纬度、lng 经度，只输出中国境内真实存在的景点，坐标务必准确）
## 🏨 住宿推荐
## 🍜 美食推荐
## 🚄 交通建议
## 💰 预算分配（表格，每项都是人均价格，总计必须约等于用户填的人均预算。表头：项目 | 人均费用(元) | 说明）
## 🎒 行李清单（贴心提醒情侣出行需要带的物品：证件类、衣物类、护肤类、电子设备、应急药品等，根据目的地和季节调整）
## 🎫 预订清单
## ⚠️ 注意事项

要求：详尽、具体、可执行。用 emoji 让输出生动。预算价格务必真实可信，基于中国国内市场实际价格水平。预算表格里的每一项都是人均价格（2人出行），不要写总价。"""

    if not stream:
        # 非流式：一次性返回
        resp = call_zhipu("chat/completions", {
            "model": CHAT_MODEL,
            "messages": [{"role": "user", "content": prompt_text}],
            "temperature": 0.7
        })
        plan = resp["choices"][0]["message"]["content"]

        # 自动保存
        save_prefs({"pace": req.pace, "budget": str(req.budget), "transport": req.transport, "preferences": req.preferences})
        save_trip(req.origin, req.destination, req.start_date, req.days, req.budget, req.pace, req.preferences, plan)
        existing = get_countdowns()
        if not any(c["destination"] == req.destination and c["departure_date"] == req.start_date for c in existing):
            add_countdown(req.destination, req.start_date, f"{req.days}天行程")

        return {"plan": plan}

    # 流式输出
    def stream_response():
        full_text = ""
        try:
            url = "https://open.bigmodel.cn/api/paas/v4/chat/completions"
            body = json.dumps({
                "model": CHAT_MODEL,
                "messages": [{"role": "user", "content": prompt_text}],
                "temperature": 0.7,
                "stream": True
            }).encode("utf-8")
            req_obj = urllib.request.Request(url, data=body, method="POST")
            req_obj.add_header("Authorization", f"Bearer {ZHIPU_API_KEY}")
            req_obj.add_header("Content-Type", "application/json")

            with urllib.request.urlopen(req_obj, timeout=120) as resp:
                for line in resp:
                    line = line.decode("utf-8").strip()
                    if not line or not line.startswith("data: "):
                        continue
                    data_str = line[6:]
                    if data_str == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data_str)
                        delta = chunk.get("choices", [{}])[0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            full_text += content
                            yield f"data: {json.dumps({'content': content})}\n\n"
                    except json.JSONDecodeError:
                        continue
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        finally:
            # 流结束后保存数据
            if full_text.strip():
                try:
                    save_prefs({"pace": req.pace, "budget": str(req.budget), "transport": req.transport, "preferences": req.preferences})
                    save_trip(req.origin, req.destination, req.start_date, req.days, req.budget, req.pace, req.preferences, full_text)
                    existing = get_countdowns()
                    if not any(c["destination"] == req.destination and c["departure_date"] == req.start_date for c in existing):
                        add_countdown(req.destination, req.start_date, f"{req.days}天行程")
                except:
                    pass
            yield "data: [DONE]\n\n"

    return StreamingResponse(stream_response(), media_type="text/event-stream")

@app.post("/api/generate-image")
def generate_image(req: ImageRequest):
    """生成目的地风景图片"""
    prompt = f"中国{req.destination}的标志性风景，{req.style}，高清，自然光线，旅游宣传片风格"

    resp = call_zhipu("images/generations", {
        "model": IMAGE_MODEL,
        "prompt": prompt
    })
    return {"image_url": resp["data"][0]["url"]}

@app.post("/api/rag-query")
def rag_query(req: RAGRequest):
    """RAG 知识库问答"""
    db = load_vector_db()
    if db is None:
        raise HTTPException(status_code=500, detail="向量库未构建，请先运行 python rag_demo.py build")

    results = search(req.query, db, top_k=3)
    contexts = [item for _, item in results]
    answer = generate_answer(req.query, contexts)

    sources = [{"source": item["source"], "text": item["text"][:100]}
               for _, item in results]

    return {"answer": answer, "sources": sources}

# ============================================================
# 偏好 API
# ============================================================
@app.get("/api/prefs")
def get_prefs():
    return load_prefs()

@app.post("/api/prefs")
def set_prefs(prefs: dict):
    save_prefs(prefs)
    return {"status": "ok"}

# ============================================================
# 行程历史 API
# ============================================================
@app.get("/api/history")
def get_history(limit: int = 20):
    return list_trips(limit)

@app.get("/api/history/{trip_id}")
def get_trip_detail(trip_id: int):
    trip = get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="行程不存在")
    return trip

@app.delete("/api/history/{trip_id}")
def delete_trip(trip_id: int):
    trip = get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="行程不存在")
    delete_history(trip_id)
    # 同步删对应倒数日
    delete_countdown_by_dest(trip["destination"], trip["start_date"])
    return {"status": "ok"}

# ============================================================
# 倒数日 API
# ============================================================
class CountdownRequest(BaseModel):
    destination: str
    departure_date: str
    notes: str = ""

@app.post("/api/countdown")
def create_countdown(req: CountdownRequest):
    add_countdown(req.destination, req.departure_date, req.notes)
    return {"status": "ok"}

@app.get("/api/countdowns")
def list_countdowns():
    return get_countdowns()

@app.delete("/api/countdown/{cd_id}")
def remove_countdown(cd_id: int):
    delete_countdown(cd_id)
    return {"status": "ok"}

# ============================================================
# 天气 API（免费，基于 wttr.in）
# ============================================================
@app.get("/api/weather")
def get_weather(city: str):
    """获取目的地天气预报"""
    try:
        url = f"https://wttr.in/{urllib.parse.quote(city)}?format=j1&lang=zh"
        req_obj = urllib.request.Request(url, headers={"User-Agent": "AI-Travel/1.0"})
        with urllib.request.urlopen(req_obj, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        
        # 提取关键信息
        weather = data.get("weather", [{}])[0] if data.get("weather") else {}
        current = data.get("current_condition", [{}])[0] if data.get("current_condition") else {}
        
        forecast = []
        for day in weather.get("astronomy", []):
            forecast.append({
                "date": day.get("date", ""),
                "max_temp": day.get("maxtempC", ""),
                "min_temp": day.get("mintempC", ""),
                "sunrise": day.get("sunrise", ""),
                "sunset": day.get("sunset", ""),
            })
        # 合并 hourly 的天气描述
        hourly = weather.get("hourly", [])
        for i, f in enumerate(forecast[:7]):
            idx = i * 8  # 每天取一个时段
            if idx < len(hourly):
                desc = hourly[idx].get("lang_zh", [{}])
                f["desc"] = desc[0].get("value", "") if desc else ""
        
        return {
            "city": city,
            "current_temp": current.get("temp_C", ""),
            "current_desc": (current.get("lang_zh", [{}]) or [{}])[0].get("value", ""),
            "humidity": current.get("humidity", ""),
            "forecast": forecast[:5]  # 未来5天
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"天气查询失败: {str(e)}")

# ============================================================
# 高德地图 POI 搜索
# ============================================================
class PlanTextRequest(BaseModel):
    plan_text: str
    city: str = ""

@app.post("/api/gaode-search")
def gaode_search(req: PlanTextRequest):
    """从行程方案中提取景点名，通过高德搜索真实坐标，按天分组"""
    # 提取「每日详细行程」section
    section = req.plan_text
    m = re.search(r'##\s*🗓️\s*每日详细行程\s*\n(.*?)(?=##\s|\Z)', req.plan_text, re.DOTALL)
    if m:
        section = m.group(1)
    else:
        m = re.search(r'##\s*🗺️\s*景点坐标.*?\n(.*?)(?=##\s|\Z)', req.plan_text, re.DOTALL)
        if m:
            section = m.group(1)

    # 按「第X天」分割
    day_spots = {}
    days_raw = re.split(r'(?:###?\s*)?(?:第|Day\s*)\s*(\d+)\s*(?:天|日)', section)
    # 如果没匹配到，回退：全文提取不分天
    if len(days_raw) <= 2:
        all_spots = []
        for m in re.finditer(r'\*\*([^*]{2,20}?)\*\*', section):
            name = m.group(1).strip()
            if len(name) >= 2 and not name[0].isdigit():
                skip_words = ['预算','预订','注意','住宿','美食','交通','行李','清单',
                             '出发','到达','概览','行程','坐标','航班','车次','路线',
                             '酒店','民宿','餐厅','建议','提示','小时','分钟','公里',
                             '门票','人均','总计','上午','下午','晚上','早餐','午餐','晚餐']
                if not any(kw in name for kw in skip_words) and name not in all_spots:
                    all_spots.append(name)
        if all_spots:
            day_spots = {1: all_spots}
    else:
        # days_raw: ['', '1', '...content...', '2', '...content...', ...]
        current_day = None
        for i, chunk in enumerate(days_raw):
            if i == 0:
                continue
            if i % 2 == 1:  # day number
                current_day = int(chunk)
            elif current_day is not None:  # content
                spots = []
                for m in re.finditer(r'\*\*([^*]{2,20}?)\*\*', chunk):
                    name = m.group(1).strip()
                    if len(name) >= 2 and not name[0].isdigit():
                        skip_words = ['预算','预订','注意','住宿','美食','交通','行李','清单',
                                     '出发','到达','概览','行程','坐标','航班','车次','路线',
                                     '酒店','民宿','餐厅','建议','提示','小时','分钟','公里',
                                     '门票','人均','总计','上午','下午','晚上','早餐','午餐','晚餐']
                        if not any(kw in name for kw in skip_words) and name not in spots:
                            spots.append(name)
                if spots:
                    day_spots[current_day] = spots

    # 确定搜索城市
    search_city = req.city
    if search_city in ('', '全国', '云南', '四川', '浙江') or len(search_city) > 4:
        city_match = re.search(r'(?:目的地|到达)[：:]\s*([^\n]{2,6})', req.plan_text)
        if not city_match:
            city_match = re.search(r'(大理|丽江|昆明|西双版纳|香格里拉|腾冲|成都|重庆|杭州|苏州|南京|西安|长沙|武汉|厦门|青岛|三亚|北海|桂林)', req.plan_text)
        if city_match:
            search_city = city_match.group(1)

    # 收集所有待搜索的景点
    search_tasks = []  # [(day, name)]
    seen = set()
    for day in sorted(day_spots.keys()):
        for name in day_spots[day][:5]:
            if name not in seen:
                seen.add(name)
                search_tasks.append((day, name))

    # 并行搜索高德 POI
    def search_one(day, name):
        try:
            city_param = urllib.parse.quote(search_city) if search_city else '全国'
            search_url = f"https://restapi.amap.com/v5/place/text?keywords={urllib.parse.quote(name)}&city={city_param}&key={GAODE_KEY}&offset=1"
            req_obj = urllib.request.Request(search_url)
            with urllib.request.urlopen(req_obj, timeout=5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            pois = data.get("pois", [])
            if pois:
                p = pois[0]
                loc = p.get("location", "0,0").split(",")
                lat, lng = float(loc[1]) if len(loc) > 1 else 0, float(loc[0]) if len(loc) > 0 else 0
                return (day, {"name": p.get("name", name), "lat": lat, "lng": lng, "address": p.get("address", "")})
        except:
            pass
        return None

    day_results = {}
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {executor.submit(search_one, d, n): (d, n) for d, n in search_tasks}
        for f in as_completed(futures, timeout=20):
            result = f.result()
            if result:
                day, spot = result
                day_results.setdefault(day, []).append(spot)

    route_data = [{"day": day, "spots": day_results[day]} for day in sorted(day_results.keys()) if day_results[day]]
    return {"spots": route_data}


# ============================================================
# 启动
# ============================================================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
