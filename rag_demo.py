"""
简易 RAG 系统 — 纯 Python 标准库实现
把你的旅行知识库变成 AI 能查的资料库
"""
import json
import os
import re
import math
import urllib.request
import urllib.error

# ============================================================
# 配置
# ============================================================
ZHIPU_API_KEY = os.environ.get("ZHIPU_API_KEY", "")
EMBEDDING_MODEL = "embedding-2"
CHAT_MODEL = "glm-4"

# 项目根目录（基于本文件位置推导，兼容所有系统）
import sys
from pathlib import Path
PROJECT_ROOT = Path(__file__).resolve().parent if "__file__" in dir() else Path.cwd()
sys.path.insert(0, str(PROJECT_ROOT))
KB_DIR = str(PROJECT_ROOT / "知识库")
VECTOR_DB_FILE = str(PROJECT_ROOT / "知识库" / "vector_db.json")

# ============================================================
# ① 文档切片
# ============================================================
def load_and_chunk(kb_dir, chunk_size=400):
    """读取所有 .md 文件，切成小段"""
    chunks = []
    for root, dirs, files in os.walk(kb_dir):
        for fname in files:
            if not fname.endswith(".md"):
                continue
            path = os.path.join(root, fname)
            with open(path, "r", encoding="utf-8") as f:
                text = f.read()
            
            # 按段落切，每段不超过 chunk_size 字
            paragraphs = text.split("\n\n")
            current = ""
            for p in paragraphs:
                p = p.strip()
                if not p:
                    continue
                if len(current) + len(p) < chunk_size:
                    current += p + "\n"
                else:
                    if current.strip():
                        chunks.append({
                            "text": current.strip(),
                            "source": fname,
                            "path": path
                        })
                    current = p + "\n"
            if current.strip():
                chunks.append({
                    "text": current.strip(),
                    "source": fname,
                    "path": path
                })
    return chunks

# ============================================================
# ② 调用智谱 Embedding API
# ============================================================
def call_zhipu_api(endpoint, body, api_key=ZHIPU_API_KEY):
    """调用智谱 API（embedding / chat 通用）"""
    url = f"https://open.bigmodel.cn/api/paas/v4/{endpoint}"
    data = json.dumps(body).encode("utf-8")
    
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Authorization", f"Bearer {api_key}")
    req.add_header("Content-Type", "application/json")
    
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        raise Exception(f"API 错误 {e.code}: {body}")

def get_embedding(text):
    """把一段文字转成向量（一串数字），最多 2048 字"""
    text = text[:2048]  # 智谱 embedding 有长度限制
    resp = call_zhipu_api("embeddings", {
        "model": EMBEDDING_MODEL,
        "input": text
    })
    return resp["data"][0]["embedding"]

# ============================================================
# ③ 向量存储（JSON 文件）
# ============================================================
def build_vector_db(chunks, db_file=VECTOR_DB_FILE):
    """把文档切片全部转成向量，存到 JSON 文件"""
    print(f"📚 共 {len(chunks)} 个文档切片，正在向量化...")
    vector_db = []
    for i, chunk in enumerate(chunks):
        print(f"  [{i+1}/{len(chunks)}] {chunk['source']}: {chunk['text'][:40]}...")
        vec = get_embedding(chunk["text"])
        vector_db.append({
            "text": chunk["text"],
            "source": chunk["source"],
            "vector": vec
        })
    
    with open(db_file, "w", encoding="utf-8") as f:
        json.dump(vector_db, f, ensure_ascii=False)
    print(f"✅ 向量库已保存到 {db_file}")
    return vector_db

def load_vector_db(db_file=VECTOR_DB_FILE):
    """加载已有的向量库"""
    if not os.path.exists(db_file):
        return None
    with open(db_file, "r", encoding="utf-8") as f:
        return json.load(f)

# ============================================================
# ④ 相似度搜索（余弦相似度）
# ============================================================
def cosine_similarity(a, b):
    """计算两个向量的余弦相似度（0~1，越接近 1 越相关）"""
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0
    return dot / (norm_a * norm_b)

def search(query, vector_db, top_k=3):
    """在向量库中搜索与 query 最相似的文档"""
    query_vec = get_embedding(query)
    scored = []
    for item in vector_db:
        score = cosine_similarity(query_vec, item["vector"])
        scored.append((score, item))
    
    scored.sort(key=lambda x: x[0], reverse=True)
    return scored[:top_k]

# ============================================================
# ⑤ 生成回答
# ============================================================
def generate_answer(query, contexts):
    """把搜到的资料 + 问题发给 GLM-4，生成回答"""
    context_text = "\n\n".join([
        f"【资料{i+1}，来源：{c['source']}】\n{c['text']}"
        for i, c in enumerate(contexts)
    ])
    
    prompt = f"""你是一个专业的旅行顾问。请根据以下资料回答用户的问题。
如果资料中没有相关信息，请诚实说明"资料中未找到相关内容"。

【参考资料】
{context_text}

【用户问题】
{query}

请用中文回答，条理清晰。"""

    resp = call_zhipu_api("chat/completions", {
        "model": CHAT_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.7
    })
    return resp["choices"][0]["message"]["content"]

# ============================================================
# ⑥ 主流程
# ============================================================
def ask(query):
    """问一个问题，RAG 系统自动查资料回答"""
    db = load_vector_db()
    if db is None:
        print("❌ 向量库不存在，请先运行 build_vector_db()")
        return
    
    print(f"🔍 搜索中: {query}")
    results = search(query, db, top_k=3)
    
    print(f"\n📖 找到 {len(results)} 条相关资料:")
    for score, item in results:
        print(f"   [{score:.2f}] {item['source']}: {item['text'][:60]}...")
    
    contexts = [item for _, item in results]
    print("\n🤖 AI 回答:\n")
    answer = generate_answer(query, contexts)
    print(answer)
    return answer


# ============================================================
# 运行入口
# ============================================================
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "build":
        # 构建向量库
        chunks = load_and_chunk(KB_DIR)
        build_vector_db(chunks)
    elif len(sys.argv) > 1:
        # 回答问题
        query = " ".join(sys.argv[1:])
        ask(query)
    else:
        # 交互模式
        print("🚀 简易 RAG 系统 - 旅行知识库问答")
        print("输入 'build' 构建向量库，或直接输入问题")
        print("输入 'quit' 退出\n")
        while True:
            q = input("❓ 你的问题: ").strip()
            if q.lower() == "quit":
                break
            if q.lower() == "build":
                chunks = load_and_chunk(KB_DIR)
                build_vector_db(chunks)
                continue
            if q:
                ask(q)
                print("\n" + "="*50 + "\n")
