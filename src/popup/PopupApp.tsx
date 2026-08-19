import React, { useState, useEffect } from 'react';
import logoSvg from '../assets/logo.svg';

interface TermExplanation {
  term: string;
  termEnglish: string | null;
  definition: string;
  definitionEnglish: string | null;
  example: string | null;
  contextExplanation: string;
  relatedTerms: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

interface CacheEntry {
  data: TermExplanation;
  timestamp: number;
}

export const PopupApp: React.FC = () => {
  const [apiKey, setApiKey] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');

  const [dailyLookups, setDailyLookups] = useState(0);
  const [cacheCount, setCacheCount] = useState(0);
  const [history, setHistory] = useState<TermExplanation[]>([]);
  const [expandedTerm, setExpandedTerm] = useState<string | null>(null);

  useEffect(() => {
    const loadState = async () => {
      try {
        const allData = await chrome.storage.local.get(null);

        setApiKey(allData.apiKey ?? '');
        setEnabled(allData.enabled ?? true);

        const cacheEntries = Object.entries(allData)
          .filter(([key]) => key.startsWith('finterm_cache_'))
          .map(([, value]) => value as CacheEntry)
          .sort((a, b) => b.timestamp - a.timestamp);

        setCacheCount(cacheEntries.length);
        setHistory(cacheEntries.slice(0, 10).map(entry => entry.data));

        const today = new Date().toISOString().split('T')[0];
        if (allData.lookupDate === today && typeof allData.dailyLookups === 'number') {
          setDailyLookups(allData.dailyLookups);
        }
      } catch (err) {
        console.error('Lỗi khi tải dữ liệu từ storage:', err);
      }
    };
    loadState();
  }, []);

  const saveSettings = async (newApiKey: string, newEnabled: boolean) => {
    await chrome.storage.local.set({ apiKey: newApiKey, enabled: newEnabled });
    try {
      chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATED' });
    } catch (e) {
      console.log('Service worker chưa khởi động', e);
    }
  };

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setApiKey(val);
    saveSettings(val, enabled);
    setTestStatus('idle');
  };

