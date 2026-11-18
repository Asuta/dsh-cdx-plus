# npm 自动发布

发行工作流为 `.github/workflows/publish.yml`，仅允许在 `Asuta/dsh-cdx-plus` 的 `main` 分支手动启动。普通推送、PR 和 fork 不触发发布。使用 GitHub OIDC 身份，不存储长期 npm token。

## 首次绑定（每个 npm 包一次）

21 个包都需要在 npm 配置 Trusted Publisher：GitHub 仓库 `Asuta/dsh-cdx-plus`，workflow 文件 `publish.yml`，Environment 留空，允许直接 `npm publish`。首次绑定需要维护者安全验证；只允许 stage 的配置仍需逐次人工批准。

也可以使用 npm 11.15.0 的命令（包名替换为对应子包或合集）：

```sh
npm trust github dsh-asuta-cdx-plus --repo Asuta/dsh-cdx-plus --file publish.yml --allow-publish --yes --registry=https://registry.npmjs.org
```

## 每次发布

1. 在开发仓库更新源文件与版本，导出并推送发行仓库。变化的子包及合集升级版本，未变化子包保持原版本。
2. GitHub → Actions → Publish npm packages → Run workflow，选择 main，填合集版本。默认勾选 dry_run，先检查计划。
3. 检查通过后，再运行一次并取消 dry_run。可用 `gh workflow run publish.yml --repo Asuta/dsh-cdx-plus --ref main -f version=<版本> -f dry_run=false`；把 `<版本>` 替换为本次发布版本。
4. 工作流校验并打包，核对全部本地与远端 tarball；已发布且内容相同的版本跳过，仅发布缺失版本。历史包因 Windows/Linux 打包产生的 tar 元数据或文本换行差异，通过逐文件比对处理；文件集合、可执行权限、二进制内容及其他文本改动仍必须一致。新上传的包严格校验 SHA-512。子包依次上传后统一等待 npm 异步处理，最多十分钟；子包可下载、完整性及 latest 正确后才发布合集，再等待并校验合集。任何错误立即停止。

已发布版本内容不同须升级版本；401/403 检查对应包的信任绑定，429 等限流解除再重试。旧流程中仍处于 staged 的版本须先在 npm 批准，不能直接重复发布。成功上传但传播超时的版本先查 registry，工作流重跑会检查并跳过已完成项。

工作流不改版本、不安装或重启本机 DSH，也不自动删除旧凭据。允许直接发布意味着指定工作流具有发布权限；应审查 main 上的发布脚本改动。
