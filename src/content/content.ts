import { TooltipManager } from './tooltip';
import { LookupRequest, LookupResponse } from '../shared/types';
import { MAX_SELECTION_LENGTH, MIN_SELECTION_LENGTH } from '../shared/constants';

const tooltipManager = new TooltipManager();

let isExtensionEnabled = true;

// Initialize enabled state
try {
  chrome.storage.local.get('enabled', (data) => {
    if (data && typeof data.enabled === 'boolean') {
      isExtensionEnabled = data.enabled;
    }
  });

  // Listen for setting changes in real-time
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.enabled) {
      isExtensionEnabled = changes.enabled.newValue;
      if (!isExtensionEnabled) {
        tooltipManager.hide();
      }
    }
  });
} catch (e) {
  console.log('Error checking storage:', e);
}

function debounce<F extends (...args: any[]) => any>(func: F, waitFor: number) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<F>): Promise<ReturnType<F>> => {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    return new Promise(resolve => {
      timeout = setTimeout(() => resolve(func(...args)), waitFor);
    });
  };
}

function getSurroundingContext(selection: Selection): string {
  const node = selection.anchorNode;
  if (!node || !node.textContent) return '';
  
  let current: Node | null = node;
  while (current && current.nodeType !== Node.ELEMENT_NODE) {
    current = current.parentNode;
  }
  
  if (current) {
    const text = current.textContent || '';
    if (text.length > 500) {
      const selText = selection.toString();
      const idx = text.indexOf(selText);
      if (idx !== -1) {
        const start = Math.max(0, idx - 100);
        const end = Math.min(text.length, idx + selText.length + 100);
        return text.substring(start, end);
      }
      return text.substring(0, 500);
    }
    return text;
  }
  return '';
}

function getSelectionPosition(selection: Selection): { x: number, y: number } | null {
  if (selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  return {
    x: rect.left,
    y: rect.bottom + 10
  };
}

const handleMouseUp = debounce(async (e: MouseEvent) => {
  // If extension is disabled, do nothing completely
  if (!isExtensionEnabled) {
    return;
  }

  // Double check storage just in case
  try {
    const data = await chrome.storage.local.get('enabled');
    if (data && data.enabled === false) {
      isExtensionEnabled = false;
      return;
    }
  } catch (err) {
    // ignore
  }

  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return;

  const selectedText = selection.toString().trim();
  
  // Validate length
  if (selectedText.length < MIN_SELECTION_LENGTH || selectedText.length > MAX_SELECTION_LENGTH) {
    return;
  }

  // Ensure it has letters (not just numbers/symbols)
  if (!/[a-zA-Z\u00C0-\u1EF9]/.test(selectedText)) {
    return;
  }

  const position = getSelectionPosition(selection);
  if (!position) return;

  const context = getSurroundingContext(selection);

  // Show loading only if enabled
  tooltipManager.showLoading(position);

  try {
    const request: LookupRequest = {
      type: 'LOOKUP_TERM',
      selectedText,
      surroundingContext: context,
      pageUrl: window.location.href
    };

    const response = await chrome.runtime.sendMessage(request) as LookupResponse;

    if (response.success && response.data) {
      tooltipManager.showResult(response.data);
    } else {
      // If error is because extension is disabled, silently hide
      if (response.error && response.error.includes('tắt')) {
        tooltipManager.hide();
      } else {
        tooltipManager.showError(response.error || 'Đã xảy ra lỗi không xác định.');
      }
    }
  } catch (error) {
    console.error('FinAI Extension Error:', error);
    tooltipManager.showError('Không thể kết nối với tiện ích. Vui lòng tải lại trang.');
  }
}, 300);

document.addEventListener('mouseup', handleMouseUp);

document.addEventListener('mousedown', (e: MouseEvent) => {
  if (tooltipManager.isVisible()) {
    if (!tooltipManager.contains(e.target)) {
      tooltipManager.hide();
    }
  }
});

document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape' && tooltipManager.isVisible()) {
    tooltipManager.hide();
  }
});
