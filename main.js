var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => MediaTrackerPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  recordPath: "\u89C2\u5F71\u8BB0\u5F55.md"
};
var FRONTMATTER_KEY = "media-tracker-items";
var STORAGE_SECTION_PATTERN = /<!-- media-tracker-items:section-start -->\r?\n[\s\S]*?\r?\n<!-- media-tracker-items:section-end -->/;
var DATA_BLOCK_PATTERN = /<!-- media-tracker-items:start -->\r?\n```media-tracker-data\r?\n([\s\S]*?)\r?\n```\r?\n<!-- media-tracker-items:end -->/;
var REVIEW_COLLAPSE_LENGTH = 140;
var CATEGORIES = [
  { name: "\u7535\u5F71", icon: "\u{1F39E}\uFE0F", cls: "mt-column-movie" },
  { name: "\u7535\u89C6\u5267", icon: "\u{1F4FA}", cls: "mt-column-tv" },
  { name: "\u52A8\u6F2B", icon: "\u{1FA84}", cls: "mt-column-anime" }
];
function isCategory(value) {
  return value === "\u7535\u5F71" || value === "\u7535\u89C6\u5267" || value === "\u52A8\u6F2B";
}
function todayString() {
  const now = /* @__PURE__ */ new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function normalizeItem(raw, index = 0) {
  if (!raw || typeof raw !== "object") return null;
  const value = raw;
  const title = String(value.title ?? "").trim();
  const category = isCategory(value.category) ? value.category : null;
  const ratingNumber = Number(value.rating);
  if (!title || !category || !Number.isFinite(ratingNumber)) return null;
  return {
    id: String(value.id ?? `media_${Date.now()}_${index}`),
    title,
    category,
    rating: Math.min(5, Math.max(0, Math.round(ratingNumber))),
    review: String(value.review ?? ""),
    watchedAt: String(value.watchedAt ?? value.createdAt ?? todayString()),
    year: String(value.year ?? ""),
    genres: Array.isArray(value.genres) ? value.genres.map(String) : [],
    native: String(value.native ?? "")
  };
}
function getStorageSection(items) {
  const payload = JSON.stringify({ items }, null, 2);
  return [
    "<!-- media-tracker-items:section-start -->",
    "> [!warning] \u89C2\u5F71\u8BB0\u5F55\u63D2\u4EF6\u6570\u636E\u533A",
    "> `media-tracker-items` \u4F4D\u4E8E\u672C\u533A\u57DF\u5E95\u90E8\uFF0C\u7531\u63D2\u4EF6\u81EA\u52A8\u7EF4\u62A4\u3002",
    "> \u8BF7\u52FF\u5220\u9664\u6216\u4FEE\u6539\uFF0C\u5426\u5219\u8BB0\u5F55\u3001\u8BC4\u5206\u548C\u89C2\u611F\u5C06\u65E0\u6CD5\u8BFB\u53D6\u3002",
    "",
    "<!-- media-tracker-items:start -->",
    "```media-tracker-data",
    payload,
    "```",
    "<!-- media-tracker-items:end -->",
    "<!-- media-tracker-items:section-end -->"
  ].join("\n");
}
var MediaTrackerPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    __publicField(this, "settings", DEFAULT_SETTINGS);
    __publicField(this, "legacyItems", []);
    __publicField(this, "viewRefreshers", /* @__PURE__ */ new Map());
  }
  async onload() {
    const loaded = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded?.settings ?? {});
    this.legacyItems = (loaded?.items ?? []).map((item, index) => normalizeItem(item, index)).filter((item) => item !== null && !item.id.startsWith("demo_"));
    this.registerMarkdownCodeBlockProcessor("media-tracker", (_source, el, ctx) => {
      return this.renderTrackerView(el, ctx);
    });
    this.registerMarkdownCodeBlockProcessor("media-tracker-data", (_source, el) => {
      el.empty();
      el.addClass("mt-data-storage");
    });
    this.addRibbonIcon("clapperboard", "\u6253\u5F00\u89C2\u5F71\u8BB0\u5F55", () => {
      void this.openRecordFile();
    });
    this.addCommand({
      id: "open-media-tracker",
      name: "\u6253\u5F00\u89C2\u5F71\u8BB0\u5F55\u6587\u4EF6",
      callback: () => {
        void this.openRecordFile();
      }
    });
    this.addCommand({
      id: "add-media-review",
      name: "\u65B0\u5EFA\u89C2\u5F71\u8BB0\u5F55",
      callback: () => {
        void this.openAddModal();
      }
    });
    this.addCommand({
      id: "export-ai-recommendation-material",
      name: "\u5BFC\u51FA",
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
  getConfiguredPath() {
    let path = (0, import_obsidian.normalizePath)(this.settings.recordPath.trim() || DEFAULT_SETTINGS.recordPath);
    if (!path.toLowerCase().endsWith(".md")) path += ".md";
    return path;
  }
  async ensureParentFolders(path) {
    const parts = path.split("/");
    let current = "";
    for (const part of parts.slice(0, -1)) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
  }
  getStarterContent() {
    return [
      "# \u6211\u7684\u89C2\u5F71\u8BB0\u5F55",
      "",
      "```media-tracker",
      "```",
      "",
      getStorageSection([]),
      ""
    ].join("\n");
  }
  async ensureRecordFile(path = this.getConfiguredPath()) {
    const normalizedPath = (0, import_obsidian.normalizePath)(path);
    const existing = this.app.vault.getAbstractFileByPath(normalizedPath);
    if (existing instanceof import_obsidian.TFile) return existing;
    if (existing) throw new Error(`\u8BB0\u5F55\u8DEF\u5F84\u4E0D\u662F\u6587\u4EF6\uFF1A${normalizedPath}`);
    await this.ensureParentFolders(normalizedPath);
    return this.app.vault.create(normalizedPath, this.getStarterContent());
  }
  async openRecordFile() {
    try {
      const file = await this.ensureRecordFile();
      await this.app.workspace.getLeaf(false).openFile(file);
    } catch (error) {
      new import_obsidian.Notice(`\u65E0\u6CD5\u6253\u5F00\u89C2\u5F71\u8BB0\u5F55\u6587\u4EF6\uFF1A${String(error)}`);
    }
  }
  async openAddModal() {
    try {
      const file = await this.ensureRecordFile();
      await this.app.workspace.getLeaf(false).openFile(file);
      new AddMediaModal(this.app, this, file.path).open();
    } catch (error) {
      new import_obsidian.Notice(`\u65E0\u6CD5\u6253\u5F00\u89C2\u5F71\u8BB0\u5F55\u6587\u4EF6\uFF1A${String(error)}`);
    }
  }
  async readItems(file) {
    const content = await this.app.vault.read(file);
    const dataMatch = content.match(DATA_BLOCK_PATTERN);
    if (dataMatch) {
      try {
        const parsed = JSON.parse(dataMatch[1]);
        return (parsed.items ?? []).map((item, index) => normalizeItem(item, index)).filter((item) => item !== null);
      } catch (error) {
        new import_obsidian.Notice(`\u89C2\u5F71\u8BB0\u5F55\u6570\u636E\u533A\u89E3\u6790\u5931\u8D25\uFF1A${String(error)}`);
        return [];
      }
    }
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    let frontmatter = {};
    if (match) {
      try {
        frontmatter = (0, import_obsidian.parseYaml)(match[1]) ?? {};
      } catch (error) {
        new import_obsidian.Notice(`\u89C2\u5F71\u8BB0\u5F55\u5C5E\u6027\u89E3\u6790\u5931\u8D25\uFF1A${String(error)}`);
      }
    }
    const rawItems = frontmatter[FRONTMATTER_KEY];
    const items = Array.isArray(rawItems) ? rawItems.map((item, index) => normalizeItem(item, index)).filter((item) => item !== null) : [];
    if (rawItems !== void 0 || this.legacyItems.length > 0) {
      const existingIds = new Set(items.map((item) => item.id));
      const migrated = [
        ...items,
        ...this.legacyItems.filter((item) => !existingIds.has(item.id))
      ];
      await this.writeItems(file, migrated);
      this.legacyItems = [];
      return migrated;
    }
    return items;
  }
  hasLegacyFrontmatter(content) {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!match) return false;
    try {
      const frontmatter = (0, import_obsidian.parseYaml)(match[1]) ?? {};
      return Object.prototype.hasOwnProperty.call(frontmatter, FRONTMATTER_KEY);
    } catch {
      return false;
    }
  }
  async writeItems(file, items) {
    let content = await this.app.vault.read(file);
    if (this.hasLegacyFrontmatter(content)) {
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        delete frontmatter[FRONTMATTER_KEY];
      });
      content = await this.app.vault.read(file);
    }
    const section = getStorageSection(items);
    const nextContent = STORAGE_SECTION_PATTERN.test(content) ? content.replace(STORAGE_SECTION_PATTERN, () => section) : `${content.replace(/\s+$/, "")}

${section}
`;
    if (nextContent !== content) {
      await this.app.vault.modify(file, nextContent);
    }
    this.refreshTrackerViews(file.path);
  }
  refreshTrackerViews(path) {
    for (const [el, view] of this.viewRefreshers) {
      if (!el.isConnected) {
        this.viewRefreshers.delete(el);
        continue;
      }
      if (view.path === path) void view.refresh();
    }
  }
  async addItem(path, item) {
    const file = await this.ensureRecordFile(path);
    const items = await this.readItems(file);
    await this.writeItems(file, [item, ...items]);
  }
  async updateRating(path, id, rating) {
    const file = await this.ensureRecordFile(path);
    const items = await this.readItems(file);
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    item.rating = rating;
    await this.writeItems(file, items);
  }
  async updateReview(path, id, review) {
    const file = await this.ensureRecordFile(path);
    const items = await this.readItems(file);
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    item.review = review;
    await this.writeItems(file, items);
  }
  async exportForAI(sourcePath) {
    try {
      const file = await this.ensureRecordFile(sourcePath);
      const items = await this.readItems(file);
      const nodeRequire = typeof require === "function" ? require : globalThis.require;
      if (!nodeRequire) throw new Error("\u5F53\u524D Obsidian \u73AF\u5883\u4E0D\u5141\u8BB8\u8BBF\u95EE\u684C\u9762\u6587\u4EF6\u7CFB\u7EDF\u3002");
      const fs = nodeRequire("fs");
      const desktopPath = this.getDesktopExportPath();
      const markdown = [
        "# \u89C2\u5F71\u8BB0\u5F55\u5BFC\u51FA",
        "",
        "| \u5267\u540D | \u5206\u7C7B | \u8BC4\u5206 |",
        "| --- | --- | --- |"
      ];
      for (const item of items) {
        const title = item.title.replace(/[|\r\n]+/g, " ");
        const rating = item.rating > 0 ? `${item.rating}/5` : "\u672A\u8BC4\u5206";
        markdown.push(`| ${title} | ${item.category} | ${rating} |`);
      }
      fs.writeFileSync(desktopPath, `${markdown.join("\n")}
`, "utf8");
      new import_obsidian.Notice(`\u5DF2\u5BFC\u51FA ${items.length} \u6761\u8BB0\u5F55\u5230\u684C\u9762\uFF1A\u89C2\u5F71\u8BB0\u5F55\u5BFC\u51FA.md`);
    } catch (error) {
      new import_obsidian.Notice(`\u5BFC\u51FA\u5931\u8D25\uFF1A${String(error)}`);
    }
  }
  async deleteItem(path, id) {
    const file = await this.ensureRecordFile(path);
    const items = await this.readItems(file);
    await this.writeItems(file, items.filter((item) => item.id !== id));
  }
  getDesktopExportPath() {
    const nodeRequire = typeof require === "function" ? require : globalThis.require;
    if (!nodeRequire) throw new Error("\u5F53\u524D Obsidian \u73AF\u5883\u4E0D\u5141\u8BB8\u8BBF\u95EE\u684C\u9762\u6587\u4EF6\u7CFB\u7EDF\u3002");
    const os = nodeRequire("os");
    const path = nodeRequire("path");
    const fs = nodeRequire("fs");
    const childProcess = nodeRequire("child_process");
    const processInfo = nodeRequire("process");
    const home = processInfo.env?.USERPROFILE || os.homedir();
    const candidates = [];
    try {
      const registryOutput = childProcess.execFileSync(
        "reg",
        [
          "query",
          "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders",
          "/v",
          "Desktop"
        ],
        { encoding: "utf8" }
      );
      const match = registryOutput.match(/Desktop\s+REG_\w+\s+(.+)/i);
      if (match?.[1]) {
        const registryPath = match[1].trim().replace(/%([^%]+)%/g, (_, key) => processInfo.env?.[key] ?? "");
        candidates.push(registryPath);
      }
    } catch {
    }
    candidates.push(path.join(home, "Desktop"), path.join(home, "OneDrive", "Desktop"));
    const desktop = candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
    return path.join(desktop, "\u89C2\u5F71\u8BB0\u5F55\u5BFC\u51FA.md");
  }
  async renderTrackerView(el, ctx) {
    const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(file instanceof import_obsidian.TFile)) {
      el.setText("\u65E0\u6CD5\u627E\u5230\u89C2\u5F71\u8BB0\u5F55\u6587\u4EF6\u3002");
      return;
    }
    const pageSize = 12;
    const visibleCounts = /* @__PURE__ */ new Map();
    const render = async () => {
      const items = await this.readItems(file);
      if (!el.isConnected) return;
      el.empty();
      el.addClass("mt-container");
      const toolbar = el.createDiv({ cls: "mt-toolbar" });
      const heading = toolbar.createDiv({ cls: "mt-heading-group" });
      heading.createEl("h2", { text: "\u{1F3AC} \u6211\u7684\u89C2\u5F71\u8BB0\u5F55", cls: "mt-heading" });
      heading.createEl("span", {
        text: `${items.length} \u90E8\u4F5C\u54C1 \xB7 \u4FDD\u5B58\u4E8E ${file.path}`,
        cls: "mt-subheading"
      });
      const toolbarActions = toolbar.createDiv({ cls: "mt-toolbar-actions" });
      const addButton = toolbarActions.createEl("button", {
        text: "+ \u8BB0\u5F55\u4E00\u90E8",
        cls: "mt-btn-primary"
      });
      addButton.onclick = () => new AddMediaModal(this.app, this, file.path).open();
      const exportButton = toolbarActions.createEl("button", {
        text: "\u5BFC\u51FA",
        cls: "mt-btn-secondary"
      });
      exportButton.title = "\u5C06\u5267\u540D\u3001\u5206\u7C7B\u548C\u8BC4\u5206\u5BFC\u51FA\u5230\u684C\u9762";
      exportButton.onclick = () => {
        void this.exportForAI(file.path);
      };
      const board = el.createDiv({ cls: "mt-board" });
      for (const category of CATEGORIES) {
        const column = board.createDiv({ cls: `mt-column ${category.cls}` });
        const columnHeader = column.createDiv({ cls: "mt-column-header" });
        const columnTitle = columnHeader.createDiv({ cls: "mt-column-title" });
        columnTitle.createSpan({ text: category.icon, cls: "mt-column-icon" });
        columnTitle.createEl("h3", { text: category.name });
        columnHeader.createSpan({
          text: String(items.filter((item) => item.category === category.name).length),
          cls: "mt-column-count"
        });
        const list = column.createDiv({ cls: "mt-column-list" });
        const categoryItems = items.filter((item) => item.category === category.name);
        if (categoryItems.length === 0) {
          list.createDiv({
            cls: "mt-empty-column",
            text: "\u8FD8\u6CA1\u6709\u8BB0\u5F55"
          });
          continue;
        }
        const visibleCount = visibleCounts.get(category.name) ?? pageSize;
        const visibleItems = categoryItems.slice(0, visibleCount);
        for (const item of visibleItems) {
          const card = list.createDiv({ cls: "mt-card" });
          const cardHeader = card.createDiv({ cls: "mt-card-header" });
          cardHeader.createEl("h4", { text: item.title, cls: "mt-card-title" });
          const ratingRow = card.createDiv({ cls: "mt-rating-row" });
          ratingRow.createSpan({ text: "\u8BC4\u5206", cls: "mt-rating-label" });
          const stars = ratingRow.createDiv({ cls: "mt-stars-group" });
          for (let star = 1; star <= 5; star++) {
            const starEl = stars.createSpan({
              text: "\u2605",
              cls: `mt-star ${star <= item.rating ? "active" : ""}`
            });
            starEl.title = `\u70B9\u51FB\u8BC4\u4E3A ${star} \u9897\u661F`;
            starEl.setAttribute("aria-label", `\u70B9\u51FB\u8BC4\u4E3A ${star} \u9897\u661F`);
            starEl.onclick = async (event) => {
              event.stopPropagation();
              await this.updateRating(file.path, item.id, star);
            };
          }
          const reviewText = item.review.trim();
          if (reviewText) {
            const review = card.createDiv({ cls: "mt-review-box" });
            if (reviewText.length > REVIEW_COLLAPSE_LENGTH) {
              const openDetail = () => {
                new MediaDetailModal(this.app, this, file.path, item).open();
              };
              review.addClass("mt-review-clickable");
              review.setAttribute("role", "button");
              review.setAttribute("tabindex", "0");
              review.title = "\u70B9\u51FB\u67E5\u770B\u5B8C\u6574\u89C2\u611F";
              review.onclick = () => openDetail();
              review.onkeydown = (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openDetail();
                }
              };
              const preview = review.createEl("p", {
                text: `${reviewText.slice(0, 78)}${reviewText.length > 78 ? "\u2026" : ""}`,
                cls: "mt-review-preview"
              });
              preview.title = "\u70B9\u51FB\u67E5\u770B\u5B8C\u6574\u89C2\u611F";
            } else {
              review.createEl("p", { text: reviewText });
            }
          }
          const footer = card.createDiv({ cls: "mt-card-footer" });
          footer.createSpan({ text: item.watchedAt, cls: "mt-card-date" });
          const actions = footer.createDiv({ cls: "mt-card-actions" });
          const editButton = actions.createEl("button", {
            text: reviewText ? "\u7F16\u8F91\u89C2\u611F" : "\u6DFB\u52A0\u89C2\u611F",
            cls: "mt-btn-secondary"
          });
          editButton.onclick = (event) => {
            event.stopPropagation();
            new EditReviewModal(this.app, this, file.path, item).open();
          };
          const deleteButton = footer.createEl("button", {
            text: "\u5220\u9664",
            cls: "mt-btn-danger"
          });
          deleteButton.onclick = async (event) => {
            event.stopPropagation();
            if (!confirm(`\u786E\u5B9A\u5220\u9664\u300A${item.title}\u300B\u5417\uFF1F`)) return;
            await this.deleteItem(file.path, item.id);
          };
        }
        if (categoryItems.length > visibleCount) {
          const loadMoreButton = list.createEl("button", {
            text: `\u52A0\u8F7D\u66F4\u591A\uFF08\u5269\u4F59 ${categoryItems.length - visibleCount} \u90E8\uFF09`,
            cls: "mt-load-more"
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
};
var AddMediaModal = class extends import_obsidian.Modal {
  constructor(app, plugin, targetPath) {
    super(app);
    this.plugin = plugin;
    this.targetPath = targetPath;
    __publicField(this, "title", "");
    __publicField(this, "category", "\u7535\u5F71");
    __publicField(this, "rating", 5);
    __publicField(this, "review", "");
  }
  onOpen() {
    const { contentEl } = this;
    this.modalEl.addClass("mt-media-modal");
    contentEl.empty();
    contentEl.addClass("mt-modal");
    contentEl.createEl("h2", { text: "\u6DFB\u52A0\u89C2\u5F71\u8BB0\u5F55", cls: "mt-modal-title" });
    new import_obsidian.Setting(contentEl).setName("\u5267\u540D / \u4F5C\u54C1\u540D").setDesc("\u8F93\u5165\u7535\u5F71\u3001\u7535\u89C6\u5267\u6216\u52A8\u6F2B\u540D\u79F0").addText(
      (text) => text.setPlaceholder("\u4F8B\u5982\uFF1A\u661F\u9645\u7A7F\u8D8A").onChange((value) => {
        this.title = value.trim();
      })
    );
    const categorySetting = new import_obsidian.Setting(contentEl).setName("\u4F5C\u54C1\u5206\u7C7B").setDesc("\u9009\u62E9\u4E00\u4E2A\u7C7B\u522B");
    const categoryOptions = categorySetting.controlEl.createDiv({ cls: "mt-category-options" });
    const categoryGroupName = `media-category-${Date.now()}`;
    for (const category of CATEGORIES) {
      const option = categoryOptions.createEl("label", { cls: "mt-category-option" });
      const radio = option.createEl("input", {
        type: "radio",
        attr: { name: categoryGroupName, value: category.name }
      });
      radio.checked = this.category === category.name;
      radio.addEventListener("change", () => {
        if (radio.checked) this.category = category.name;
      });
      option.createSpan({ text: category.name });
    }
    const ratingSetting = new import_obsidian.Setting(contentEl).setName("\u4F60\u7684\u8BC4\u5206").setDesc("\u70B9\u51FB\u661F\u661F\u9009\u62E9 1 \u81F3 5 \u661F");
    const starContainer = ratingSetting.controlEl.createDiv({ cls: "mt-modal-stars" });
    const renderStars = () => {
      starContainer.empty();
      for (let star = 1; star <= 5; star++) {
        const starEl = starContainer.createSpan({
          text: "\u2605",
          cls: `mt-star ${star <= this.rating ? "active" : ""}`
        });
        starEl.title = `\u9009\u62E9 ${star} \u661F`;
        starEl.onclick = () => {
          this.rating = star;
          renderStars();
        };
      }
      starContainer.createSpan({ text: `${this.rating} \u661F`, cls: "mt-modal-stars-text" });
    };
    renderStars();
    new import_obsidian.Setting(contentEl).setName("\u89C2\u611F").setDesc("\u5199\u4E0B\u4F60\u7684\u89C2\u611F\u3001\u89E6\u52A8\u4F60\u7684\u53F0\u8BCD\u6216\u5267\u60C5\u77ED\u8BC4").addTextArea(
      (area) => area.setPlaceholder("\u8FD9\u90E8\u4F5C\u54C1\u7ED9\u4F60\u7684\u89C2\u611F\u662F\u2026\u2026").onChange((value) => {
        this.review = value;
      })
    );
    const actions = contentEl.createDiv({ cls: "mt-modal-actions" });
    const saveButton = actions.createEl("button", {
      text: "\u4FDD\u5B58\u8BB0\u5F55",
      cls: "mod-cta"
    });
    saveButton.onclick = async () => {
      if (!this.title) {
        new import_obsidian.Notice("\u8BF7\u8F93\u5165\u5267\u540D\u3002");
        return;
      }
      await this.plugin.addItem(this.targetPath, {
        id: `media_${Date.now()}`,
        title: this.title,
        category: this.category,
        rating: this.rating,
        review: this.review.trim(),
        watchedAt: todayString(),
        year: "",
        genres: [],
        native: ""
      });
      new import_obsidian.Notice(`\u5DF2\u4FDD\u5B58\u300A${this.title}\u300B\uFF0C\u8BB0\u5F55\u4F4D\u4E8E ${this.targetPath}\u3002`);
      this.close();
    };
  }
  onClose() {
    this.contentEl.empty();
  }
};
var MediaDetailModal = class extends import_obsidian.Modal {
  constructor(app, plugin, targetPath, item) {
    super(app);
    this.plugin = plugin;
    this.targetPath = targetPath;
    this.item = item;
    __publicField(this, "handleBackdropClick", (event) => {
      const target = event.target;
      if (target === this.containerEl || target?.classList?.contains("modal-bg")) {
        this.close();
      }
    });
  }
  onOpen() {
    this.modalEl.addClass("mt-detail-modal");
    this.containerEl.addEventListener("click", this.handleBackdropClick);
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("mt-detail-content");
    const header = contentEl.createDiv({ cls: "mt-detail-header" });
    const heading = header.createDiv({ cls: "mt-detail-heading" });
    heading.createEl("h2", { text: this.item.title, cls: "mt-detail-title" });
    heading.createSpan({ text: this.item.category, cls: "mt-detail-category" });
    const closeButton = header.createEl("button", {
      text: "\xD7",
      cls: "mt-detail-close"
    });
    closeButton.setAttribute("aria-label", "\u5173\u95ED\u8BE6\u60C5");
    closeButton.title = "\u5173\u95ED";
    closeButton.onclick = () => this.close();
    const meta = contentEl.createDiv({ cls: "mt-detail-meta" });
    meta.createSpan({ text: "\u8BC4\u5206", cls: "mt-rating-label" });
    const stars = meta.createDiv({ cls: "mt-detail-stars" });
    for (let star = 1; star <= 5; star++) {
      stars.createSpan({
        text: "\u2605",
        cls: `mt-detail-star ${star <= this.item.rating ? "active" : ""}`
      });
    }
    meta.createSpan({ text: `${this.item.rating}/5`, cls: "mt-detail-rating-value" });
    meta.createSpan({ text: `\u89C2\u770B\u65E5\u671F\uFF1A${this.item.watchedAt}`, cls: "mt-detail-date" });
    const review = contentEl.createDiv({ cls: "mt-detail-review" });
    review.createEl("h3", { text: "\u89C2\u611F" });
    review.createEl("p", {
      text: this.item.review.trim() || "\u6682\u672A\u586B\u5199\u89C2\u611F\u3002"
    });
    const footer = contentEl.createDiv({ cls: "mt-detail-footer" });
    const editButton = footer.createEl("button", {
      text: "\u7F16\u8F91\u89C2\u611F",
      cls: "mt-btn-secondary"
    });
    editButton.onclick = () => {
      this.close();
      new EditReviewModal(this.app, this.plugin, this.targetPath, this.item).open();
    };
  }
  onClose() {
    this.containerEl.removeEventListener("click", this.handleBackdropClick);
    this.contentEl.empty();
  }
};
var EditReviewModal = class extends import_obsidian.Modal {
  constructor(app, plugin, targetPath, item) {
    super(app);
    this.plugin = plugin;
    this.targetPath = targetPath;
    this.item = item;
    __publicField(this, "review");
    this.review = item.review;
  }
  onOpen() {
    const { contentEl } = this;
    this.modalEl.addClass("mt-media-modal");
    contentEl.empty();
    contentEl.addClass("mt-modal");
    contentEl.createEl("h2", {
      text: this.item.review.trim() ? `\u7F16\u8F91\u300A${this.item.title}\u300B\u7684\u89C2\u611F` : `\u4E3A\u300A${this.item.title}\u300B\u6DFB\u52A0\u89C2\u611F`,
      cls: "mt-modal-title"
    });
    new import_obsidian.Setting(contentEl).setName("\u89C2\u611F").setDesc("\u5185\u5BB9\u4F1A\u4FDD\u5B58\u56DE\u5F53\u524D\u89C2\u5F71\u8BB0\u5F55 Markdown \u6587\u4EF6").addTextArea(
      (area) => area.setValue(this.review).setPlaceholder("\u5199\u4E0B\u4F60\u7684\u611F\u53D7\u3001\u89E6\u52A8\u4F60\u7684\u53F0\u8BCD\u6216\u5267\u60C5\u77ED\u8BC4").onChange((value) => {
        this.review = value;
      })
    );
    const actions = contentEl.createDiv({ cls: "mt-modal-actions" });
    const saveButton = actions.createEl("button", {
      text: "\u4FDD\u5B58\u89C2\u611F",
      cls: "mod-cta"
    });
    saveButton.onclick = async () => {
      await this.plugin.updateReview(this.targetPath, this.item.id, this.review.trim());
      new import_obsidian.Notice(`\u5DF2\u66F4\u65B0\u300A${this.item.title}\u300B\u7684\u89C2\u611F\u3002`);
      this.close();
    };
  }
  onClose() {
    this.contentEl.empty();
  }
};
var MediaTrackerSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "\u89C2\u5F71\u624B\u8D26\u8BBE\u7F6E" });
    new import_obsidian.Setting(containerEl).setName("\u89C2\u5F71\u8BB0\u5F55\u6587\u4EF6").setDesc("\u8BB0\u5F55\u4F1A\u5199\u5165\u8FD9\u4E2A Markdown \u6587\u4EF6\uFF0C\u800C\u4E0D\u662F\u63D2\u4EF6\u76EE\u5F55\u3002\u652F\u6301\u586B\u5199\u6587\u4EF6\u5939\u8DEF\u5F84\u3002").addText(
      (text) => text.setPlaceholder("\u89C2\u5F71\u8BB0\u5F55.md").setValue(this.plugin.settings.recordPath).onChange(async (value) => {
        this.plugin.settings.recordPath = value.trim() || DEFAULT_SETTINGS.recordPath;
        await this.plugin.saveSettings();
      })
    ).addButton(
      (button) => button.setButtonText("\u6253\u5F00 / \u521B\u5EFA").onClick(() => {
        void this.plugin.openRecordFile();
      })
    );
  }
};
