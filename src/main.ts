import "./styles.css";
import { generateKeywords } from "./lib/generateKeywords";
import { requestModelPromptAnalysis } from "./lib/promptAnalysisApi";
import { buildPlatformSearchUrl, platforms } from "./lib/platformSearch";
import type { KeywordResult, ModelConfig, Platform } from "./types";

const examples = [
  "AI工具公众号封面，科技感，美漫风",
  "618电商大促主视觉，高转化，热烈促销感",
  "SaaS 官网首屏，极简，高级感",
  "品牌发布会海报，未来感，强视觉冲击"
];

const MODEL_CONFIG_STORAGE_KEY = "design-assistant-model-config";

let currentResult: KeywordResult | null = null;
let toastTimer: number | undefined;
let inputSyncTimer: number | undefined;
let typingTimer: number | undefined;
let isGenerating = false;

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root not found");
}

app.innerHTML = `
  <main class="app-shell">
    <section class="control-panel">
      <div class="hero-copy">
        <div class="console-meta">
          <span>Local Engine</span>
        </div>
        <div class="brand-lockup">
          <span class="brand-mark" aria-hidden="true"></span>
          <div>
            <p class="eyebrow">InspoRadar</p>
            <h1>灵感雷达</h1>
          </div>
        </div>
        <p class="subtitle">UI 设计师的灵感搜索控制台。</p>
      </div>
      <div class="input-panel">
        <div class="field-head">
          <label class="field-label" for="task-input">设计任务</label>
          <span>Rules only</span>
        </div>
        <textarea id="task-input" placeholder="例如：AI工具公众号封面，科技感，美漫风" rows="5"></textarea>
        <section class="model-config-panel">
          <button class="config-toggle" type="button" data-config-toggle aria-expanded="false">
            <span>大模型配置</span>
            <strong id="model-config-status">未配置</strong>
          </button>
          <div class="config-fields" data-config-fields hidden>
            <label>
              <span>接口地址</span>
              <input id="model-api-url" type="url" autocomplete="off" placeholder="https://api.openai.com/v1/chat/completions" />
            </label>
            <label>
              <span>API Key</span>
              <input id="model-api-key" type="password" autocomplete="off" placeholder="仅保存在本机浏览器" />
            </label>
            <label>
              <span>模型名</span>
              <input id="model-name" type="text" autocomplete="off" placeholder="例如：gpt-4.1-mini / qwen-plus" />
            </label>
            <div class="config-actions">
              <button class="ghost-button" type="button" data-clear-model-config>清除</button>
              <button class="secondary-button" type="button" data-save-model-config>保存配置</button>
            </div>
          </div>
        </section>
        <button id="generate-button" class="primary-button is-disabled" type="button" aria-disabled="true">生成关键词</button>
      </div>
    </section>
    <section class="workspace" aria-label="灵感工作台">
      <div id="result-area" class="result-area" aria-live="polite"></div>
    </section>
  </main>
  <div id="toast" class="toast" role="status" aria-live="polite">已复制</div>
`;

const input = document.querySelector<HTMLTextAreaElement>("#task-input")!;
const generateButton = document.querySelector<HTMLButtonElement>("#generate-button")!;
const resultArea = document.querySelector<HTMLElement>("#result-area")!;
const toast = document.querySelector<HTMLDivElement>("#toast")!;
const modelConfigStatus = document.querySelector<HTMLElement>("#model-config-status")!;
const modelApiUrlInput = document.querySelector<HTMLInputElement>("#model-api-url")!;
const modelApiKeyInput = document.querySelector<HTMLInputElement>("#model-api-key")!;
const modelNameInput = document.querySelector<HTMLInputElement>("#model-name")!;
const configFields = document.querySelector<HTMLElement>("[data-config-fields]")!;
const configToggle = document.querySelector<HTMLButtonElement>("[data-config-toggle]")!;

function updateGenerateState(): void {
  const isDisabled = input.value.trim().length === 0 || isGenerating;
  generateButton.setAttribute("aria-disabled", String(isDisabled));
  generateButton.classList.toggle("is-disabled", isDisabled);
}

