# 📸 项目截图

运行项目后，请在此目录下放置以下截图用于 README 展示：

## 需要的截图

| 文件名 | 说明 | 截图内容 |
|--------|------|---------|
| `home.png` | 首页表单 | 完整表单界面，展示出发地、目的地、日期、预算等输入区域 |
| `result.png` | 行程结果 | AI 生成的完整行程方案，展示 Markdown 渲染效果 |
| `map.png` | 地图路线 | Leaflet 地图展示景点标记和按天配色的路线连线 |
| `budget.png` | 预算饼图 | Canvas 绘制的预算分配饼图 + 图例 |
| `weather.png` | 天气模块 | 当前温度 + 5日天气预报卡片 |
| `history.png` | 历史面板 | 历史行程列表 + 倒数日面板 |

## 截图方法

1. 启动项目后打开 `http://localhost:8080`
2. 填写表单生成一个行程（如：杭州 → 大理，4天）
3. 使用浏览器开发者工具截取全页面：
   - Chrome: F12 → Ctrl+Shift+P → "Capture full size screenshot"
   - 或使用截图工具分区域截取
4. 将截图重命名为对应文件名放入此目录
5. 同时在根目录创建 `docs/screenshots/.gitkeep` 占位

## README 引用方式

截图放入后，README 中会自动显示：

```markdown
![首页](docs/screenshots/home.png)
![行程结果](docs/screenshots/result.png)
```
