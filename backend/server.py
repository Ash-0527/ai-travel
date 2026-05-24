"""
AI 旅行定制 - FastAPI 后端
提供：行程生成 / AI 生图 / RAG 知识库问答
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
import urllib.request
import urllib.error
import os
import math
import sys

# 把 RAG 脚本的路径加进来
sys.path.insert(0, "/mnt/d/大模型学习资料/ai旅行")
from rag_demo import search, load_vector_db, generate_answer

app = FastAPI(title="AI Travel API")

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

@app.post("/api/generate-plan")
def generate_plan(req: TravelRequest):
    """生成旅行行程方案"""
    people_desc = {
        "情侣": "2人，情侣。女生喜欢拍照、喜欢漂亮风景、喜欢打卡、不喜欢排队。男生喜欢随意放松。",
        "朋友": "2-4人，朋友出行。喜欢自由、轻松，不喜欢太赶。",
        "家人": "2-4人，家人出行。需要兼顾不同年龄段，节奏适中。"
    }

    prompt = f"""# 角色
你是一位专业的旅行规划师。

# 用户需求
- 出发地点：{req.origin}
- 目的地：{req.destination}
- 出发日期：{req.start_date}
- 天数：{req.days}天
- 人均预算：{req.budget}元
- 出行方式偏好：{req.transport}
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
## 🏨 住宿推荐
## 🍜 美食推荐
## 🚄 交通建议
## 💰 预算分配（表格）
## 🎫 预订清单
## ⚠️ 注意事项

要求：详尽、具体、可执行。用 emoji 让输出生动。"""

    resp = call_zhipu("chat/completions", {
        "model": CHAT_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.7
    })
    return {"plan": resp["choices"][0]["message"]["content"]}

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
# 启动
# ============================================================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
