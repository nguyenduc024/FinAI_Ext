// Cloudflare Worker — FinAI Backend Proxy
// Deploy miễn phí trên Cloudflare Workers (100.000 reqs/ngày)

const SYSTEM_PROMPT = `You are an expert in stock market terminology, serving as a helpful assistant for users reading financial news or documents.
Your task is to explain stock market terms that the user selects.

Guidelines:
1. Explain the term in BOTH Vietnamese and English.
2. Target audience: beginners who are new to the stock market.
3. Use simple, everyday language (avoid overly academic definitions).
4. Provide a concrete example with real numbers when possible.
5. Analyze the term IN THE CONTEXT of the sentence the user selected it from (provided in user prompt).
6. List 2-3 related terms.
7. Rate difficulty as: 'beginner', 'intermediate', or 'advanced'.
8. Cover both Vietnamese market terms (e.g., T+2, biên độ, room ngoại, sàn HOSE) and international terms (e.g., P/E, RSI, MACD, margin call).
9. Keep definition under 150 words.
10. Keep contextExplanation under 100 words.

You MUST output your response as valid JSON matching the following schema:
{
  "term": string,
  "termEnglish": string | null,
  "definition": string,
  "definitionEnglish": string | null,
  "example": string | null,
  "contextExplanation": string,
  "relatedTerms": string[],
  "difficulty": "beginner" | "intermediate" | "advanced"
}`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// In-memory Server-side Cache (Giúp tiết kiệm 90% quota API)
const SERVER_CACHE = new Map();

export default {
  async fetch(request, env) {
    // Handle CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'FinAI Proxy API', cachedTerms: SERVER_CACHE.size }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Main explanation endpoint: POST /api/explain
    if (url.pathname === '/api/explain' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { term, context } = body;

        if (!term || typeof term !== 'string') {
          return new Response(
            JSON.stringify({ success: false, error: 'Thiếu từ khóa cần giải thích' }),
            { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
          );
        }

        const cacheKey = term.trim().toLowerCase();
        // Kiểm tra Server Cache trước để không tốn Quota Gemini
        if (SERVER_CACHE.has(cacheKey)) {
          const cachedResult = SERVER_CACHE.get(cacheKey);
          return new Response(
            JSON.stringify({ success: true, data: cachedResult, fromServerCache: true }),
            { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
          );
        }

        // Lấy API Key từ Cloudflare Secrets (Hỗ trợ cả GROQ_API_KEY và GEMINI_API_KEY)
        const apiKey = env.GROQ_API_KEY || env.GEMINI_API_KEY;
        if (!apiKey) {
          return new Response(
            JSON.stringify({ success: false, error: 'Server chưa thiết lập GROQ_API_KEY trong Cloudflare Secrets' }),
            { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
          );
        }

        const isGroq = apiKey.startsWith('gsk_') || Boolean(env.GROQ_API_KEY);
        let rawText = null;

        // ==========================================
        // 🚀 CÁCH 1: GROQ CLOUD (qwen/qwen3.6-27b — Siêu tốc, Miễn phí)
        // ==========================================
        if (isGroq) {
          const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey.trim()}`,
            },
            body: JSON.stringify({
              model: 'qwen/qwen3.6-27b',
              messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: `Explain the stock market term "${term}" in the context "${context || ''}". Provide the response strictly in JSON format as specified.` },
              ],
              temperature: 0.2,
            }),
          });

          if (!groqResponse.ok) {
            const errBody = await groqResponse.json().catch(() => ({}));
            throw new Error(`Groq API (${groqResponse.status}): ${errBody.error?.message || groqResponse.statusText}`);
          }

          const groqData = await groqResponse.json();
          rawText = groqData.choices?.[0]?.message?.content;
        } 
        // ==========================================
        // 💎 CÁCH 2: GOOGLE GEMINI (gemini-3.6-flash)
        // ==========================================
        else {
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey.trim()}`;
          const geminiResponse = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\n---\nSelected Term: "${term}"\nContext: "${context || ''}"\n\nRespond with valid JSON:` }] }],
              generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.2,
              },
            }),
          });

          if (!geminiResponse.ok) {
            const errBody = await geminiResponse.json().catch(() => ({}));
            throw new Error(`Gemini API: ${errBody.error?.message || geminiResponse.statusText}`);
          }

          const geminiData = await geminiResponse.json();
          rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
        }

        if (!rawText) {
          return new Response(
            JSON.stringify({ success: false, error: 'AI không trả về nội dung' }),
            { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
          );
        }

        // Trích xuất JSON chính xác bằng thuật toán cân bằng dấu ngoặc (Bracket Balancer)
        function extractJsonObject(str) {
          const firstBrace = str.indexOf('{');
          if (firstBrace === -1) throw new Error('Không tìm thấy dữ liệu JSON từ AI');
          
          let depth = 0;
          let inString = false;
          let escape = false;

          for (let i = firstBrace; i < str.length; i++) {
            const char = str[i];

            if (escape) {
              escape = false;
              continue;
            }

            if (char === '\\') {
              escape = true;
              continue;
            }

            if (char === '"') {
              inString = !inString;
              continue;
            }

            if (!inString) {
              if (char === '{') depth++;
              else if (char === '}') {
                depth--;
                if (depth === 0) {
                  return str.substring(firstBrace, i + 1);
                }
              }
            }
          }
          return str.substring(firstBrace);
        }

        const cleanJson = extractJsonObject(rawText);
        const explanation = JSON.parse(cleanJson);

        // Lưu vào Server Cache để lần sau không tốn Quota AI
        SERVER_CACHE.set(cacheKey, explanation);

        return new Response(
          JSON.stringify({ success: true, data: explanation }),
          { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      } catch (err) {
        console.error('Worker Error:', err);
        return new Response(
          JSON.stringify({ success: false, error: err.message || 'Lỗi xử lý yêu cầu' }),
          { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response(JSON.stringify({ error: 'Endpoint không tồn tại' }), {
      status: 404,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  },
};
