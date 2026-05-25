# ✈️ AI 旅行规划助手

> 基于 LLM + RAG + 地图 POI + 本地持久化的个性化情侣旅行行程生成系统

一键输入目的地和偏好，AI 自动生成包含每日行程、预算分配、地图路线、天气预报、AI 风景图的完整旅行方案。支持流式输出、历史记录、倒数日提醒、PDF 导出。

---

## 🖼️ 项目截图

> 截图待补充，截图清单见 [docs/screenshots/README.md](docs/screenshots/README.md)

---

## 🚀 核心功能

| 模块 | 功能 |
|------|------|
| 🤖 **AI 行程生成** | 智谱 GLM-4 驱动，流式 SSE 输出，逐字显示 |
| 🗺️ **地图路线** | 高德 POI 搜索，景点坐标 + 按天配色路线连线 |
| 🌤️ **天气预报** | wttr.in 实时天气，当前温度 + 5日预报 |
| 📊 **预算饼图** | Canvas 自动解析预算表格，可视化占比 |
| 🖼️ **AI 生图** | CogView-3-Flash 生成目的地风景照 |
| 📚 **RAG 知识库** | 自建 Embedding 向量库，检索私有旅行资料 |
| 💾 **本地持久化** | SQLite 存储偏好、历史行程、倒数日 |
| 📄 **PDF 导出** | 浏览器打印另存为 PDF |
| ✏️ **编辑行程** | 支持在线修改、实时预览 |

---

## 🏗️ 技术架构

```
┌─────────────────────────────────────────────┐
│                 前端 (SPA)                    │
│  HTML5 + CSS3 + JS  │  Leaflet 地图          │
│  Marked.js 渲染     │  Canvas 饼图           │
│  SSE 流式接收       │  localStorage          │
└─────────────────┬───────────────────────────┘
                  │ HTTP/SSE
┌─────────────────▼───────────────────────────┐
│           FastAPI 后端 (Python)               │
│  /api/generate-plan  │  流式行程生成          │
│  /api/generate-image │  AI 风景图             │
│  /api/rag-query      │  知识库问答            │
│  /api/weather        │  天气查询              │
│  /api/gaode-search   │  高德 POI 搜索         │
│  /api/history        │  行程历史 CRUD         │
│  /api/countdowns     │  倒数日管理            │
│  /api/prefs          │  用户偏好              │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│            数据 & 外部服务                    │
│  SQLite  │  智谱 GLM-4  │  高德地图 API       │
│  RAG 向量库  │  CogView-3  │  wttr.in         │
└─────────────────────────────────────────────┘
```

## 🛠️ 技术栈

**后端：** Python · FastAPI · SQLite · SSE 流式响应 · urllib  
**前端：** 原生 HTML/CSS/JS · Leaflet.js · Marked.js · Canvas  
**AI：** 智谱 GLM-4（对话）· CogView-3-Flash（生图）· Embedding-2（RAG）  
**地图：** 高德 Web服务 API v5  
**天气：** wttr.in 免费 API  

---

## 📦 本地运行

### 前置要求
- Python 3.10+
- 智谱 AI API Key（[注册获取](https://open.bigmodel.cn/)）
- 高德地图 Web服务 Key（[注册获取](https://lbs.amap.com/)）

### 安装运行

```bash
# 1. 克隆仓库
git clone https://github.com/Ash-0527/ai-travel.git
cd ai-travel

# 2. 设置环境变量
# 方式一：直接在终端中导出（推荐，无需额外依赖）
export ZHIPU_API_KEY="你的智谱Key"
export GAODE_API_KEY="你的高德Key"

# 方式二：参考 .env.example 创建 .env 文件，然后在终端中 source .env
# （项目不自动读取 .env 文件，需手动执行 source .env 加载环境变量）

# 3. 安装依赖
pip install -r requirements.txt

# 4. 启动后端（从项目根目录运行）
uvicorn backend.server:app --host 0.0.0.0 --port 8080 --reload

# 如果希望直接运行 Python 脚本
python backend/server.py

# 5. 打开浏览器
# http://localhost:8080
```

---

## 📋 API 列表

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/generate-plan?stream=true` | SSE 流式生成行程 |
| POST | `/api/generate-image` | AI 生成景点风景图 |
| POST | `/api/rag-query` | RAG 知识库问答 |
| GET | `/api/weather?city=北京` | 目的地天气 |
| POST | `/api/gaode-search` | 高德 POI 搜索 |
| GET | `/api/history` | 历史行程列表 |
| GET | `/api/history/{id}` | 行程详情 |
| DELETE | `/api/history/{id}` | 删除行程 |
| GET | `/api/countdowns` | 倒数日列表 |
| POST | `/api/prefs` | 保存用户偏好 |
| GET | `/api/prefs` | 获取用户偏好 |

---

## 💡 项目亮点（简历可写）

- 使用 **FastAPI + SSE 流式输出** 生成长文本行程，改善等待体验
- 集成 **高德 POI 搜索**，将 AI 行程中的景点映射到真实地图坐标并绘制路线
- 构建 **轻量 RAG 知识库**（纯 Python 标准库），用 Embedding 向量检索补充私有旅行资料
- 基于 **SQLite** 实现用户偏好、历史行程和倒数日的本地持久化
- 前端支持 Markdown 渲染、编辑、打印 PDF、复制分享

---

## ⚠️ 免责声明

本项目的行程、餐饮、交通、住宿等信息均由 **AI 大模型生成**，仅供参考和灵感启发。  
**车次/航班时刻、门票价格、营业时间、酒店价格等请在出行前通过官方渠道二次确认。**

天气数据来自 wttr.in，高德地图坐标仅供参考。

---

## 🔮 后续规划

- [ ] Docker 一键部署
- [ ] 用户系统（多用户隔离）
- [ ] 行程分享链接
- [ ] 更多目的地知识库资料
- [ ] 移动端 PWA 支持
