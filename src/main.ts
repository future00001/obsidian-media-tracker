import {
  App,
  MarkdownPostProcessorContext,
  Modal,
  Notice,
  parseYaml,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  normalizePath
} from 'obsidian';

declare const require: (moduleName: string) => any;

type MediaCategory = '电影' | '电视剧' | '动漫';

interface MediaReview {
  id: string;
  title: string;
  category: MediaCategory;
  rating: number;
  review: string;
  watchedAt: string;
  year: string;
  genres: string[];
  native: string;
}

interface MediaTrackerSettings {
  recordPath: string;
}

interface LegacyData {
  settings?: Partial<MediaTrackerSettings>;
  items?: unknown[];
}

interface TrackerView {
  path: string;
  refresh: () => Promise<void>;
}

const DEFAULT_SETTINGS: MediaTrackerSettings = {
  recordPath: '观影记录.md'
};

const FRONTMATTER_KEY = 'media-tracker-items';
const STORAGE_SECTION_PATTERN = /<!-- media-tracker-items:section-start -->\r?\n[\s\S]*?\r?\n<!-- media-tracker-items:section-end -->/;
const DATA_BLOCK_PATTERN = /<!-- media-tracker-items:start -->\r?\n```media-tracker-data\r?\n([\s\S]*?)\r?\n```\r?\n<!-- media-tracker-items:end -->/;
const REVIEW_COLLAPSE_LENGTH = 140;
const CATEGORIES: Array<{ name: MediaCategory; icon: string; cls: string }> = [
  { name: '电影', icon: '🎞️', cls: 'mt-column-movie' },
  { name: '电视剧', icon: '📺', cls: 'mt-column-tv' },
  { name: '动漫', icon: '🪄', cls: 'mt-column-anime' }
];

function isCategory(value: unknown): value is MediaCategory {
  return value === '电影' || value === '电视剧' || value === '动漫';
}

function todayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function normalizeItem(raw: unknown, index = 0): MediaReview | null {
  if (!raw || typeof raw !== 'object') return null;

  const value = raw as Record<string, unknown>;
  const title = String(value.title ?? '').trim();
  const category = isCategory(value.category) ? value.category : null;
  const ratingNumber = Number(value.rating);

  if (!title || !category || !Number.isFinite(ratingNumber)) return null;

  return {
    id: String(value.id ?? `media_${Date.now()}_${index}`),
    title,
    category,
    rating: Math.min(5, Math.max(0, Math.round(ratingNumber))),
    review: String(value.review ?? ''),
    watchedAt: String(value.watchedAt ?? value.createdAt ?? todayString()),
    year: String(value.year ?? ''),
    genres: Array.isArray(value.genres) ? value.genres.map(String) : [],
    native: String(value.native ?? '')
  };
}

function getStorageSection(items: MediaReview[]): string {
  const payload = JSON.stringify({ items }, null, 2);
  return [
    '<!-- media-tracker-items:section-start -->',
    '> [!warning] 观影记录插件数据区',
    '> `media-tracker-items` 位于本区域底部，由插件自动维护。',
    '> 请勿删除或修改，否则记录、评分和观感将无法读取。',
    '',
    '<!-- media-tracker-items:start -->',
    '```media-tracker-data',
    payload,
    '```',
    '<!-- media-tracker-items:end -->',
    '<!-- media-tracker-items:section-end -->'
  ].join('\n');
}

export default class MediaTrackerPlugin extends Plugin {
  settings: MediaTrackerSettings = DEFAULT_SETTINGS;
  legacyItems: MediaReview[] = [];
  viewRefreshers = new Map<HTMLElement, TrackerView>();

  async onload() {
    const loaded = (await this.loadData()) as LegacyData | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded?.settings ?? {});
    this.legacyItems = (loaded?.items ?? [])
      .map((item, index) => normalizeItem(item, index))
      .filter((item): item is MediaReview => item !== null && !item.id.startsWith('demo_'));

    this.registerMarkdownCodeBlockProcessor('media-tracker', (_source, el, ctx) => {
      return this.renderTrackerView(el, ctx);
    });

    this.registerMarkdownCodeBlockProcessor('media-tracker-data', (_source, el) => {
      el.empty();
      el.addClass('mt-data-storage');
    });

    this.addRibbonIcon('clapperboard', '打开观影记录', () => {
      void this.openRecordFile();
    });

