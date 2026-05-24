# AI旅行私人定制方案生成

一个基于 AI 的旅行行程定制网页应用，输入目的地、天数、预算和偏好，一键生成专属旅行方案。

## 功能

- 🎯 输入目的地、天数、预算、偏好，一键生成行程
- ⚡ 支持特种兵 / 放松 / 综合三种旅行节奏
- 👫 为情侣 / 朋友 / 家人出行场景设计
- 📋 包含完整行程、住宿建议、美食推荐、交通指南
- 💰 清晰的预算分配
- ⚠️ 实用的注意事项提醒

## 技术栈

- HTML5 + CSS3 + JavaScript（ES6+）
- Marked.js（Markdown 渲染）
- 智谱 AI GLM-4 API

## 本地运行

```bash
# 浏览器直接打开
双击 index.html

# 或用 Python 启动本地服务器
python -m http.server 8080
# 然后访问 http://localhost:8080
```

## 项目结构

```
├── index.html          # 产品落地页
├── ai-travel-web/      # 核心应用
│   ├── index.html      # 行程生成页面
│   ├── css/style.css   # 样式文件
│   ├── js/api.js       # API 调用配置
│   ├── js/app.js       # 应用逻辑
│   └── README.md       # 使用说明
└── .gitignore
```
