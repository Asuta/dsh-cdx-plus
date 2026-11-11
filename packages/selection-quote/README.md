# 选中引用

在对话里选中文字，先显示「添加到对话」和「在侧边聊天中提问」两个按钮。点击添加后填写评论，确认只加入待发送注释，最后由原生输入框统一发送；可以一次批注多处。

右侧侧栏还有一个「引用清单」页：这个会话发过的每一条引用都在里面，可以搜索、跳回原文那一行、导成 Markdown，也可以重新插回输入框。

- 输入框顶部以「N 条注释」汇总，点击展开原文和评论；支持编辑、删除与清空，原文旁显示对应编号。评论支持 Enter 确认、Shift+Enter 换行、Esc 取消。
- 快捷键：Alt+Q / Alt+C 打开评论框，Alt+B 开侧边对话，Alt+L 打开引用清单（没有选区时按键直接放行）。
- 代码块里的选区按代码引用处理，带语言标记；文件预览里的选区带文件名和行号。
- 主对话和侧边对话共用结构化引用，不把原文铺进输入栏。注释保存在宿主草稿中，刷新后恢复，发送失败由宿主恢复；发送成功后自动清空。
- 发送后将引用折叠成「1 条注释」标记；悬停显示引用原文和评论，点击标记跳回原消息；坐标继续保存在消息中并供引用清单读取。
- 配置存在 `localStorage` 的 `selection-quote:v1:config`：`minChars`（1–50）、`maxQuoteChars`（0–20000）、`replyByDefault`、`attribution`、`highlight`。

## 和旧插件的兼容

引用块、坐标行、`「引用N」` 标记的写法与 `dsh-client-ui-quote`（MIT）完全一致，两边写出的引用可以互读。

## 开发

```sh
node build.mjs                       # src/core.mjs + src/ui.js -> client.js
node --test test/*.test.mjs          # 纯函数往返 + 假宿主冒烟测试
```

`src/core.mjs` 只有纯函数，`src/ui.js` 是浏览器那一半，`client.js` 由 `build.mjs` 生成，不要手改。

## 安装

```sh
dsh plugin --profile desktop add dsh-asuta-selection-quote
```

装上之后重启 DSH 生效。侧边对话按钮依赖 `dsh-asuta-sidebar-chat` 提供的 `window.__dshSidebarChat`，没装它时按钮会提示而不是报错。
