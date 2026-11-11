# Mermaid 图表渲染

在 DSH 助手回复中，把带有 Mermaid 语言标记的代码块或以 Mermaid 图表声明开头的代码块渲染成图表。点击「查看源码」可切回原代码，渲染失败时原代码会保留。

Mermaid 渲染引擎随插件一起打包，不使用 CDN 或在线服务，因此断网时也能渲染。只处理助手回复中的代码块，不处理用户消息。支持 Mermaid 12 提供的图表语法。

## 安装

在本机开发仓库中安装：

    dsh plugin --profile web add <插件目录>

启用后刷新 DSH 网页。示例：

~~~mermaid
flowchart TD
  A[开始] --> B{完成了吗?}
  B -- 是 --> C[结束]
  B -- 否 --> A
~~~

## 开发

    pnpm install
    pnpm build
    pnpm test

lib/client.js 是内嵌 Mermaid 运行时的浏览器产物。更新依赖或 src/ 后运行 pnpm build。运行时使用 Mermaid strict 安全模式，不加载远程脚本。