function startInputStateSync(): void {
  window.clearInterval(inputSyncTimer);
  inputSyncTimer = window.setInterval(updateGenerateState, 200);
}

function stopInputStateSync(): void {
  window.clearInterval(inputSyncTimer);
  updateGenerateState();
}

function showToast(message = "已复制"): void {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 1600);
}

function getSavedModelConfig(): ModelConfig | null {
  try {
    const raw = window.localStorage.getItem(MODEL_CONFIG_STORAGE_KEY);
    if (!raw) return null;
    return normalizeModelConfig(JSON.parse(raw) as Partial<ModelConfig>);
  } catch {
    return null;
  }
}

function normalizeModelConfig(config: Partial<ModelConfig>): ModelConfig | null {
  const apiUrl = config.apiUrl?.trim() ?? "";
  const apiKey = config.apiKey?.trim() ?? "";
  const model = config.model?.trim() ?? "";

  return apiUrl && apiKey && model ? { apiUrl, apiKey, model } : null;
}

function readModelConfigFromForm(): ModelConfig | null {
  return normalizeModelConfig({
    apiUrl: modelApiUrlInput.value,
    apiKey: modelApiKeyInput.value,
    model: modelNameInput.value
  });
}

function syncModelConfigForm(): void {
  const config = getSavedModelConfig();
  modelApiUrlInput.value = config?.apiUrl ?? "";
  modelApiKeyInput.value = config?.apiKey ?? "";
  modelNameInput.value = config?.model ?? "";
  updateModelConfigStatus();
}

function updateModelConfigStatus(): void {
  const config = getSavedModelConfig();
  modelConfigStatus.textContent = config ? "已配置" : "未配置";
  modelConfigStatus.classList.toggle("is-ready", Boolean(config));
}

async function copyText(text: string): Promise<void> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    } else {
      fallbackCopy(text);
    }
  } catch {
    fallbackCopy(text);
  }
  showToast();
}

function fallbackCopy(text: string): void {
  const fallbackInput = document.createElement("textarea");
  fallbackInput.value = text;
  fallbackInput.setAttribute("readonly", "true");
  fallbackInput.className = "clipboard-fallback";
  document.body.append(fallbackInput);
  fallbackInput.select();
  document.execCommand("copy");
  fallbackInput.remove();
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return entities[char];
  });
}

function renderChip(text: string, extraClass = ""): string {
  return `<button class="copy-chip ${extraClass}" type="button" data-copy="${encodeURIComponent(text)}"><span>${escapeHtml(text)}</span></button>`;
}

