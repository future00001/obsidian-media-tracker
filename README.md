# Media Tracker（观影手账）

一个面向 Obsidian 的观影记录插件，支持电影、电视剧、动漫三列看板。

## 功能

- 电影、电视剧、动漫三类并列显示。
- 1 至 5 星点击评分，支持未评分记录。
- 观感预览与详情弹窗，支持点击空白处或右上角关闭。
- 观感编辑。
- 记录保存在 Obsidian Markdown 文件，不保存在插件目录。
- 大量记录分批加载，减少看板初次渲染卡顿。
- “导出”按钮将剧名、分类和评分导出到系统桌面：`观影记录导出.md`。

## 安装

1. 执行 `npm install`。
2. 执行 `npm run build`。
3. 将 `main.js`、`manifest.json`、`styles.css` 复制到：

   ```text
   <Vault>/.obsidian/plugins/obsidian-media-tracker/
   ```

4. 在 Obsidian 设置中启用第三方插件。
5. 使用命令面板执行“打开观影记录文件”，或在笔记中使用：

   ````markdown
   ```media-tracker
   ```
   ````

## 数据文件

默认记录文件为 `观影记录.md`。插件会在文件底部维护数据区，并显示不可删除提示。已有记录可以直接通过看板上的按钮评分、编辑观感或删除。

## 开发

```bash
npm install
npm run build
```

插件当前面向 Obsidian 桌面端，因为“导出”功能需要写入系统桌面路径。
