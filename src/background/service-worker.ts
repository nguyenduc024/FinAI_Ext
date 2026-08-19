import { GoogleGenAI } from '@google/genai';
import { 
  ExtensionMessage, 
  LookupRequest, 
  LookupResponse, 
  TestApiKeyResponse, 
  GetSettingsResponse,
  ExtensionSettings,
  TermExplanation
} from '../shared/types';
import { DEFAULT_SETTINGS, SYSTEM_PROMPT, GEMINI_MODEL, DEFAULT_WORKER_ENDPOINT } from '../shared/constants';
import { getCachedTerm, cacheTerm } from '../shared/cache';

// Set default settings on install
chrome.runtime.onInstalled.addListener(async () => {
  const settings = await chrome.storage.local.get(['apiKey', 'enabled']);
  if (settings.apiKey === undefined || settings.enabled === undefined) {
    await chrome.storage.local.set(DEFAULT_SETTINGS);
  }
});

// Top-level listener
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (message.type === 'LOOKUP_TERM') {
    handleLookupTerm(message, sendResponse);
    return true; // Keep channel open
  }
  
  if (message.type === 'GET_SETTINGS') {
    handleGetSettings(sendResponse);
    return true; // Keep channel open
  }

  if (message.type === 'TEST_API_KEY') {
    handleTestApiKey(message.apiKey, sendResponse);
    return true; // Keep channel open
  }
  
  // For SETTINGS_UPDATED, we don't need to send a response
});

async function handleGetSettings(sendResponse: (response: GetSettingsResponse) => void) {
  try {
    const data = await chrome.storage.local.get(['apiKey', 'enabled']);
    const settings: ExtensionSettings = {
      apiKey: data.apiKey ?? DEFAULT_SETTINGS.apiKey,
      enabled: data.enabled ?? DEFAULT_SETTINGS.enabled
    };
    sendResponse({ type: 'GET_SETTINGS_RESULT', settings });
  } catch (error) {
    console.error('Failed to get settings:', error);
    sendResponse({ type: 'GET_SETTINGS_RESULT', settings: DEFAULT_SETTINGS });
  }
}

async function handleTestApiKey(apiKey: string, sendResponse: (response: TestApiKeyResponse) => void) {
  try {
    const client = new GoogleGenAI({ apiKey });
    // Simple test call
    const interaction = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: "Hello",
    });
    
    if (interaction.text) {
      sendResponse({ type: 'TEST_API_KEY_RESULT', success: true });
    } else {
      sendResponse({ type: 'TEST_API_KEY_RESULT', success: false, error: 'Phản hồi từ API không hợp lệ' });
    }
  } catch (error: any) {
    console.error('Test API Key failed:', error);
    sendResponse({ 
      type: 'TEST_API_KEY_RESULT', 
      success: false, 
      error: error.message || 'Lỗi kết nối đến Gemini API'
    });
  }
}

async function handleLookupTerm(request: LookupRequest, sendResponse: (response: LookupResponse) => void) {
  try {
    // 1. Get settings
    const data = await chrome.storage.local.get(['apiKey', 'apiEndpoint', 'enabled']);
    const settings: ExtensionSettings = {
      apiKey: data.apiKey ?? DEFAULT_SETTINGS.apiKey,
      apiEndpoint: data.apiEndpoint || DEFAULT_WORKER_ENDPOINT,
      enabled: data.enabled ?? DEFAULT_SETTINGS.enabled
    };

    // 2. Check enabled
    if (!settings.enabled) {
      return sendResponse({ type: 'LOOKUP_RESULT', success: false, error: 'Tiện ích đang bị tắt' });
    }

    // 3. Check cache
    const cachedData = await getCachedTerm(request.selectedText);
    if (cachedData) {
      return sendResponse({ type: 'LOOKUP_RESULT', success: true, data: cachedData, fromCache: true });
    }

    // Gọi qua Cloudflare Worker Backend Proxy (Hỗ trợ Groq Llama 3.3 siêu nhanh & Cache thông minh)
    const endpoint = settings.apiEndpoint || DEFAULT_WORKER_ENDPOINT;

    const serverRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        term: request.selectedText,
        context: request.surroundingContext,
      }),
    });

    if (!serverRes.ok) {
      const errJson = await serverRes.json().catch(() => ({}));
      throw new Error(errJson.error || `Lỗi máy chủ (${serverRes.status})`);
    }

    const resData = await serverRes.json();
    if (!resData.success || !resData.data) {
      throw new Error(resData.error || 'Không nhận được kết quả từ máy chủ');
    }

    const result: TermExplanation = resData.data;

    // 4. Cache the result
    await cacheTerm(request.selectedText, result);

    // 5. Track daily lookups
    const today = new Date().toISOString().split('T')[0];
    const stats = await chrome.storage.local.get(['dailyLookups', 'lookupDate']);
    const newCount = stats.lookupDate === today ? (stats.dailyLookups || 0) + 1 : 1;
    await chrome.storage.local.set({ dailyLookups: newCount, lookupDate: today });

    // 6. Return response
    sendResponse({ type: 'LOOKUP_RESULT', success: true, data: result, fromCache: false });

  } catch (error: any) {
    console.error('Lookup failed:', error);
    let errorMsg = 'Đã xảy ra lỗi khi tìm kiếm thuật ngữ';
    
    if (error.message?.includes('API key not valid')) {
      errorMsg = 'API Key không hợp lệ. Vui lòng kiểm tra lại.';
    } else if (error.message) {
      errorMsg = `Lỗi: ${error.message}`;
    }
    
    sendResponse({ type: 'LOOKUP_RESULT', success: false, error: errorMsg });
  }
}
