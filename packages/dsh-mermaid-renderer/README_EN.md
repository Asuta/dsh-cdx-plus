# Mermaid Diagram Renderer

Render Mermaid code blocks in DSH assistant replies as diagrams, including blocks whose source starts with a Mermaid declaration or YAML frontmatter. Use “View source” to switch back to the original code. If rendering fails, the source remains visible.

The Mermaid engine is bundled with the plugin, so rendering works offline without a CDN or remote service. The plugin only processes assistant replies, not user messages. It supports diagram syntax provided by Mermaid 12.

## Install

Install from a local checkout:

    dsh plugin --profile web add <plugin-directory>

Example:

~~~mermaid
flowchart TD
  A[Start] --> B{Done?}
  B -- Yes --> C[Finish]
  B -- No --> A
~~~

## Development

    pnpm install
    pnpm build
    pnpm test

lib/client.js includes the browser-side Mermaid runtime. Run pnpm build after changing a dependency or anything under src/. Runtime rendering uses Mermaid strict security mode and does not load remote scripts.
