// 主逻辑

// 后端地址（本地运行时用，GitHub Pages 上此地址不可用，会自动降级）
const BACKEND_URL = 'http://localhost:8080'

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('travelForm')
    const resultSection = document.getElementById('result')
    const loading = document.getElementById('loading')
    const resultContent = document.getElementById('resultContent')
    const resultBody = document.getElementById('resultBody')
    const generateBtn = document.getElementById('generateBtn')
    
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

        // 检查 API Key（仅前端直连模式需要）
        if (!AI_CONFIG.apiKey) {
            showApiKeyPrompt()
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
            
            // 优先尝试后端
            try {
                const resp = await fetch(`${BACKEND_URL}/api/generate-plan`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData),
                    signal: AbortSignal.timeout(120000)
                })
                if (resp.ok) {
                    const data = await resp.json()
                    plan = data.plan
                    
                    // 尝试生成目的地图片
                    fetch(`${BACKEND_URL}/api/generate-image`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ destination: formData.destination, style: '风景照' })
                    }).then(r => r.json()).then(d => {
                        if (d.image_url) {
                            showImage(d.image_url, formData.destination)
                        }
                    }).catch(() => {})
                } else {
                    throw new Error('后端不可用')
                }
            } catch {
                // 后端不可用，降级到前端直连
                const prompt = buildPrompt(formData)
                plan = await callAI(prompt)
            }
            
            // 渲染结果
            loading.style.display = 'none'
            resultContent.style.display = 'block'
            
            if (typeof marked !== 'undefined') {
                resultBody.innerHTML = marked.parse(plan)
            } else {
                resultBody.innerHTML = '<pre>' + plan + '</pre>'
            }
            
            saveToHistory(formData, plan)
            
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
        label.textContent = AI_CONFIG.apiKey ? '✅ API Key 已设置（点击修改）' : '未设置API Key（点击设置）'
    }
}

// 页面加载时更新 Key 状态
document.addEventListener('DOMContentLoaded', updateKeyStatus)