function renderEmptyState(): string {
  return `
    <article class="empty-panel">
      <div class="empty-decor-bg"></div>
      
      <div class="empty-logo-wrapper">
        <div class="radar-circle pulse-1"></div>
        <div class="radar-circle pulse-2"></div>
        <div class="radar-circle pulse-3"></div>
        <span class="brand-mark empty-brand-logo" id="empty-logo-interactive" aria-hidden="true"></span>
      </div>

      <div class="empty-text-wrap">
        <h2>把设计主题变成全平台灵感线索</h2>
        <p class="empty-copy">
          输入一个设计方向，自动拆解为花瓣中文搜索词、海外平台英文关键词、品类灵感组合与 AI 绘图提示词。
        </p>
      </div>

      <div class="empty-cards-wrapper" id="empty-cards-carousel">
        <div class="empty-example-card" data-example-index="0" style="--card-theme-color: #a483e6; --card-glow-color: rgba(164, 131, 230, 0.15)">
          <div class="card-icon-wrap" style="background: rgba(164, 131, 230, 0.12)">
            <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          </div>
          <div class="card-content">
            <p>适合花瓣找中文封面结构，Dribbble / Behance 找科技视觉与插画气质。</p>
            <div class="card-tags">
              <span>科技感</span>
              <span>美漫风</span>
              <span>高对比</span>
            </div>
          </div>
          <div class="card-action-pill">
            <span>一键导入</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </div>
        </div>

        <div class="empty-example-card" data-example-index="1" style="--card-theme-color: #ff6b4a; --card-glow-color: rgba(255, 107, 74, 0.15)">
          <div class="card-icon-wrap" style="background: rgba(255, 107, 74, 0.12)">
            <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
          </div>
          <div class="card-content">
            <p>适合花瓣找活动会场，Pinterest / Behance 找促销构图、色彩和转化氛围。</p>
            <div class="card-tags">
              <span>高转化</span>
              <span>热烈大促</span>
              <span>红金配色</span>
            </div>
          </div>
          <div class="card-action-pill">
            <span>一键导入</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </div>
        </div>

        <div class="empty-example-card" data-example-index="2" style="--card-theme-color: #2a9d8f; --card-glow-color: rgba(42, 157, 143, 0.15)">
          <div class="card-icon-wrap" style="background: rgba(42, 157, 143, 0.12)">
            <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          </div>
          <div class="card-content">
            <p>适合 Awwwards 找网页首屏，Behance 找产品叙事与高级界面表达。</p>
            <div class="card-tags">
              <span>极简主义</span>
              <span>高级版式</span>
              <span>科技蓝灰</span>
            </div>
          </div>
          <div class="card-action-pill">
            <span>一键导入</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </div>
        </div>

        <div class="empty-example-card" data-example-index="3" style="--card-theme-color: #f4a261; --card-glow-color: rgba(244, 162, 97, 0.15)">
          <div class="card-icon-wrap" style="background: rgba(244, 162, 97, 0.12)">
            <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <div class="card-content">
            <p>适合 Behance 找品牌系统，Pinterest / Unsplash 补充舞台光影与未来材质。</p>
            <div class="card-tags">
              <span>未来纪元</span>
              <span>强视觉张力</span>
              <span>黑曜反光</span>
            </div>
          </div>
          <div class="card-action-pill">
            <span>一键导入</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </div>
        </div>
      </div>
    </article>
  `;
}

function initInteractiveEmptyPanel(): void {
  const logo = document.querySelector<HTMLElement>("#empty-logo-interactive");
  const cards = document.querySelectorAll<HTMLElement>(".empty-example-card");

  if (logo) {
    logo.addEventListener("mousemove", (e: MouseEvent) => {
      const rect = logo.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      logo.style.transform = `perspective(300px) rotateX(${-y / 4.5}deg) rotateY(${x / 4.5}deg) translate3d(${x / 2.5}px, ${y / 2.5}px, 15px)`;
    });

    logo.addEventListener("mouseleave", () => {
      logo.style.transform = "perspective(300px) rotateX(0deg) rotateY(0deg) translate3d(0, 0, 0)";
    });

    logo.addEventListener("touchstart", () => {
      logo.style.transform = "scale(0.92)";
    });
    logo.addEventListener("touchend", () => {
      logo.style.transform = "scale(1)";
    });
  }

  cards.forEach((card) => {
    card.addEventListener("mousemove", (e: MouseEvent) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      card.style.transform = `perspective(600px) rotateX(${-y / 12}deg) rotateY(${x / 12}deg) translateY(-4px)`;
    });

    card.addEventListener("mouseleave", () => {
      card.style.transform = "perspective(600px) rotateX(0deg) rotateY(0deg) translateY(0)";
    });

    card.addEventListener("click", () => {
      const indexAttr = card.getAttribute("data-example-index");
      if (indexAttr === null) return;
      const index = parseInt(indexAttr, 10);
      const taskText = examples[index];

      card.style.transform = "scale(0.96) translateY(2px)";
      window.setTimeout(() => {
        card.style.transform = "perspective(600px) rotateX(0deg) rotateY(0deg) translateY(0)";
      }, 120);

      let currentLen = 0;
      input.value = "";
      input.focus();
      updateGenerateState();

      window.clearInterval(typingTimer);
      typingTimer = window.setInterval(() => {
        currentLen++;
        input.value = taskText.slice(0, currentLen);
        updateGenerateState();

        if (currentLen >= taskText.length) {
          window.clearInterval(typingTimer);
          
          generateButton.classList.add("focus-pulse-highlight");
          window.setTimeout(() => {
            generateButton.classList.remove("focus-pulse-highlight");
          }, 1500);
        }
      }, 15);
    });
  });

  const carousel = document.querySelector<HTMLElement>("#empty-cards-carousel");
  if (carousel) {
    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;

    carousel.addEventListener("mousedown", (e: MouseEvent) => {
      isDown = true;
      startX = e.pageX - carousel.offsetLeft;
      scrollLeft = carousel.scrollLeft;
    });

    carousel.addEventListener("mouseleave", () => {
      isDown = false;
    });

    carousel.addEventListener("mouseup", () => {
      isDown = false;
    });

    carousel.addEventListener("mousemove", (e: MouseEvent) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - carousel.offsetLeft;
      const walk = (x - startX) * 1.5;
      carousel.scrollLeft = scrollLeft - walk;
    });
  }
}

