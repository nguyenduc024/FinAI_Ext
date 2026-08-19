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

export default {
  async fetch(request, env) {
    // Handle CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'FinAI Proxy API' }), {
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

        // Lấy API Key từ Environment Variable bí mật
        const apiKey = env.GEMINI_API_KEY;
        if (!apiKey) {
          return new Response(
            JSON.stringify({ success: false, error: 'Server chưa thiết lập GEMINI_API_KEY trong Cloudflare Secrets' }),
            { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
          );
        }

        const fullPrompt = `${SYSTEM_PROMPT}\n\n---\nSelected Term: "${term}"\nContext: "${context || ''}"\n\nRespond with valid JSON:`;

        // Thử gemini-1.5-flash trước, nếu lỗi fallback sang gemini-2.0-flash
        const models = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash'];
        let rawText = null;
        let lastError = null;

        for (const model of models) {
          try {
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

            const geminiResponse = await fetch(geminiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: fullPrompt }] }],
                generationConfig: {
                  responseMimeType: 'application/json',
                  temperature: 0.2,
                },
              }),
            });

            if (!geminiResponse.ok) {
              const errBody = await geminiResponse.json().catch(() => ({}));
              lastError = errBody.error?.message || `HTTP ${geminiResponse.status}`;
              console.warn(`Model ${model} failed:`, lastError);
              continue;
            }

            const geminiData = await geminiResponse.json();
            rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
            if (rawText) break;
          } catch (e) {
            lastError = e.message;
          }
        }

        if (!rawText) {
          return new Response(
            JSON.stringify({ success: false, error: `Gemini API: ${lastError || 'Không thể lấy kết quả'}` }),
            { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
          );
        }

        const explanation = JSON.parse(rawText);

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
