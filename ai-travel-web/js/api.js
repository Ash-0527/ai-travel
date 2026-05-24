// AI API 配置
// 请替换为你的智谱AI API Key
// 获取地址：https://open.bigmodel.cn/

const AI_CONFIG = {
    // 在这里填入你的API Key
    apiKey: '259a8d14a01049c5882a313db56eb72b.6mJllCcegeLaMV4O',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4'
}

// 构建发送给AI的提示词
function buildPrompt(data) {
    const { origin, destination, startDate, days, budget, pace, people, preferences, transport } = data
    
    const peopleDesc = {
        '情侣': '2人，情侣。女生喜欢拍照、喜欢漂亮风景、喜欢打卡、不喜欢排队。男生喜欢随意放松。双方可以互相迁就。',
        '朋友': '2-4人，朋友出行。喜欢自由、轻松，不喜欢太赶。',
        '家人': '2-4人，家人出行。需要兼顾不同年龄段，节奏适中。'
    }
    
    return `# 角色
你是一位专业的旅行规划师，专门为用户定制个性化旅行方案。

# 用户需求
- 出发地点：${origin}
- 目的地：${destination}
- 出发日期：${startDate}
- 天数：${days}天
- 人均预算：${budget}元
- 出行方式偏好：${transport}
- 节奏偏好：${pace}
- 出行人员：${people}
- 特殊偏好：${preferences || '无特定要求'}

# 用户画像
${peopleDesc[people] || peopleDesc['情侣']}

# 输出要求
请按以下Markdown格式输出（内容要详尽完整）：

## ✈️ 出发与到达
- 出发地点：
- 目的地：
- 推荐出行方式：高铁/飞机/自驾（根据距离和预算给出建议）
- 预计出发时间：
- 预计到达时间：

## 📋 行程概览
（一句话总结整体行程主题）

## 🗓️ 每日详细行程（非常重要！每天都要详细）

### Day 1: [日期] - [主题]
**上午：** 具体时间 + 具体景点/活动 + 建议时长
**中午：** 午餐推荐（店名 + 地址 + 招牌菜 + 价位）
**下午：** 具体时间 + 具体景点/活动
**晚上：** 晚餐推荐（店名 + 地址 + 招牌菜 + 价位）
**住宿：** 推荐酒店/民宿（名称 + 区域 + 价位）

### Day 2: [日期] - [主题]
（按同样格式详细列出）

（后续每天按此格式，直到Day ${days}）

## 🏨 住宿推荐（每天的住宿都要列出）
- Day 1住宿：区域 + 酒店名 + 价位
- Day 2住宿：区域 + 酒店名 + 价位
（以此类推）

## 🍜 美食推荐（按每餐列出，不要只列店名，要具体）
- Day 1早餐：店名 + 推荐菜
- Day 1午餐：店名 + 推荐菜 + 价位
- Day 1晚餐：店名 + 推荐菜 + 价位
（每天的每顿饭都要列出）

## 🚄 交通建议
### 城际交通（出发地到目的地）
- 推荐方式：高铁/飞机/自驾
- 理由：
- 耗时：
- 费用估算：

### 城内交通
- 每天的交通方式建议（打车/地铁/公交/包车等）

## 💰 预算分配（要详细到每一项）
| 类别 | 预估费用 | 备注 |
|------|---------|------|
| 城际交通（往返） | 元 | 高铁/机票 |
| 城内交通 | 元 | 打车/地铁/包车 |
| 住宿（${days}晚） | 元 | 每晚均价 |
| 餐饮 | 元 | 每天约 |
| 门票/体验 | 元 | 景点门票 |
| 其他 | 元 | 特产/应急 |
| **合计** | **元** | 人均 |

## 🎫 预订清单（需要提前预订的项目）
- ☐ 往返交通：高铁票/机票（提前XX天）
- ☐ 景点门票：XXX（提前XX天预约）
- ☐ 酒店住宿：XXX（提前XX天）
- ☐ 其他：

## ⚠️ 注意事项
- 需要提前预约的景点：
- 可能需要排队的地方：
- 季节/天气提醒：
- 穿搭建议：
- 必备物品：
- 其他实用 tips：

# 约束
- 每天行程不要安排太满，留出拍照、休息、吃饭的时间
- 考虑用户不爱排队，标注哪些景点可能需要早起或排队
- 推荐的餐厅尽量选择本地人常去的，不是网红营销店
- 预算分配要合理，符合用户给出的预算范围
- 使用emoji让输出更生动
- 输出完整的、可直接执行的行程方案
- 每一项都要具体，不要泛泛而谈`
}

// 调用AI API
async function callAI(prompt) {
    if (AI_CONFIG.apiKey === 'YOUR_API_KEY_HERE' || !AI_CONFIG.apiKey) {
        throw new Error('请先配置API Key！详见 js/api.js 文件中的说明。')
    }
    
    try {
        const response = await fetch(`${AI_CONFIG.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${AI_CONFIG.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: AI_CONFIG.model,
                messages: [
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7,
                top_p: 0.9
            })
        })
        
        const data = await response.json()
        
        if (data.error) {
            throw new Error(data.error.message || 'AI调用失败')
        }
        
        if (data.choices && data.choices[0]) {
            return data.choices[0].message.content
        } else {
            throw new Error('AI返回格式异常')
        }
    } catch (error) {
        console.error('AI调用失败:', error)
        throw error
    }
}