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

You MUST output your response as valid JSON with real data (do not output type names like string/null) matching this format:
{
  "term": "Tên thuật ngữ",
  "termEnglish": "English term (hoặc null)",
  "definition": "Định nghĩa chi tiết dễ hiểu bằng tiếng Việt",
  "definitionEnglish": "Detailed definition in English (hoặc null)",
  "example": "Ví dụ thực tế dễ hiểu có số liệu cụ thể",
  "contextExplanation": "Ý nghĩa thuật ngữ trong câu văn ngữ cảnh này",
  "relatedTerms": ["Thuật ngữ liên quan 1", "Thuật ngữ liên quan 2"],
  "difficulty": "beginner"
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
                { role: 'user', content: `Hãy giải thích thuật ngữ: "${term}". Ngữ cảnh câu văn: "${context || ''}". Trả về JSON chứa nội dung giải thích chi tiết, chính xác.` },
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

        // Trích xuất và làm sạch JSON chống lỗi cú pháp từ AI
        function cleanAndParseJSON(str) {
          const firstBrace = str.indexOf('{');
          const lastBrace = str.lastIndexOf('}');
          if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
            throw new Error('Không tìm thấy cấu trúc JSON từ AI');
          }

          let jsonStr = str.substring(firstBrace, lastBrace + 1);

          // Loại bỏ comment nếu có
          jsonStr = jsonStr.replace(/\/\/.*$/gm, '');
          jsonStr = jsonStr.replace(/\/\*[\s\S]*?\*\//g, '');

          // Loại bỏ dấu ba chấm lửng lỗi (...) hoặc […] do AI sinh ra
          jsonStr = jsonStr.replace(/,\s*(\.\.\.|\u2026)\s*([}\]])/g, '$2');
          jsonStr = jsonStr.replace(/\[\s*(\.\.\.|\u2026)\s*\]/g, '[]');
          jsonStr = jsonStr.replace(/"(\.\.\.|\u2026)"/g, '""');

          // Loại bỏ dấu phẩy thừa (trailing commas)
          jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');

          try {
            return JSON.parse(jsonStr);
          } catch (firstErr) {
            // Sửa lỗi xuống dòng chưa escape trong chuỗi JSON
            try {
              const fixedNewlines = jsonStr.replace(/(?<="[^"]*)\n(?=[^"]*")/g, '\\n');
              return JSON.parse(fixedNewlines);
            } catch (secondErr) {
              console.error('JSON Parse Raw:', jsonStr);
              throw new Error('AI trả về cấu trúc JSON chưa hợp lệ, vui lòng thử lại');
            }
          }
        }

        const explanation = cleanAndParseJSON(rawText);

        // Chuẩn hóa dữ liệu trả về theo đúng interface
        const normalizedData = {
          term: explanation.term || term,
          termEnglish: explanation.termEnglish || null,
          definition: explanation.definition || 'Chưa có định nghĩa',
          definitionEnglish: explanation.definitionEnglish || null,
          example: explanation.example || null,
          contextExplanation: explanation.contextExplanation || 'Thuật ngữ được sử dụng trong ngữ cảnh tài chính trên.',
          relatedTerms: Array.isArray(explanation.relatedTerms) ? explanation.relatedTerms.filter(t => typeof t === 'string' && t.trim().length > 0) : [],
          difficulty: ['beginner', 'intermediate', 'advanced'].includes(explanation.difficulty) ? explanation.difficulty : 'beginner',
        };

        // Lưu vào Server Cache để lần sau không tốn Quota AI
        SERVER_CACHE.set(cacheKey, normalizedData);

        return new Response(
          JSON.stringify({ success: true, data: normalizedData }),
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
