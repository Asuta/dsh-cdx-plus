# Changelog

## 0.1.1

- Adapt native review activation to DSH 0.2.2-rc.2: pass parent, prompt, working directory and model options at the top level.
- Limit the host requirement to the verified rc.2 runtime.

## Unreleased

- Open scope selection directly from an empty /review command; send only after selection, and send nothing on cancellation. Resolve branch/commit choices using the current working directory.
- Present /review requests as ordinary editable user messages in the current conversation.

## 0.1.0

- Rebuilt code review as an independent Codex-style DSH plugin.
- Review in the current conversation with an isolated native spawn agent.
- Preserve the Codex verdict, confidence scores, finding locations, and text fallback.
