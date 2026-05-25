// 主逻辑

// 后端地址（本地运行时用，GitHub Pages 上此地址不可用，会自动降级）
const BACKEND_URL = ''  // 前后端同端口，空就是当前地址

document.addEventListener('DOMContentLoaded', () => {
    // marked 配置：识别单换行
    if (typeof marked !== 'undefined') marked.setOptions({ breaks: true, gfm: true })

    const form = document.getElementById('travelForm')
    const resultSection = document.getElementById('result')
    const loading = document.getElementById('loading')
    const resultContent = document.getElementById('resultContent')
    const resultBody = document.getElementById('resultBody')
    const generateBtn = document.getElementById('generateBtn')
    
    // 出发日期默认今天
    const dateInput = document.getElementById('startDate')
    if (dateInput && !dateInput.value) {
        dateInput.value = new Date().toISOString().slice(0, 10)
    }
    
    // 表单提交
    form.addEventListener('submit', async (e) => {
        e.preventDefault()
        
        // 获取表单数据
        const formData = {
            origin: document.getElementById('origin').value.trim(),
            destination: document.getElementById('destination').value.trim(),
            startDate: document.getElementById('startDate').value,
            days: document.getElementById('days').value,
            budget: document.getElementById('budget').value,
            transport: document.getElementById('transport').value,
            pace: document.querySelector('input[name="pace"]:checked')?.value || '放松',
            people: '情侣',  // 私人定制，固定为情侣模式
            preferences: document.getElementById('preferences').value.trim()
        }
        
        if (!formData.origin || !formData.destination) {
            alert('请输入出发地和目的地')
            return
        }
        
        if (!formData.startDate) {
            alert('请选择出发日期')
            return
        }

        // 显示加载状态
        resultSection.style.display = 'block'
        loading.style.display = 'block'
        resultContent.style.display = 'none'
        generateBtn.disabled = true
        generateBtn.textContent = '⏳ AI生成中...'
        
        // 滚动到结果区域
        resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
        
        try {
            let plan = ''
            const body = JSON.stringify({
                origin: formData.origin,
                destination: formData.destination,
                start_date: formData.startDate,
                days: parseInt(formData.days),
                budget: parseInt(formData.budget),
                pace: formData.pace,
                people: formData.people,
                preferences: formData.preferences,
                transport: formData.transport
            })
            
            // 优先尝试后端流式
            try {
                const resp = await fetch(`${BACKEND_URL}/api/generate-plan?stream=true`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: body,
                    signal: AbortSignal.timeout(180000)
                })
                
                if (!resp.ok) throw new Error('后端不可用')
                
                // 流式读取 SSE
                const reader = resp.body.getReader()
                const decoder = new TextDecoder()
                let buffer = ''
                let firstChunk = true
                
                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break
                    
                    buffer += decoder.decode(value, { stream: true })
                    const lines = buffer.split('\n')
                    buffer = lines.pop() || ''
                    
                    for (const line of lines) {
                        if (!line.startsWith('data: ')) continue
                        const dataStr = line.slice(6)
                        if (dataStr === '[DONE]') continue
                        try {
                            const chunk = JSON.parse(dataStr)
                            if (chunk.error) throw new Error(chunk.error)
                            if (chunk.content) {
                                plan += chunk.content
                                if (firstChunk) {
                                    firstChunk = false
                                    loading.style.display = 'none'
                                    resultContent.style.display = 'block'
                                    resultBody.innerHTML = ''
                                }
                                // 逐字追加渲染
                                resultBody.innerHTML = marked.parse(plan)
                                resultSection.scrollIntoView({ behavior: 'smooth', block: 'end' })
                            }
                        } catch {}
                    }
                }
                
                if (!plan) throw new Error('空回复')
                
            } catch (streamErr) {
                // 流式失败，降级到非流式
                try {
                    const resp = await fetch(`${BACKEND_URL}/api/generate-plan`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: body,
                        signal: AbortSignal.timeout(120000)
                    })
                    if (resp.ok) {
                        const data = await resp.json()
                        plan = data.plan
                    } else {
                        throw streamErr
                    }
                } catch {
                    // 都失败，降级到前端直连
                    const prompt = buildPrompt(formData)
                    plan = await callAI(prompt)
                }
            }
            
            // 非流式模式下渲染
            if (loading.style.display !== 'none') {
                loading.style.display = 'none'
                resultContent.style.display = 'block'
                resultBody.innerHTML = typeof marked !== 'undefined' ? marked.parse(plan) : '<pre>' + plan + '</pre>'
            }
            
            // 生图
            fetch(`${BACKEND_URL}/api/generate-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ destination: formData.destination, style: '风景照' })
            }).then(r => r.json()).then(d => {
                if (d.image_url) showImage(d.image_url, formData.destination)
            }).catch(() => {})

            saveToHistory(formData, plan)
            loadHistory()
            loadCountdowns()

            // 高德搜索真实坐标 + 展示地图
            searchGaodeSpots(plan, formData.destination)
            // 查询天气
            fetchWeather(formData.destination)
            // 预算饼图
            showBudgetChart(plan)
            
        } catch (error) {
            loading.style.display = 'none'
            resultContent.style.display = 'block'
            resultBody.innerHTML = `
                <div style="text-align: center; padding: 40px 20px;">
                    <p style="font-size: 24px; margin-bottom: 16px;">😢</p>
                    <p style="color: #ff6b6b; margin-bottom: 12px;">生成失败</p>
                    <p style="color: #888; font-size: 0.9rem;">${error.message}</p>
                    <p style="color: #666; font-size: 0.85rem; margin-top: 20px;">
                        请检查API Key是否配置正确，<br>
                        或稍后重试。
                    </p>
                </div>
            `
        } finally {
            generateBtn.disabled = false
            generateBtn.textContent = '🚀 生成专属行程方案'
        }
    })
})

// 显示生成的图片
function showImage(url, destination) {
    let imgBox = document.getElementById('generatedImage')
    if (!imgBox) {
        imgBox = document.createElement('div')
        imgBox.id = 'generatedImage'
        imgBox.style.cssText = 'margin-top:20px;text-align:center;'
        const resultContent = document.getElementById('resultContent')
        resultContent.appendChild(imgBox)
    }
    imgBox.innerHTML = `
        <h3 style="margin-bottom:12px;">🖼️ ${destination} AI 生成风景</h3>
        <img src="${url}" alt="${destination}" style="max-width:100%;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.3);">
    `
}

// 复制结果
function copyResult() {
    const resultText = document.getElementById('resultBody').innerText
    navigator.clipboard.writeText(resultText).then(() => {
        const btn = document.querySelector('.btn-copy')
        const originalText = btn.textContent
        btn.textContent = '✅ 已复制'
        btn.style.borderColor = 'var(--success)'
        btn.style.color = 'var(--success)'
        setTimeout(() => {
            btn.textContent = originalText
            btn.style.borderColor = ''
            btn.style.color = ''
        }, 2000)
    })
}

// 保存到历史记录
function saveToHistory(formData, result) {
    const history = JSON.parse(localStorage.getItem('travelHistory') || '[]')
    const item = {
        id: Date.now(),
        destination: formData.destination,
        days: formData.days,
        budget: formData.budget,
        pace: formData.pace,
        result: result,
        createdAt: new Date().toISOString()
    }
    history.unshift(item)
    // 只保留最近10条
    if (history.length > 10) history.pop()
    localStorage.setItem('travelHistory', JSON.stringify(history))
}

// 导出函数供全局使用
window.copyResult = copyResult
window.shareTrip = shareTrip
window.switchPanel = switchPanel
window.loadTripDetail = loadTripDetail
window.deleteTrip = deleteTrip
window.exportPDF = exportPDF
window.toggleEdit = toggleEdit

// 分享行程 — 打开干净的新页面
function shareTrip() {
    const resultBody = document.getElementById('resultBody')
    const destination = document.getElementById('destination').value
    const startDate = document.getElementById('startDate').value
    const content = resultBody.innerHTML
    const imgBox = document.getElementById('generatedImage')
    const imgHTML = imgBox ? imgBox.innerHTML : ''

    const sharePage = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${destination} · AI旅行定制</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'PingFang SC','Microsoft YaHei',sans-serif; background: #0a0a0f; color: #f5f5f7; line-height: 1.8; }
.container { max-width: 800px; margin: 0 auto; padding: 40px 20px; }
.hero { text-align: center; padding: 60px 0 40px; border-bottom: 1px solid #2a2a35; margin-bottom: 40px; }
.hero h1 { font-size: 36px; font-weight: 300; margin-bottom: 8px; }
.hero h1 span { color: #ff6b35; }
.hero p { color: #6e6e73; font-size: 14px; }
.content { background: #1a1a24; border-radius: 12px; padding: 40px; }
.content h2 { color: #ff6b35; font-size: 20px; margin: 24px 0 12px; }
.content h3 { font-size: 18px; margin: 16px 0 8px; }
.content table { width: 100%; border-collapse: collapse; margin: 12px 0; }
.content td, .content th { padding: 8px 12px; border: 1px solid #2a2a35; text-align: left; font-size: 14px; }
.content img { max-width: 100%; border-radius: 8px; margin-top: 20px; }
.footer { text-align: center; padding: 40px 0; color: #3a3a45; font-size: 13px; }
.footer span { color: #ff6b35; }
@media print { body { background: #fff; color: #000; } .content { background: #fff; border: 1px solid #ddd; } }
</style>
</head>
<body>
<div class="container">
<div class="hero">
    <h1>✈️ <span>${destination}</span> 旅行方案</h1>
    <p>出发日期：${startDate} ｜ 专属定制 · 为你俩的旅行</p>
</div>
<div class="content">
    ${content}
    ${imgHTML}
</div>
<div class="footer">
    <p>❤️ 由 <span>AI Travel</span> 私人定制生成</p>
</div>
</div>
</body>
</html>`

    const win = window.open('', '_blank')
    win.document.write(sharePage)
    win.document.close()
}

async function deleteTrip(id) {
    if (!confirm('确定删除这条行程记录吗？对应的倒数日也会一起删除。')) return
    try {
        await fetch(`${BACKEND_URL}/api/history/${id}`, { method: 'DELETE' })
        loadHistory()
        loadCountdowns()
    } catch {}
}

// API Key 输入弹窗
function showApiKeyPrompt() {
    const currentKey = AI_CONFIG.apiKey
    const key = prompt(
        (currentKey ? '🔑 当前已有 Key，输入新 Key 替换，或点取消保留：\n\n' : '🔑 请输入智谱 AI API Key\n\n') +
        '获取免费 Key：https://open.bigmodel.cn\n' +
        '注册后进入「API Keys」页面创建即可\n\n' +
        '（Key 仅保存在你的浏览器中，不会上传）',
        currentKey ? '(已设置，内容已隐藏)' : ''
    )
    if (key && key.trim() && key !== '(已设置，内容已隐藏)') {
        AI_CONFIG.apiKey = key.trim()
        updateKeyStatus()
        alert('✅ Key 已保存！')
    }
}

function updateKeyStatus() {
    const label = document.getElementById('apiKeyLabel')
    if (label) {
        label.textContent = AI_CONFIG.apiKey ? '✅ 已使用自定义 API Key（点击更换）' : 'AI 由服务器提供（无需配置）'
    }
}

// 页面加载时更新 Key 状态
document.addEventListener('DOMContentLoaded', updateKeyStatus)

// ============================================================
// 偏好回填 & 历史面板
// ============================================================
async function loadPrefsAndHistory() {
    try {
        const resp = await fetch(`${BACKEND_URL}/api/prefs`)
        if (!resp.ok) return
        const prefs = await resp.json()

        // 回填表单
        if (prefs.pace) {
            const radio = document.querySelector(`input[name="pace"][value="${prefs.pace}"]`)
            if (radio) radio.checked = true
        }
        if (prefs.budget) document.getElementById('budget').value = prefs.budget
        if (prefs.transport) document.getElementById('transport').value = prefs.transport
    } catch {}

    // 显示面板
    document.getElementById('historyPanel').style.display = 'block'
    await loadHistory()
}

async function loadHistory() {
    try {
        const resp = await fetch(`${BACKEND_URL}/api/history`)
        const trips = await resp.json()
        const panel = document.getElementById('panelContent')

        if (trips.length === 0) {
            panel.innerHTML = '<div class="empty-state"><p>📭 还没有行程记录</p><p style="font-size:13px">生成第一个行程后会自动出现在这里</p></div>'
            return
        }

        panel.innerHTML = '<div class="history-list">' + trips.map(t => `
            <div class="history-item">
                <div class="trip-info" onclick="loadTripDetail(${t.id})" style="flex:1;cursor:pointer;">
                    <span class="trip-dest">${t.destination}</span>
                    <span class="trip-meta">${t.days}天 · ${t.pace} · ¥${t.budget}</span>
                </div>
                <span class="trip-date">${t.created_at?.slice(0, 10) || ''}</span>
                <button class="btn-small" onclick="event.stopPropagation();deleteTrip(${t.id})" style="margin-left:12px;">🗑️</button>
            </div>
        `).join('') + '</div>'
    } catch {}
}

async function loadCountdowns() {
    try {
        const resp = await fetch(`${BACKEND_URL}/api/countdowns`)
        const items = await resp.json()
        const panel = document.getElementById('panelContent')

        if (items.length === 0) {
            panel.innerHTML = '<div class="empty-state"><p>⏰ 还没有倒数日</p><p style="font-size:13px">生成行程时会自动添加出发日期</p></div>'
            return
        }

        panel.innerHTML = '<div class="countdown-list">' + items.map(c => `
            <div class="countdown-item">
                <div class="cd-info">
                    <h4>${c.destination}${c.notes ? ' · ' + c.notes : ''}</h4>
                    <p>出发日期：${c.departure_date}</p>
                </div>
                <div class="cd-days${c.days_left === 0 ? ' today' : ''}">
                    ${c.days_left < 0 ? '✅' : c.days_left === 0 ? '🎉' : c.days_left}
                    <small>${c.status}</small>
                </div>
            </div>
        `).join('') + '</div>'
    } catch {}
}

function switchPanel(tab) {
    document.querySelectorAll('.panel-tab').forEach(b => b.classList.remove('active'))
    event.target.classList.add('active')
    if (tab === 'history') loadHistory()
    else loadCountdowns()
}

async function loadTripDetail(id) {
    try {
        const resp = await fetch(`${BACKEND_URL}/api/history/${id}`)
        const trip = await resp.json()
        const resultBody = document.getElementById('resultBody')
        const resultContent = document.getElementById('resultContent')
        const resultSection = document.getElementById('result')

        if (typeof marked !== 'undefined') {
            resultBody.innerHTML = marked.parse(trip.plan)
        } else {
            resultBody.innerHTML = '<pre>' + trip.plan + '</pre>'
        }

        resultSection.style.display = 'block'
        resultContent.style.display = 'block'
        resultSection.scrollIntoView({ behavior: 'smooth' })
    } catch {}
}

// 页面初始化：加载偏好和面板
loadPrefsAndHistory()

// ============================================================
// 🗺️ 地图展示（高德 POI 搜索）
// ============================================================
let tripMap = null

async function searchGaodeSpots(planText, city) {
    const mapBox = document.getElementById('mapBox')
    try {
        console.log('[地图] 开始高德搜索, city:', city, 'text长度:', planText?.length)
        const resp = await fetch(`${BACKEND_URL}/api/gaode-search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan_text: planText, city: city }),
            signal: AbortSignal.timeout(30000)
        })
        if (!resp.ok) throw new Error('HTTP ' + resp.status)
        const data = await resp.json()
        console.log('[地图] 搜索结果:', JSON.stringify(data).slice(0, 300))
        if (!data.spots || data.spots.length === 0) {
            console.log('[地图] 无结果，隐藏')
            mapBox.style.display = 'none'
            return
        }
        showMapWithRoutes(data.spots)
    } catch (e) {
        console.error('[地图] 错误:', e.message || e)
        mapBox.style.display = 'none'
    }
}

function showMapWithRoutes(daysData) {
    const mapBox = document.getElementById('mapBox')
    mapBox.style.display = 'block'
    if (tripMap) { tripMap.remove(); tripMap = null }

    // 颜色板：每天不同颜色
    const colors = ['#ff6b35', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dfe6e9', '#fd79a8']
    const allPoints = []
    daysData.forEach(d => d.spots.forEach(s => allPoints.push([s.lat, s.lng])))

    tripMap = L.map('tripMap').setView(allPoints[0], 13)
    L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
        subdomains: ['1','2','3','4'], attribution: '&copy; 高德地图', maxZoom: 18
    }).addTo(tripMap)

    const bounds = []
    daysData.forEach((dayData, di) => {
        const color = colors[di % colors.length]
        const spots = dayData.spots

        // 标记
        spots.forEach((spot, si) => {
            const icon = L.divIcon({
                html: `<div style="background:${color};color:#fff;width:22px;height:22px;border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:bold;box-shadow:0 2px 6px rgba(0,0,0,0.4)">${si + 1}</div>`,
                iconSize: [22, 22], iconAnchor: [11, 11]
            })
            L.marker([spot.lat, spot.lng], { icon })
                .addTo(tripMap)
                .bindPopup(`<b>${spot.name}</b><br><small>第${dayData.day}天 · ${spot.address || ''}</small>`)
            bounds.push([spot.lat, spot.lng])
        })

        // 路线连线
        if (spots.length > 1) {
            const latlngs = spots.map(s => [s.lat, s.lng])
            L.polyline(latlngs, {
                color: color, weight: 3, opacity: 0.7,
                dashArray: di === 0 ? null : '8, 6'
            }).addTo(tripMap)
        }
    })

    if (bounds.length > 1) tripMap.fitBounds(bounds, { padding: [40, 40] })
    setTimeout(() => tripMap.invalidateSize(), 200)
}

// ============================================================
// 🌤️ 天气查询
// ============================================================
async function fetchWeather(city) {
    const box = document.getElementById('weatherBox')
    try {
        const resp = await fetch(`${BACKEND_URL}/api/weather?city=${encodeURIComponent(city)}`)
        if (!resp.ok) throw new Error('天气不可用')
        const data = await resp.json()
        showWeather(data)
    } catch {
        box.style.display = 'none'
    }
}

function showWeather(data) {
    const box = document.getElementById('weatherBox')
    box.style.display = 'block'
    box.innerHTML = `
        <h3>🌤️ ${data.city} 天气</h3>
        <div class="weather-current">
            <span class="weather-temp">${data.current_temp || '--'}°C</span>
            <span class="weather-desc">${data.current_desc || ''}  ·  湿度 ${data.humidity || '--'}%</span>
        </div>
        <div class="weather-forecast">
            ${(data.forecast || []).map(d => `
                <div class="forecast-day">
                    <div class="date">${d.date || ''}</div>
                    <div class="temp">${d.max_temp || '--'}° / ${d.min_temp || '--'}°</div>
                    <div class="desc">${d.desc || ''}</div>
                </div>
            `).join('')}
        </div>
    `
}

// ============================================================
// 📄 导出 PDF
// ============================================================
function exportPDF() {
    window.print()
}

// ============================================================
// 📊 预算可视化饼图
// ============================================================
function showBudgetChart(planText) {
    // 从预算表格提取数据
    const tableMatch = planText.match(/##\s*💰\s*预算分配[\s\S]*?(\|.*\|[\s\S]*?)(?=##|\Z)/)
    if (!tableMatch) return

    const lines = tableMatch[1].split('\n').filter(l => l.includes('|'))
    const items = []
    // 跳过表头行
    for (let i = 2; i < lines.length; i++) {
        const cols = lines[i].split('|').map(c => c.trim()).filter(c => c)
        if (cols.length >= 2) {
            const label = cols[0].replace(/[^\u4e00-\u9fa5]/g, '').slice(0, 6)
            // 跳过"总计""合计"行
            if (/总计|合计/.test(label)) continue
            // 智能解析价格：处理 "600-1200"、"600"、"约600" 等格式
            const numStr = cols[1] || cols[cols.length - 1] || ''
            const nums = numStr.match(/\d+/g)
            let val = 0
            if (nums && nums.length > 0) {
                // 如果有多个数字（如区间价），取最后一个（最高价）
                val = parseInt(nums[nums.length - 1])
            }
            if (val && label) items.push({ label, val })
        }
    }
    if (items.length < 2) return

    const chart = document.getElementById('budgetChart')
    const canvas = document.getElementById('budgetCanvas')
    const legend = document.getElementById('budgetLegend')
    chart.style.display = 'block'

    const ctx = canvas.getContext('2d')
    const total = items.reduce((s, i) => s + i.val, 0)
    const colors = ['#ff6b35', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#fd79a8', '#a29bfe']
    const cx = 150, cy = 150, r = 120
    ctx.clearRect(0, 0, 300, 300)

    let angle = -Math.PI / 2
    items.forEach((item, i) => {
        const slice = (item.val / total) * Math.PI * 2
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.arc(cx, cy, r, angle, angle + slice)
        ctx.closePath()
        ctx.fillStyle = colors[i % colors.length]
        ctx.fill()
        // 标签
        const mid = angle + slice / 2
        const lx = cx + Math.cos(mid) * (r * 0.65)
        const ly = cy + Math.sin(mid) * (r * 0.65)
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 11px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(Math.round(item.val / total * 100) + '%', lx, ly + 4)
        angle += slice
    })

    legend.innerHTML = items.map((item, i) =>
        `<div class="legend-item"><span class="legend-dot" style="background:${colors[i % colors.length]}"></span>${item.label} ¥${item.val}</div>`
    ).join('')
}

// ============================================================
// ✏️ 编辑行程
// ============================================================
let editMode = false
let originalPlan = ''

function toggleEdit() {
    const body = document.getElementById('resultBody')
    const btn = document.getElementById('btnEdit')

    if (!editMode) {
        // 进入编辑模式
        originalPlan = body.innerText
        const ta = document.createElement('textarea')
        ta.className = 'edit-area'
        ta.id = 'editArea'
        ta.value = originalPlan
        body.innerHTML = ''
        body.appendChild(ta)

        const saveBtn = document.createElement('button')
        saveBtn.className = 'btn-save-edit'
        saveBtn.textContent = '💾 保存修改'
        saveBtn.onclick = saveEdit
        body.appendChild(saveBtn)

        btn.textContent = '👁️ 预览'
        editMode = true
    } else {
        // 退出编辑模式
        saveEdit()
    }
}

function saveEdit() {
    const ta = document.getElementById('editArea')
    if (!ta) return
    const newPlan = ta.value
    const body = document.getElementById('resultBody')
    if (typeof marked !== 'undefined') {
        body.innerHTML = marked.parse(newPlan)
    } else {
        body.innerHTML = '<pre>' + newPlan + '</pre>'
    }
    document.getElementById('btnEdit').textContent = '✏️ 编辑'
    editMode = false
    // 更新预算图
    showBudgetChart(newPlan)
}