  const handleEnabledChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.checked;
    setEnabled(val);
    saveSettings(apiKey, val);
  };

  const handleTestConnection = async () => {
    if (!apiKey) {
      setTestStatus('error');
      setTestMessage('Vui lòng nhập API Key');
      return;
    }
    setTestStatus('testing');
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'TEST_API_KEY',
        apiKey,
      });
      if (response && response.success) {
        setTestStatus('success');
        setTestMessage('Kết nối thành công với Gemini AI ✓');
      } else {
        setTestStatus('error');
        setTestMessage(response?.error || 'Kết nối thất bại. Kiểm tra lại Key.');
      }
    } catch (error: unknown) {
      setTestStatus('error');
      setTestMessage('Không thể gửi yêu cầu. Vui lòng thử lại.');
    }
  };

  const clearHistory = async () => {
    if (confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử tra cứu đã lưu?')) {
      const allData = await chrome.storage.local.get(null);
      const cacheKeys = Object.keys(allData).filter(k => k.startsWith('finterm_cache_'));
      await chrome.storage.local.remove([...cacheKeys, 'dailyLookups', 'lookupDate']);
      setCacheCount(0);
      setHistory([]);
      setDailyLookups(0);
    }
  };

  const difficultyMeta = {
    beginner: {
      label: 'Người mới',
      bg: '#EEF0EA',
      color: '#5C6656',
    },
    intermediate: {
      label: 'Trung bình',
      bg: '#EEF0EA',
      color: '#5C6656',
    },
    advanced: {
      label: 'Chuyên sâu',
      bg: '#EEF0EA',
      color: '#5C6656',
    },
  };

  return (
    <div className="flex flex-col min-h-full bg-[#F8F5EA] text-[#263522]">
      {/* Header with FinAI Logo & Toggle */}
      <header className="flex justify-between items-center px-4 py-3 bg-[#FFFDF7] border-b border-[#DDE3D2] sticky top-0 z-20 shadow-[0_2px_10px_rgba(79,107,66,0.03)]">
        <div className="flex items-center gap-2.5">
          <img 
            src={logoSvg} 
            alt="FinAI Logo" 
            className="w-8 h-8 object-contain" 
          />
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-base font-extrabold text-[#263522] tracking-tight m-0 leading-none">
                FinAI
              </h1>
              <span className="text-[11px] font-semibold text-[#697362]">
                Extension
              </span>
            </div>
            <p className="text-[11px] font-medium text-[#697362] m-0 mt-0.5">
              Giải thích thuật ngữ CK tức thì
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-[#697362]">
            {enabled ? 'Bật' : 'Tắt'}
          </span>
          <label className="toggle-switch">
            <input type="checkbox" checked={enabled} onChange={handleEnabledChange} />
            <span className="toggle-slider"></span>
          </label>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 flex flex-col gap-4">

        {/* Welcome Tagline Card */}
        <section className="fin-card p-3.5 bg-gradient-to-br from-[#FFFDF7] to-[#F4F7EE] relative overflow-hidden">
          <div>
            <p className="text-xs font-bold text-[#4F6B42] uppercase tracking-wider mb-1">
              Trợ lý đầu tư F0
            </p>
            <h2 className="text-sm font-extrabold text-[#263522] leading-snug">
              Tin đúng trọng tâm,<br />đầu tư tự tin.
            </h2>
            <p className="text-[11px] text-[#697362] mt-1 leading-relaxed">
              Bôi đen bất kỳ thuật ngữ chứng khoán nào trên web để xem giải thích tức thì.
            </p>
          </div>
        </section>

        {/* System Server Status Card */}
        <section className="fin-card p-3.5 bg-[#FFFDF7] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#5F9B62] animate-pulse shrink-0"></span>
            <div>
              <h3 className="text-xs font-bold text-[#263522] m-0 leading-tight">
                AI Server: Sẵn sàng hoạt động
              </h3>
              <p className="text-[11px] text-[#697362] m-0 mt-0.5">
                {apiKey ? 'Đang dùng API Key riêng' : 'Dùng Cloudflare AI Proxy (Miễn phí)'}
              </p>
            </div>
          </div>
          <span className="text-[10px] font-extrabold text-[#5F9B62] px-2 py-0.5 rounded-full bg-[#EEF6EE]">
            Online
          </span>
        </section>

        {/* Dashboard Statistics Widget */}
        <section className="grid grid-cols-2 gap-3">
          <div className="fin-card p-3.5 flex flex-col items-center justify-center text-center">
            <span className="text-2xl font-black text-[#4F6B42] leading-none mb-1">
              {dailyLookups}
            </span>
            <span className="text-[11px] font-semibold text-[#697362]">
              Tra cứu hôm nay
            </span>
          </div>

          <div className="fin-card p-3.5 flex flex-col items-center justify-center text-center">
            <span className="text-2xl font-black text-[#7FA65B] leading-none mb-1">
              {cacheCount}
            </span>
            <span className="text-[11px] font-semibold text-[#697362]">
              Thuật ngữ đã lưu
            </span>
          </div>
        </section>

        {/* Advanced Settings (Optional Custom Key) */}
        <section className="fin-card p-3.5">
          <details className="group">
            <summary className="text-xs font-bold text-[#697362] cursor-pointer list-none flex justify-between items-center select-none">
              <span className="group-open:text-[#263522]">Tùy chọn nâng cao (API Key riêng)</span>
              <span className="transition-transform group-open:rotate-180 text-[10px]">▼</span>
            </summary>

            <div className="mt-3 pt-3 border-t border-[#DDE3D2]">
              <div className="flex justify-between items-center mb-2">
                <label className="text-[11px] font-bold text-[#263522]">Gemini API Key cá nhân</label>
                <a 
                  href="https://aistudio.google.com/app/apikey" 
                  target="_blank" 
                  rel="noreferrer" 
                  className="text-[10px] font-bold text-[#4F6B42] hover:underline"
                >
                  Lấy Key ↗
                </a>
              </div>

              <div className="relative mb-2.5">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={apiKey}
                  onChange={handleApiKeyChange}
                  placeholder="Mặc định dùng Server (hoặc dán Key riêng)..."
                  className="w-full px-3 py-2 pr-10 rounded-xl bg-[#F8F5EA] text-[#263522] text-xs font-medium border border-[#DDE3D2] focus:outline-none focus:ring-2 focus:ring-[#A8BB91] transition-all placeholder:text-[#9AA293]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#697362] hover:text-[#263522] bg-transparent cursor-pointer"
                >
                  {showPassword ? 'Ẩn' : 'Hiện'}
                </button>
              </div>

              {apiKey.trim().length > 0 && (
                <button
                  onClick={handleTestConnection}
                  disabled={testStatus === 'testing'}
                  className="btn-secondary w-full text-xs py-1.5"
                >
                  {testStatus === 'testing' ? 'Đang kiểm tra Key...' : 'Kiểm tra API Key riêng'}
                </button>
              )}

              {testStatus !== 'idle' && (
                <div 
                  className="mt-2 text-xs font-bold px-2.5 py-1.5 rounded-xl transition-all"
                  style={{
                    backgroundColor: testStatus === 'success' ? '#EEF6EE' : testStatus === 'error' ? '#FBF0EE' : '#EEF2E5',
                    color: testStatus === 'success' ? '#5F9B62' : testStatus === 'error' ? '#C9786B' : '#4F6B42'
                  }}
                >
                  {testMessage}
                </div>
              )}
            </div>
          </details>
        </section>

        {/* Recent History Section */}
        {history.length > 0 && (
          <section>
            <div className="flex justify-between items-center mb-2.5 px-1">
              <h3 className="text-xs font-extrabold text-[#263522] uppercase tracking-wider">
                Lịch sử gần đây
              </h3>
              <span className="text-[11px] text-[#697362] font-semibold">
                {history.length} thuật ngữ
              </span>
            </div>

            <div className="flex flex-col gap-2.5">
              {history.map((item, idx) => {
                const meta = difficultyMeta[item.difficulty] || difficultyMeta.beginner;
                const isExpanded = expandedTerm === item.term;

                return (
                  <div
                    key={`${item.term}-${idx}`}
                    className="fin-card p-3.5 cursor-pointer"
                    onClick={() => setExpandedTerm(isExpanded ? null : item.term)}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-xs font-bold text-[#263522] m-0">
                            {item.term}
                          </h4>
                          {item.termEnglish && (
                            <span className="text-[11px] text-[#697362] italic font-medium">
                              ({item.termEnglish})
                            </span>
                          )}
                        </div>
                      </div>

                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                        style={{ backgroundColor: meta.bg, color: meta.color }}
                      >
                        {meta.label}
                      </span>
                    </div>

                    <p className={`text-xs text-[#697362] mt-1.5 leading-relaxed ${isExpanded ? '' : 'line-clamp-2'}`}>
                      {item.definition}
                    </p>

                    {isExpanded && (
                      <div className="mt-3 pt-2.5 border-t border-[#DDE3D2] flex flex-col gap-2 text-xs">
                        {item.contextExplanation && (
                          <div className="bg-transparent border-[1.5px] border-[#7FA65B] p-2.5 rounded-xl text-[#263522]">
                            <span className="block mb-0.5 text-xs font-bold text-[#4F6B42]" style={{ fontFamily: "'Playpen Sans', 'Mali', 'Itim', cursive" }}>Ngữ cảnh</span>
                            {item.contextExplanation}
                          </div>
                        )}
                        {item.example && (
                          <div className="bg-transparent border-[1.5px] border-dashed border-[#7FA65B] p-2.5 rounded-xl text-[#263522]">
                            <span className="block mb-0.5 text-xs font-bold text-[#4F6B42]" style={{ fontFamily: "'Playpen Sans', 'Mali', 'Itim', cursive" }}>Ví dụ</span>
                            {item.example}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="px-4 py-3 border-t border-[#DDE3D2] bg-[#FFFDF7] flex justify-between items-center mt-auto">
        <button
          onClick={clearHistory}
          disabled={cacheCount === 0}
          className="btn-danger-ghost"
        >
          Xóa lịch sử
        </button>

        <div className="flex items-center gap-1 text-[11px] font-bold text-[#697362]">
          <span>FinAI</span>
          <span>•</span>
          <span>v1.0.0</span>
        </div>
      </footer>
    </div>
  );
};
