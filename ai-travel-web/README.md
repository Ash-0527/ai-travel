# AI旅行私人定制方案生成

一个简单的网页应用，帮助你快速生成专属旅行行程方案。

![Preview](https://img.shields.io/badge/Status-Ready-brightgreen)
![License](https://img.shields.io/badge/License-MIT-blue)

## 功能特点

- 🎯 输入目的地、天数、预算、偏好，一键生成行程
- ⚡ 支持特种兵/放松/综合三种节奏
- 👫 专为情侣/朋友/家人出行设计
- 📋 完整的行程、住宿、美食、交通建议
- 💰 预算分配清晰
- ⚠️ 注意事项提醒

## 使用方法

### 1. 配置API Key

在使用之前，你需要配置AI API Key：

1. 访问 [智谱AI开放平台](https://open.bigmodel.cn/)
2. 注册账号并获取API Key
3. 打开 `js/api.js` 文件
4. 将 `YOUR_API_KEY_HERE` 替换为你的API Key：

```javascript
const AI_CONFIG = {
    apiKey: '你的API Key填在这里',
    // ...
}
```

### 2. 本地运行

直接用浏览器打开 `index.html` 文件即可：

```bash
# 方式1：直接打开
# 在文件管理器中双击 index.html

# 方式2：使用Python本地服务器
python -m http.server 8080
# 然后访问 http://localhost:8080
```

## 部署上线

### 方式1：GitHub Pages（推荐）

```bash
# 1. 创建GitHub仓库
# 访问 https://github.com/new

# 2. 上传代码
git init
git add .
git commit -m "init"
git remote add origin https://github.com/你的用户名/ai-travel-web.git
git push -u origin main

# 3. 开启GitHub Pages
# Settings → Pages → Source: main branch → Save

# 4. 访问
# https://你的用户名.github.io/ai-travel-web/
```

### 方式2：Vercel

```bash
# 1. 安装Vercel CLI
npm i -g vercel

# 2. 部署
vercel

# 3. 按提示操作，免费托管
```

### 方式3：Netlify

1. 访问 https://app.netlify.com
2. 拖拽整个项目文件夹到网页
3. 自动部署完成

## 技术栈

- HTML5 + CSS3 + JavaScript (ES6+)
- Marked.js (Markdown解析)
- 智谱AI API (GLM-4)

## 注意事项

- 本项目使用智谱AI的免费API额度，默认够个人使用
- 如遇到API调用失败，请检查API Key是否正确
- 生成结果仅供参考，实际出行前请再次确认信息

## 更新日志

### v1.0 (2026-04-29)
- 初始版本
- 支持行程生成
- 支持三种节奏偏好
- 支持复制结果

---

Made with ❤️ for AI Travel