    this.addCommand({
      id: 'open-media-tracker',
      name: '打开观影记录文件',
      callback: () => {
        void this.openRecordFile();
      }
    });

    this.addCommand({
      id: 'add-media-review',
      name: '新建观影记录',
      callback: () => {
        void this.openAddModal();
      }
    });

    this.addCommand({
      id: 'export-ai-recommendation-material',
      name: '导出',
      callback: () => {
        void this.exportForAI(this.getConfiguredPath());
      }
    });

    this.addSettingTab(new MediaTrackerSettingTab(this.app, this));
  }

  onunload() {
    this.viewRefreshers.clear();
  }

  async saveSettings() {
    await this.saveData({ settings: this.settings, items: this.legacyItems });
  }

  getConfiguredPath(): string {
    let path = normalizePath(this.settings.recordPath.trim() || DEFAULT_SETTINGS.recordPath);
    if (!path.toLowerCase().endsWith('.md')) path += '.md';
    return path;
  }

  async ensureParentFolders(path: string) {
    const parts = path.split('/');
    let current = '';

    for (const part of parts.slice(0, -1)) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
  }

  getStarterContent(): string {
    return [
      '# 我的观影记录',
      '',
      '```media-tracker',
      '```',
      '',
      getStorageSection([]),
      ''
    ].join('\n');
  }

  async ensureRecordFile(path = this.getConfiguredPath()): Promise<TFile> {
    const normalizedPath = normalizePath(path);
    const existing = this.app.vault.getAbstractFileByPath(normalizedPath);
    if (existing instanceof TFile) return existing;
    if (existing) throw new Error(`记录路径不是文件：${normalizedPath}`);

    await this.ensureParentFolders(normalizedPath);
    return this.app.vault.create(normalizedPath, this.getStarterContent());
  }

  async openRecordFile() {
    try {
      const file = await this.ensureRecordFile();
      await this.app.workspace.getLeaf(false).openFile(file);
    } catch (error) {
      new Notice(`无法打开观影记录文件：${String(error)}`);
    }
  }

  async openAddModal() {
    try {
      const file = await this.ensureRecordFile();
      await this.app.workspace.getLeaf(false).openFile(file);
      new AddMediaModal(this.app, this, file.path).open();
    } catch (error) {
      new Notice(`无法打开观影记录文件：${String(error)}`);
    }
  }

  async readItems(file: TFile): Promise<MediaReview[]> {
    const content = await this.app.vault.read(file);
    const dataMatch = content.match(DATA_BLOCK_PATTERN);

    if (dataMatch) {
      try {
        const parsed = JSON.parse(dataMatch[1]) as { items?: unknown[] };
        return (parsed.items ?? [])
          .map((item, index) => normalizeItem(item, index))
          .filter((item): item is MediaReview => item !== null);
      } catch (error) {
        new Notice(`观影记录数据区解析失败：${String(error)}`);
        return [];
      }
    }

    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    let frontmatter: Record<string, unknown> = {};

    if (match) {
      try {
        frontmatter = parseYaml(match[1]) ?? {};
      } catch (error) {
        new Notice(`观影记录属性解析失败：${String(error)}`);
      }
    }

    const rawItems = frontmatter[FRONTMATTER_KEY];
    const items = Array.isArray(rawItems)
      ? rawItems.map((item, index) => normalizeItem(item, index)).filter((item): item is MediaReview => item !== null)
      : [];

    // 兼容旧版本：把顶部属性和旧插件数据迁移到底部数据区。
    if (rawItems !== undefined || this.legacyItems.length > 0) {
      const existingIds = new Set(items.map(item => item.id));
      const migrated = [
        ...items,
        ...this.legacyItems.filter(item => !existingIds.has(item.id))
      ];
      await this.writeItems(file, migrated);
      this.legacyItems = [];
      return migrated;
    }

    return items;
  }

  hasLegacyFrontmatter(content: string): boolean {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!match) return false;

    try {
      const frontmatter = parseYaml(match[1]) ?? {};
      return Object.prototype.hasOwnProperty.call(frontmatter, FRONTMATTER_KEY);
    } catch {
      return false;
    }
  }

  async writeItems(file: TFile, items: MediaReview[]) {
    let content = await this.app.vault.read(file);

    if (this.hasLegacyFrontmatter(content)) {
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        delete frontmatter[FRONTMATTER_KEY];
      });
      content = await this.app.vault.read(file);
    }

    const section = getStorageSection(items);
    const nextContent = STORAGE_SECTION_PATTERN.test(content)
      ? content.replace(STORAGE_SECTION_PATTERN, () => section)
      : `${content.replace(/\s+$/, '')}\n\n${section}\n`;

    if (nextContent !== content) {
      await this.app.vault.modify(file, nextContent);
    }
    this.refreshTrackerViews(file.path);
  }

  refreshTrackerViews(path: string) {
    for (const [el, view] of this.viewRefreshers) {
      if (!el.isConnected) {
        this.viewRefreshers.delete(el);
        continue;
      }
      if (view.path === path) void view.refresh();
    }
  }

  async addItem(path: string, item: MediaReview) {
    const file = await this.ensureRecordFile(path);
    const items = await this.readItems(file);
    await this.writeItems(file, [item, ...items]);
  }

  async updateRating(path: string, id: string, rating: number) {
    const file = await this.ensureRecordFile(path);
    const items = await this.readItems(file);
    const item = items.find(entry => entry.id === id);
    if (!item) return;
    item.rating = rating;
    await this.writeItems(file, items);
  }

  async updateReview(path: string, id: string, review: string) {
    const file = await this.ensureRecordFile(path);
    const items = await this.readItems(file);
    const item = items.find(entry => entry.id === id);
    if (!item) return;
    item.review = review;
    await this.writeItems(file, items);
  }

  async exportForAI(sourcePath: string) {
    try {
      const file = await this.ensureRecordFile(sourcePath);
      const items = await this.readItems(file);
      const nodeRequire = typeof require === 'function' ? require : (globalThis as any).require;
      if (!nodeRequire) throw new Error('当前 Obsidian 环境不允许访问桌面文件系统。');
      const fs = nodeRequire('fs');
      const desktopPath = this.getDesktopExportPath();
      const markdown: string[] = [
        '# 观影记录导出',
        '',
        '| 剧名 | 分类 | 评分 |',
        '| --- | --- | --- |'
      ];

      for (const item of items) {
        const title = item.title.replace(/[|\r\n]+/g, ' ');
        const rating = item.rating > 0 ? `${item.rating}/5` : '未评分';
        markdown.push(`| ${title} | ${item.category} | ${rating} |`);
      }

      fs.writeFileSync(desktopPath, `${markdown.join('\n')}\n`, 'utf8');
      new Notice(`已导出 ${items.length} 条记录到桌面：观影记录导出.md`);
    } catch (error) {
      new Notice(`导出失败：${String(error)}`);
    }
  }

  async deleteItem(path: string, id: string) {
    const file = await this.ensureRecordFile(path);
    const items = await this.readItems(file);
    await this.writeItems(file, items.filter(item => item.id !== id));
  }

  getDesktopExportPath(): string {
    const nodeRequire = typeof require === 'function' ? require : (globalThis as any).require;
    if (!nodeRequire) throw new Error('当前 Obsidian 环境不允许访问桌面文件系统。');

    const os = nodeRequire('os');
    const path = nodeRequire('path');
    const fs = nodeRequire('fs');
    const childProcess = nodeRequire('child_process');
    const processInfo = nodeRequire('process');
    const home = processInfo.env?.USERPROFILE || os.homedir();
    const candidates: string[] = [];

    try {
      const registryOutput = childProcess.execFileSync(
        'reg',
        [
          'query',
          'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders',
          '/v',
          'Desktop'
        ],
        { encoding: 'utf8' }
      ) as string;
      const match = registryOutput.match(/Desktop\s+REG_\w+\s+(.+)/i);
      if (match?.[1]) {
        const registryPath = match[1].trim().replace(/%([^%]+)%/g, (_: string, key: string) => processInfo.env?.[key] ?? '');
        candidates.push(registryPath);
      }
    } catch {
      // Fall back to the conventional desktop paths below.
    }

    candidates.push(path.join(home, 'Desktop'), path.join(home, 'OneDrive', 'Desktop'));
    const desktop = candidates.find((candidate: string) => fs.existsSync(candidate)) || candidates[0];
    return path.join(desktop, '观影记录导出.md');
  }

  async renderTrackerView(el: HTMLElement, ctx: MarkdownPostProcessorContext) {
    const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(file instanceof TFile)) {
      el.setText('无法找到观影记录文件。');
      return;
    }

    const pageSize = 12;
    const visibleCounts = new Map<MediaCategory, number>();

    const render = async () => {
      const items = await this.readItems(file);
      if (!el.isConnected) return;

      el.empty();
      el.addClass('mt-container');

      const toolbar = el.createDiv({ cls: 'mt-toolbar' });
      const heading = toolbar.createDiv({ cls: 'mt-heading-group' });
      heading.createEl('h2', { text: '🎬 我的观影记录', cls: 'mt-heading' });
      heading.createEl('span', {
        text: `${items.length} 部作品 · 保存于 ${file.path}`,
        cls: 'mt-subheading'
      });

      const toolbarActions = toolbar.createDiv({ cls: 'mt-toolbar-actions' });
      const addButton = toolbarActions.createEl('button', {
        text: '+ 记录一部',
        cls: 'mt-btn-primary'
      });
      addButton.onclick = () => new AddMediaModal(this.app, this, file.path).open();

      const exportButton = toolbarActions.createEl('button', {
        text: '导出',
        cls: 'mt-btn-secondary'
      });
      exportButton.title = '将剧名、分类和评分导出到桌面';
      exportButton.onclick = () => { void this.exportForAI(file.path); };

      const board = el.createDiv({ cls: 'mt-board' });

      for (const category of CATEGORIES) {
        const column = board.createDiv({ cls: `mt-column ${category.cls}` });
        const columnHeader = column.createDiv({ cls: 'mt-column-header' });
        const columnTitle = columnHeader.createDiv({ cls: 'mt-column-title' });
        columnTitle.createSpan({ text: category.icon, cls: 'mt-column-icon' });
        columnTitle.createEl('h3', { text: category.name });
        columnHeader.createSpan({
          text: String(items.filter(item => item.category === category.name).length),
          cls: 'mt-column-count'
        });

        const list = column.createDiv({ cls: 'mt-column-list' });
        const categoryItems = items.filter(item => item.category === category.name);

        if (categoryItems.length === 0) {
          list.createDiv({
            cls: 'mt-empty-column',
            text: '还没有记录'
          });
          continue;
        }

        const visibleCount = visibleCounts.get(category.name) ?? pageSize;
        const visibleItems = categoryItems.slice(0, visibleCount);

        for (const item of visibleItems) {
          const card = list.createDiv({ cls: 'mt-card' });
          const cardHeader = card.createDiv({ cls: 'mt-card-header' });
          cardHeader.createEl('h4', { text: item.title, cls: 'mt-card-title' });

          const ratingRow = card.createDiv({ cls: 'mt-rating-row' });
          ratingRow.createSpan({ text: '评分', cls: 'mt-rating-label' });
          const stars = ratingRow.createDiv({ cls: 'mt-stars-group' });

          for (let star = 1; star <= 5; star++) {
            const starEl = stars.createSpan({
              text: '★',
              cls: `mt-star ${star <= item.rating ? 'active' : ''}`
            });
            starEl.title = `点击评为 ${star} 颗星`;
            starEl.setAttribute('aria-label', `点击评为 ${star} 颗星`);
            starEl.onclick = async (event) => {
              event.stopPropagation();
              await this.updateRating(file.path, item.id, star);
            };
          }

          const reviewText = item.review.trim();
          if (reviewText) {
            const review = card.createDiv({ cls: 'mt-review-box' });
            if (reviewText.length > REVIEW_COLLAPSE_LENGTH) {
              const openDetail = () => {
                new MediaDetailModal(this.app, this, file.path, item).open();
              };
              review.addClass('mt-review-clickable');
              review.setAttribute('role', 'button');
              review.setAttribute('tabindex', '0');
              review.title = '点击查看完整观感';
              review.onclick = () => openDetail();
              review.onkeydown = (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  openDetail();
                }
              };

              const preview = review.createEl('p', {
                text: `${reviewText.slice(0, 78)}${reviewText.length > 78 ? '…' : ''}`,
                cls: 'mt-review-preview'
              });
              preview.title = '点击查看完整观感';
            } else {
              review.createEl('p', { text: reviewText });
            }
          }

          const footer = card.createDiv({ cls: 'mt-card-footer' });
          footer.createSpan({ text: item.watchedAt, cls: 'mt-card-date' });
          const actions = footer.createDiv({ cls: 'mt-card-actions' });
          const editButton = actions.createEl('button', {
            text: reviewText ? '编辑观感' : '添加观感',
            cls: 'mt-btn-secondary'
          });
          editButton.onclick = (event) => {
            event.stopPropagation();
            new EditReviewModal(this.app, this, file.path, item).open();
          };
          const deleteButton = footer.createEl('button', {
            text: '删除',
            cls: 'mt-btn-danger'
          });
          deleteButton.onclick = async (event) => {
            event.stopPropagation();
            if (!confirm(`确定删除《${item.title}》吗？`)) return;
            await this.deleteItem(file.path, item.id);
          };
        }

        if (categoryItems.length > visibleCount) {
          const loadMoreButton = list.createEl('button', {
            text: `加载更多（剩余 ${categoryItems.length - visibleCount} 部）`,
            cls: 'mt-load-more'
          });
          loadMoreButton.onclick = () => {
            visibleCounts.set(category.name, visibleCount + pageSize);
            void render();
          };
        }
      }
    };

    this.viewRefreshers.set(el, { path: file.path, refresh: render });
    await render();
  }
}