function setEmptyState(): void {
  resultArea.innerHTML = renderEmptyState();
  initInteractiveEmptyPanel();
}

function renderAnalysisSummary(result: KeywordResult): string {
  const rows: Array<[string, string[]]> = [
    ["类型", result.analysis.designType],
    ["主题", result.analysis.themeContent],
    ["风格", result.analysis.visualStyle],
    ["场景", result.analysis.useCase],
    ["情绪", result.analysis.mood]
  ];

  return rows
    .map(
      ([label, values]) => `
        <div class="summary-item">
          <span>${label}</span>
          <strong>${escapeHtml(values.join(" / "))}</strong>
        </div>
      `
    )
    .join("");
}

function renderPlatformActions(result: KeywordResult): string {
  const platformKeys = Object.keys(result.platformSearchTerms) as Platform[];

  return `
    <div class="platform-list">
      ${platformKeys
        .map((platform) => {
          const term = result.platformSearchTerms[platform][0];
          const searchUrl = buildPlatformSearchUrl(platform, term);
          return `
            <section class="platform-row">
              <div class="platform-name">
                <span>${platforms[platform].label}</span>
              </div>
              <div class="platform-query">${renderChip(term)}</div>
              <button class="open-button" type="button" data-search-url="${encodeURIComponent(searchUrl)}">打开</button>
            </section>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderCategorySearches(result: KeywordResult): string {
  return `
    <article class="desk-panel search-panel">
      <div class="section-heading">
        <h2>分品类搜索</h2>
        <span>Logo / 海报 / 纹理 / 壁纸 / 字体</span>
      </div>
      <div class="category-grid">
        ${result.categorySearches
          .map(
            (item) => `
              <section class="category-card">
                <div>
                  <h3>${item.label}</h3>
                  <p>${item.purpose}</p>
                </div>
                <div class="query-stack">
                  ${renderChip(item.zhQuery)}
                </div>
              </section>
            `
          )
          .join("")}
      </div>
    </article>
  `;
}

function renderAestheticInsights(result: KeywordResult): string {
  return `
    <article class="desk-panel insight-block">
      <div class="section-heading">
        <h2>审美拆解</h2>
        <span>审美视角与执行技巧</span>
      </div>
      <div class="insight-grid">
        ${result.aestheticInsights
          .map(
            (insight) => `
              <section class="insight-card">
                <h3>${insight.title}</h3>
                <p>${insight.observation}</p>
                <button class="copy-chip insight-action" type="button" data-copy="${encodeURIComponent(insight.action)}">${insight.action}</button>
              </section>
            `
          )
          .join("")}
      </div>
    </article>
  `;
}

function renderDesignDirections(result: KeywordResult): string {
  return `
    <article class="desk-panel direction-block">
      <div class="section-heading">
        <h2>可执行设计方向</h2>
        <span>可以直接使用的设计方向</span>
      </div>
      <div class="direction-list">
        ${result.designDirections
          .map(
            (direction, index) => `
              <section class="direction-card">
                <div class="direction-index">${index + 1}</div>
                <div class="direction-content">
                  <h3>${direction.title}</h3>
                  <p>${direction.summary}</p>
                  <ol>
                    ${direction.steps.map((step) => `<li>${step}</li>`).join("")}
                  </ol>
                  <div class="chip-grid">${direction.keywords.map((keyword) => renderChip(keyword)).join("")}</div>
                </div>
              </section>
            `
          )
          .join("")}
      </div>
    </article>
  `;
}

function renderPromptPanel(result: KeywordResult): string {
  return `
    <article class="desk-panel prompt-card">
      <div class="section-heading">
        <h2>场景化提示词</h2>
        <span>不同应用场景提示词</span>
      </div>
      <div class="prompt-scenario-list">
        ${result.promptScenarios
          .map(
            (scenario) => `
              <section class="prompt-scenario-detail">
                <div class="prompt-mode-head">
                  <div>
                    <h3>${scenario.label}</h3>
                  </div>
                </div>
                <div class="prompt-keywords">${scenario.keywords.map((keyword) => `<span>${escapeHtml(keyword)}</span>`).join("")}</div>
                <button class="prompt-copy" type="button" data-copy="${encodeURIComponent(scenario.zh)}">${escapeHtml(scenario.zh)}</button>
              </section>
            `
          )
          .join("")}
      </div>
      <div class="workflow-prompt">
        <h3>Codex / Skill 工作流</h3>
        <p class="prompt">${renderChip(result.codexWorkflowPrompt, "prompt-copy workflow-copy")}</p>
      </div>
    </article>
  `;
}

function renderFullResultText(result: KeywordResult): string {
  const platformLines = (Object.keys(result.platformSearchTerms) as Platform[])
    .map((platform) => `${platforms[platform].label}: ${result.platformSearchTerms[platform].join(" / ")}`)
    .join("\n");

  return [
    `设计任务：${result.sourceInput}`,
    "",
    "需求拆解",
    `设计类型：${result.analysis.designType.join(" / ")}`,
    `主题内容：${result.analysis.themeContent.join(" / ")}`,
    `视觉风格：${result.analysis.visualStyle.join(" / ")}`,
    `应用场景：${result.analysis.useCase.join(" / ")}`,
    `情绪方向：${result.analysis.mood.join(" / ")}`,
    "",
    `关键词：${result.chineseKeywords.join(" / ")}`,
    "",
    "平台搜索词",
    platformLines,
    "",
    `搜索组合：${result.searchCombinations.join(" / ")}`,
    "",
    "AI 场景提示词",
    result.promptScenarios
      .map(
        (scenario) =>
          `${scenario.recommended ? "推荐：" : ""}${scenario.label}\n采用关键词：${scenario.keywords.join(" / ")}\n提示词：${scenario.zh}`
      )
      .join("\n\n")
  ].join("\n");
}

function renderPromptFocus(result: KeywordResult): string {
  const activeScenario = result.promptScenarios.find((scenario) => scenario.recommended) ?? result.promptScenarios[0];

  return `
    <section class="focus-card prompt-focus">
      <div class="section-heading">
        <h2>AI 提示词</h2>
        <span>${result.promptSourceLabel}</span>
      </div>
      <div class="prompt-tabs" role="tablist" aria-label="AI 提示词场景">
        ${result.promptScenarios
          .map(
            (scenario) => `
              <button type="button" data-prompt-tab="${scenario.id}" aria-selected="${scenario.id === activeScenario.id}">
                ${getPromptTabLabel(scenario.id)}
              </button>
            `
          )
          .join("")}
      </div>
      <div class="prompt-tab-panels">
        ${result.promptScenarios
          .map(
            (scenario) => `
              <section class="prompt-tab-panel" data-prompt-panel="${scenario.id}" ${scenario.id === activeScenario.id ? "" : "hidden"}>
                <div class="prompt-mode-head">
                  <div>
                    <h3>${scenario.label}</h3>
                  </div>
                </div>
                <div class="prompt-keywords">${scenario.keywords.map((keyword) => `<span>${escapeHtml(keyword)}</span>`).join("")}</div>
                <button class="prompt-copy" type="button" data-copy="${encodeURIComponent(scenario.zh)}">${escapeHtml(scenario.zh)}</button>
              </section>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function getPromptTabLabel(id: string): string {
  const labels: Record<string, string> = {
    visual: "海报",
    ui: "UI",
    icon: "图标",
    asset: "素材"
  };

  return labels[id] ?? id;
}

function renderDetails(result: KeywordResult): string {
  return `
    <section class="details-card">
      <div class="detail-tabs" role="tablist" aria-label="结果详情">
        <button type="button" data-detail-tab="keywords" aria-selected="true">关键词</button>
        <button type="button" data-detail-tab="category" aria-selected="false">分品类</button>
        <button type="button" data-detail-tab="insight" aria-selected="false">审美拆解</button>
        <button type="button" data-detail-tab="direction" aria-selected="false">设计方向</button>
        <button type="button" data-detail-tab="workflow" aria-selected="false">工作流</button>
      </div>
      <div class="detail-panel" data-detail-panel="keywords">
        <section>
          <h3>关键词</h3>
          <div class="chip-grid">${result.chineseKeywords.map((item) => renderChip(item)).join("")}</div>
        </section>
      </div>
      <div class="detail-panel" data-detail-panel="category" hidden>${renderCategorySearches(result)}</div>
      <div class="detail-panel" data-detail-panel="insight" hidden>${renderAestheticInsights(result)}</div>
      <div class="detail-panel" data-detail-panel="direction" hidden>${renderDesignDirections(result)}</div>
      <div class="detail-panel" data-detail-panel="workflow" hidden>${renderPromptPanel(result)}</div>
    </section>
  `;
}

function renderResult(result: KeywordResult, statusLabel = result.promptSourceLabel): void {
  resultArea.innerHTML = `
    <div class="result-workbench">
      <header class="result-header">
        <div>
          <p class="eyebrow">当前设计需求</p>
          <h2>${escapeHtml(result.sourceInput)}</h2>
        </div>
        <div class="result-status" aria-label="生成状态">
          <span></span>
          <strong>${escapeHtml(statusLabel)}</strong>
        </div>
        <div class="result-actions">
          <button class="secondary-button" type="button" data-copy-result>复制完整结果</button>
          <button class="ghost-button" type="button" data-reset-result>清空</button>
        </div>
      </header>
      <section class="focus-grid" aria-label="推荐结果">
        <article class="focus-card analysis-focus">
          <div class="section-heading">
            <h2>需求摘要</h2>
            <span>智能需求拆解</span>
          </div>
          <div class="summary-strip">${renderAnalysisSummary(result)}</div>
        </article>
        <article class="focus-card platform-focus">
          <div class="section-heading">
            <h2>平台搜索</h2>
            <span>检索平台一键搜索</span>
          </div>
          ${renderPlatformActions(result)}
        </article>
        ${renderPromptFocus(result)}
      </section>
      ${renderDetails(result)}
    </div>
  `;
}

configToggle.addEventListener("click", () => {
  const isExpanded = configToggle.getAttribute("aria-expanded") === "true";
  configToggle.setAttribute("aria-expanded", String(!isExpanded));
  configFields.hidden = isExpanded;
});

document.querySelector<HTMLButtonElement>("[data-save-model-config]")!.addEventListener("click", () => {
  const config = readModelConfigFromForm();

  if (!config) {
    showToast("请补全模型配置");
    return;
  }

  window.localStorage.setItem(MODEL_CONFIG_STORAGE_KEY, JSON.stringify(config));
  updateModelConfigStatus();
  configToggle.setAttribute("aria-expanded", "false");
  configFields.hidden = true;
  showToast("配置已保存");
});

document.querySelector<HTMLButtonElement>("[data-clear-model-config]")!.addEventListener("click", () => {
  window.localStorage.removeItem(MODEL_CONFIG_STORAGE_KEY);
  syncModelConfigForm();
  showToast("配置已清除");
});

input.addEventListener("beforeinput", () => window.setTimeout(updateGenerateState, 0));
input.addEventListener("input", updateGenerateState);
input.addEventListener("change", updateGenerateState);
input.addEventListener("keyup", updateGenerateState);
input.addEventListener("paste", () => window.setTimeout(updateGenerateState, 0));
input.addEventListener("compositionend", updateGenerateState);
input.addEventListener("focus", startInputStateSync);
input.addEventListener("blur", stopInputStateSync);

function setGeneratingState(isGenerating: boolean): void {
  window.clearInterval(inputSyncTimer);
  window.setTimeout(updateGenerateState, 0);
  generateButton.textContent = isGenerating ? "分析中..." : "生成关键词";
  generateButton.setAttribute("aria-busy", String(isGenerating));
}

generateButton.addEventListener("click", () => {
  const task = input.value.trim();

  if (task.length === 0 || isGenerating) {
    updateGenerateState();
    showToast("先输入设计任务");
    return;
  }

  void generateResult(task);
});

async function generateResult(task: string): Promise<void> {
  isGenerating = true;
  setGeneratingState(true);
  currentResult = generateKeywords(task);
  renderResult(currentResult, "Analyzing");

  const modelAnalysis = await requestModelPromptAnalysis(currentResult, getSavedModelConfig());

  if (modelAnalysis.ok) {
    currentResult = generateKeywords(task, {
      promptSource: "model",
      promptInterpretations: modelAnalysis.interpretations
    });
    renderResult(currentResult);
    showToast("模型分析完成");
  } else {
    const hasModelConfig = Boolean(getSavedModelConfig());
    renderResult(currentResult, hasModelConfig ? "模型失败，本地规则" : currentResult.promptSourceLabel);
    if (hasModelConfig) {
      showToast(modelAnalysis.error ?? "模型分析失败");
    }
  }

  setGeneratingState(false);
  isGenerating = false;
  updateGenerateState();
}

document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const copyTarget = target.closest<HTMLButtonElement>("[data-copy]");
  const copyResultTarget = target.closest<HTMLButtonElement>("[data-copy-result]");
  const searchUrlTarget = target.closest<HTMLButtonElement>("[data-search-url]");
  const detailTabTarget = target.closest<HTMLButtonElement>("[data-detail-tab]");
  const promptTabTarget = target.closest<HTMLButtonElement>("[data-prompt-tab]");
  const resetTarget = target.closest<HTMLButtonElement>("[data-reset-result]");

  if (copyTarget) {
    void copyText(decodeURIComponent(copyTarget.dataset.copy ?? ""));
    return;
  }

  if (copyResultTarget && currentResult) {
    void copyText(renderFullResultText(currentResult));
    return;
  }

  if (searchUrlTarget) {
    const url = decodeURIComponent(searchUrlTarget.dataset.searchUrl ?? "");
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (opened) {
      showToast("已打开搜索");
    } else {
      void copyText(url);
      showToast("已复制链接");
    }
    return;
  }

  if (detailTabTarget) {
    const tabName = detailTabTarget.dataset.detailTab ?? "";
    const root = detailTabTarget.closest<HTMLElement>(".details-card");
    root?.querySelectorAll<HTMLButtonElement>("[data-detail-tab]").forEach((button) => {
      button.setAttribute("aria-selected", String(button.dataset.detailTab === tabName));
    });
    root?.querySelectorAll<HTMLElement>("[data-detail-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.detailPanel !== tabName;
    });
    return;
  }

  if (promptTabTarget) {
    const tabName = promptTabTarget.dataset.promptTab ?? "";
    const root = promptTabTarget.closest<HTMLElement>(".prompt-focus");
    root?.querySelectorAll<HTMLButtonElement>("[data-prompt-tab]").forEach((button) => {
      button.setAttribute("aria-selected", String(button.dataset.promptTab === tabName));
    });
    root?.querySelectorAll<HTMLElement>("[data-prompt-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.promptPanel !== tabName;
    });
    return;
  }

  if (resetTarget) {
    currentResult = null;
    input.value = "";
    setEmptyState();
    updateGenerateState();
    input.focus();
  }
});

setEmptyState();
syncModelConfigForm();
updateGenerateState();
