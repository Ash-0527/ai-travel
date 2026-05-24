// 主逻辑

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
            people: document.querySelector('input[name="people"]:checked')?.value || '情侣',
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

        // 检查 API Key
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
            // 构建提示词
            const prompt = buildPrompt(formData)
            
            // 调用AI
            const result = await callAI(prompt)
            
            // 渲染结果
            loading.style.display = 'none'
            resultContent.style.display = 'block'
            
            // 使用marked解析Markdown
            if (typeof marked !== 'undefined') {
                resultBody.innerHTML = marked.parse(result)
            } else {
                // 如果marked没加载，直接显示文本
                resultBody.innerHTML = '<pre>' + result + '</pre>'
            }
            
            // 保存到localStorage
            saveToHistory(formData, result)
            
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