class AddMediaModal extends Modal {
  title = '';
  category: MediaCategory = '电影';
  rating = 5;
  review = '';

  constructor(
    app: App,
    private readonly plugin: MediaTrackerPlugin,
    private readonly targetPath: string
  ) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    this.modalEl.addClass('mt-media-modal');
    contentEl.empty();
    contentEl.addClass('mt-modal');
    contentEl.createEl('h2', { text: '添加观影记录', cls: 'mt-modal-title' });

    new Setting(contentEl)
      .setName('剧名 / 作品名')
      .setDesc('输入电影、电视剧或动漫名称')
      .addText(text => text
        .setPlaceholder('例如：星际穿越')
        .onChange(value => { this.title = value.trim(); })
      );

    const categorySetting = new Setting(contentEl)
      .setName('作品分类')
      .setDesc('选择一个类别');
    const categoryOptions = categorySetting.controlEl.createDiv({ cls: 'mt-category-options' });
    const categoryGroupName = `media-category-${Date.now()}`;
    for (const category of CATEGORIES) {
      const option = categoryOptions.createEl('label', { cls: 'mt-category-option' });
      const radio = option.createEl('input', {
        type: 'radio',
        attr: { name: categoryGroupName, value: category.name }
      });
      radio.checked = this.category === category.name;
      radio.addEventListener('change', () => {
        if (radio.checked) this.category = category.name;
      });
      option.createSpan({ text: category.name });
    }

