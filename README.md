# 小手机 · Tavo Plugin

一个运行在 Tavo 聊天页里的轻量手机空间。它把角色管理、GitHub 内容导入和微信式社交放进一个可拖拽的悬浮手机中。

## 功能

- **角色管理**：按完整对话回合检测剧情中新角色，生成可编辑候选卡，确认后创建 Tavo 角色卡。
- **内容导入**：配置 GitHub 仓库后浏览并手动导入预设、世界书和 CCv2/CCv3/SillyTavern 角色卡。
- **微信**：每个手机身份拥有独立的联系人、会话和朋友圈；支持用户发帖、角色动态、主动消息和角色间聊天。
- **主聊天联动**：只把相关微信摘要注入生成上下文，不把微信全文写入主聊天。

## 安装

1. 运行 `npm ci && npm run build && npm run package`。
2. 在 Tavo 设置 → Plugins 中导入 `dist/shiyu-phone.tpg`。
3. 打开 Advanced Rendering，聊天页右下角会出现可拖拽的小手机入口。

## 开发

```bash
npm ci
npm test
npm run build
npm run package
```

源码按运行时、Tavo 适配、检测、GitHub、微信和 UI 模块拆分；构建脚本会把 UI CSS/JS 内联到 `ui/phone.html`，以符合 Tavo fragment 的资源规则。

Tavo 1.3.3 的插件运行时没有独立聊天创建 API，因此微信和角色间聊天由插件自有全局会话保存，并使用 `tavo.generate({ context: false })` 生成回复；角色卡、Persona 等数据仍使用 Tavo 原生 API。

GitHub token 只保存在 Tavo 全局手机数据中，不会写入仓库、manifest、日志或模型提示。主动聊天和角色间后台聊天默认关闭，可在“我的”中开启。
