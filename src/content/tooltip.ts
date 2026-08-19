import tooltipStyles from './tooltip.css';
import { TermExplanation } from '../shared/types';

export class TooltipManager {
  private hostElement: HTMLElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private container: HTMLElement | null = null;
  
  private ensureShadowHost(): ShadowRoot {
    if (this.shadowRoot) return this.shadowRoot;
    
    const host = document.createElement('div');
    host.id = 'finterm-tooltip-host';
    host.style.cssText = 'all: initial; position: absolute; z-index: 2147483647; top: 0; left: 0; pointer-events: none;';
    document.body.appendChild(host);
    this.hostElement = host;
    
    this.shadowRoot = host.attachShadow({ mode: 'closed' });
    
    // Inject styles
    const style = document.createElement('style');
    style.textContent = tooltipStyles;
    this.shadowRoot.appendChild(style);
    
    // Create container
    this.container = document.createElement('div');
    this.container.className = 'finterm-tooltip';
    this.container.style.display = 'none';
    this.container.style.pointerEvents = 'auto'; // Re-enable pointer events for tooltip itself
    this.shadowRoot.appendChild(this.container);
    
    // Add close listener
    this.container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.finterm-close')) {
        this.hide();
      }
    });
    
    return this.shadowRoot;
  }
  
  show(position: {x: number, y: number}) {
    this.ensureShadowHost();
    if (!this.container) return;
    
    // Position the tooltip as a proper rectangle
    const viewportWidth = window.innerWidth;
    const tooltipWidth = Math.min(380, viewportWidth - 32);
    
    let left = position.x;
    if (left + tooltipWidth > viewportWidth - 16) {
      left = viewportWidth - tooltipWidth - 16;
    }
    if (left < 16) left = 16;
    
    // Add scroll offset for absolute positioning
    const top = position.y + window.scrollY;
    
    this.container.style.left = `${left}px`;
    this.container.style.top = `${top}px`;
    this.container.style.width = `${tooltipWidth}px`;
    this.container.style.display = 'block';
  }
  
  showLoading(position: {x: number, y: number}) {
    this.show(position);
    if (!this.container) return;
    
    const logoUrl = chrome.runtime.getURL('assets/logo.svg');
    
    this.container.innerHTML = `
      <div class="finterm-loading">
        <div class="finterm-brand-badge" style="opacity: 0.75;">
          <img src="${logoUrl}" alt="FinAI Logo" class="finterm-brand-logo" />
          <span class="finterm-brand-name">FinAI</span>
        </div>
        <div class="finterm-skeleton s-title"></div>
        <div class="finterm-skeleton s-text"></div>
        <div class="finterm-skeleton s-text"></div>
        <div class="finterm-skeleton s-text-short"></div>
      </div>
    `;
  }
  
  showResult(data: TermExplanation) {
    if (!this.container) return;
    
    const difficultyMap: Record<string, string> = {
      'beginner': 'Người mới',
      'intermediate': 'Trung bình',
      'advanced': 'Chuyên sâu'
    };
    
    const diffLabel = difficultyMap[data.difficulty] || data.difficulty;
    const logoUrl = chrome.runtime.getURL('assets/logo.svg');
    
    let html = `
      <div class="finterm-header">
        <div class="finterm-header-left">
          <div class="finterm-brand-badge">
            <img src="${logoUrl}" alt="FinAI Logo" class="finterm-brand-logo" />
            <span class="finterm-brand-name">FinAI</span>
          </div>
          <div class="finterm-term-row">
            <h2 class="finterm-term">${this.escapeHtml(data.term)}</h2>
            <span class="finterm-badge finterm-badge--${data.difficulty}">${diffLabel}</span>
          </div>
          ${data.termEnglish ? `<p class="finterm-term-en">${this.escapeHtml(data.termEnglish)}</p>` : ''}
        </div>
        <button class="finterm-close" aria-label="Đóng">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      
      <div class="finterm-section">
        <p class="finterm-definition">${this.escapeHtml(data.definition)}</p>
        ${data.definitionEnglish ? `<p class="finterm-definition-en">${this.escapeHtml(data.definitionEnglish)}</p>` : ''}
      </div>
    `;
    
    if (data.contextExplanation) {
      html += `
        <div class="finterm-section">
          <h3 class="finterm-section-title finterm-handwriting-title">Ngữ cảnh</h3>
          <p class="finterm-context">${this.escapeHtml(data.contextExplanation)}</p>
        </div>
      `;
    }
    
    if (data.example) {
      html += `
        <div class="finterm-section">
          <h3 class="finterm-section-title finterm-handwriting-title">Ví dụ</h3>
          <div class="finterm-example">
            <span>${this.escapeHtml(data.example)}</span>
          </div>
        </div>
      `;
    }
    
    if (data.relatedTerms && data.relatedTerms.length > 0) {
      const tags = data.relatedTerms.map(t => `<span class="finterm-tag">${this.escapeHtml(t)}</span>`).join('');
      html += `
        <div class="finterm-section">
          <h3 class="finterm-section-title finterm-handwriting-title">Thuật ngữ liên quan</h3>
          <div class="finterm-related">
            ${tags}
          </div>
        </div>
      `;
    }
    
    this.container.innerHTML = html;
  }
  
  showError(message: string) {
    if (!this.container) return;
    
    this.container.innerHTML = `
      <div class="finterm-header" style="border:none; padding-bottom:0; margin-bottom:0; justify-content:flex-end;">
        <button class="finterm-close" aria-label="Đóng">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="finterm-error">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <p>${this.escapeHtml(message)}</p>
      </div>
    `;
  }
  
  hide() {
    if (this.container) {
      this.container.style.display = 'none';
    }
  }
  
  isVisible(): boolean {
    return this.container !== null && this.container.style.display === 'block';
  }
  
  contains(element: EventTarget | null): boolean {
    if (!this.hostElement || !element) return false;
    return this.hostElement === element || this.hostElement.contains(element as Node);
  }
  
  private escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