    const ratingSetting = new Setting(contentEl)
      .setName('你的评分')
      .setDesc('点击星星选择 1 至 5 星');
    const starContainer = ratingSetting.controlEl.createDiv({ cls: 'mt-modal-stars' });

    const renderStars = () => {
      starContainer.empty();
      for (let star = 1; star <= 5; star++) {
        const starEl = starContainer.createSpan({
          text: '★',
          cls: `mt-star ${star <= this.rating ? 'active' : ''}`
        });
        starEl.title = `选择 ${star} 星`;
        starEl.onclick = () => {
          this.rating = star;
          renderStars();
        };
      }
      starContainer.createSpan({ text: `${this.rating} 星`, cls: 'mt-modal-stars-text' });
    };
    renderStars();

    new Setting(contentEl)
      .setName('观感')
      .setDesc('写下你的观感、触动你的台词或剧情短评')
      .addTextArea(area => area
        .setPlaceholder('这部作品给你的观感是……')
        .onChange(value => { this.review = value; })
      );

    const actions = contentEl.createDiv({ cls: 'mt-modal-actions' });
    const saveButton = actions.createEl('button', {
      text: '保存记录',
      cls: 'mod-cta'
    });
    saveButton.onclick = async () => {
      if (!this.title) {
        new Notice('请输入剧名。');
        return;
      }

      await this.plugin.addItem(this.targetPath, {
        id: `media_${Date.now()}`,
        title: this.title,
        category: this.category,
        rating: this.rating,
        review: this.review.trim(),
        watchedAt: todayString(),
        year: '',
        genres: [],
        native: ''
      });

      new Notice(`已保存《${this.title}》，记录位于 ${this.targetPath}。`);
      this.close();
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}

class MediaDetailModal extends Modal {
  private readonly handleBackdropClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    if (target === this.containerEl || target?.classList?.contains('modal-bg')) {
      this.close();
    }
  };

