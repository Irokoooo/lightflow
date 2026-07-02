# LightFlow 发布自检报告

## Step 3 自检结论

- 主题支持：已补齐，支持根据飞书宿主主题切换亮色/暗色样式。
- 国际化：已补齐 `jp.json`，当前内容先与 `en.json` 保持一致，正式日语翻译进入 `v0.2`。
- 数据安全说明：已更新为本次发布口径，不改动现有翻译实现。
- 数据监听：需补字段/表/单元格刷新监听；视图监听因 SDK 无直接 `onViewAdd/onViewModify/onViewDelete` 事件，将采用兼容策略兜底。

## 数据安全自检描述

默认走飞书 translation API（瞬时限流 20 QPS / 租户，基础免费版月总量 10,000 次），失败时回退到 MyMemory。MyMemory 走 HTTPS 但数据会离开飞书域，在插件设置里会明示风险并允许用户关闭。

## 当前翻译策略说明

- 第一优先级：飞书 translation API
- 第二优先级：MyMemory fallback
- 传输安全：两条链路均走 HTTPS
- 风险边界：MyMemory 为外部服务，请在插件设置中明确告知并允许关闭

## 本次发布不阻塞项（记入 v0.2 backlog）

1. 批量写入优化
2. AI 翻译字段读
3. chunk 体积优化

## 上线后 7 天监控项

- 飞书 API 失败率（如果 > 5%，触发 MyMemory fallback 改造）
- MyMemory 调用占比（如果 > 30%，考虑接付费翻译）
- 主题切换投诉（DARK 模式适配漏改的话会有人反馈）
- jp locale 切换投诉（日语翻译如果还是 en，用户会吐槽）