  constructor(
    app: App,
    private readonly plugin: MediaTrackerPlugin,
    private readonly targetPath: string,
    private readonly item: MediaReview
  ) {
    super(app);
  }

  onOpen() {
    this.modalEl.addClass('mt-detail-modal');
    this.containerEl.addEventListener('click', this.handleBackdropClick);

    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('mt-detail-content');

    const header = contentEl.createDiv({ cls: 'mt-detail-header' });
    const heading = header.createDiv({ cls: 'mt-detail-heading' });
    heading.createEl('h2', { text: this.item.title, cls: 'mt-detail-title' });
    heading.createSpan({ text: this.item.category, cls: 'mt-detail-category' });

    const closeButton = header.createEl('button', {
      text: '×',
      cls: 'mt-detail-close'
    });
    closeButton.setAttribute('aria-label', '关闭详情');
    closeButton.title = '关闭';
    closeButton.onclick = () => this.close();

    const meta = contentEl.createDiv({ cls: 'mt-detail-meta' });
    meta.createSpan({ text: '评分', cls: 'mt-rating-label' });
    const stars = meta.createDiv({ cls: 'mt-detail-stars' });
    for (let star = 1; star <= 5; star++) {
      stars.createSpan({
        text: '★',
        cls: `mt-detail-star ${star <= this.item.rating ? 'active' : ''}`
      });
    }
    meta.createSpan({ text: `${this.item.rating}/5`, cls: 'mt-detail-rating-value' });
    meta.createSpan({ text: `观看日期：${this.item.watchedAt}`, cls: 'mt-detail-date' });

    const review = contentEl.createDiv({ cls: 'mt-detail-review' });
    review.createEl('h3', { text: '观感' });
    review.createEl('p', {
      text: this.item.review.trim() || '暂未填写观感。'
    });

    const footer = contentEl.createDiv({ cls: 'mt-detail-footer' });
    const editButton = footer.createEl('button', {
      text: '编辑观感',
      cls: 'mt-btn-secondary'
    });
    editButton.onclick = () => {
      this.close();
      new EditReviewModal(this.app, this.plugin, this.targetPath, this.item).open();
    };
  }

  onClose() {
    this.containerEl.removeEventListener('click', this.handleBackdropClick);
    this.contentEl.empty();
  }
}

class EditReviewModal extends Modal {
  review: string;

  constructor(
    app: App,
    private readonly plugin: MediaTrackerPlugin,
    private readonly targetPath: string,
    private readonly item: MediaReview
  ) {
    super(app);
    this.review = item.review;
  }

  onOpen() {
    const { contentEl } = this;
    this.modalEl.addClass('mt-media-modal');
    contentEl.empty();
    contentEl.addClass('mt-modal');
    contentEl.createEl('h2', {
      text: this.item.review.trim() ? `编辑《${this.item.title}》的观感` : `为《${this.item.title}》添加观感`,
      cls: 'mt-modal-title'
    });

    new Setting(contentEl)
      .setName('观感')
      .setDesc('内容会保存回当前观影记录 Markdown 文件')
      .addTextArea(area => area
        .setValue(this.review)
        .setPlaceholder('写下你的感受、触动你的台词或剧情短评')
        .onChange(value => { this.review = value; })
      );

    const actions = contentEl.createDiv({ cls: 'mt-modal-actions' });
    const saveButton = actions.createEl('button', {
      text: '保存观感',
      cls: 'mod-cta'
    });
    saveButton.onclick = async () => {
      await this.plugin.updateReview(this.targetPath, this.item.id, this.review.trim());
      new Notice(`已更新《${this.item.title}》的观感。`);
      this.close();
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}

class MediaTrackerSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: MediaTrackerPlugin) {
    super(app, plugin);
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: '观影手账设置' });

    new Setting(containerEl)
      .setName('观影记录文件')
      .setDesc('记录会写入这个 Markdown 文件，而不是插件目录。支持填写文件夹路径。')
      .addText(text => text
        .setPlaceholder('观影记录.md')
        .setValue(this.plugin.settings.recordPath)
        .onChange(async value => {
          this.plugin.settings.recordPath = value.trim() || DEFAULT_SETTINGS.recordPath;
          await this.plugin.saveSettings();
        })
      )
      .addButton(button => button
        .setButtonText('打开 / 创建')
        .onClick(() => { void this.plugin.openRecordFile(); })
      );
  }
}
