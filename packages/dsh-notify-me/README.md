# DS Notify Me · DSH CDX Plus

在 DSH 需要你操作或后台回复完成时，通过系统通知、标题标记或提示音提醒你。原版的快捷审批、对话静音、宿主兜底、中继、外部推送以及 Windows 和 macOS 通知助手均保留。

在 DSH 的「设置 → 通知提醒」中调整提醒时机、声音和外部推送，也可以在该页面试发本地通知。进阶配置见[中文配置说明](docs/console-config.md)和 [English configuration reference](docs/console-config.en.md)。

作为合集的独立组件安装，也可以单独安装。切换到这个版本前，请先关闭原版，避免重复通知及宿主路由冲突。此前的本机提醒设置仍可读取。

macOS 需要原生助手时，在插件目录执行 `bash macos/build.sh`（需 Xcode Command Line Tools）。分发包包含助手源码和构建脚本。

This independently maintained copy retains the upstream notification behavior: attention and completion alerts, sounds, title marks, session muting, native helpers and optional external delivery. Configure it under **Settings → Notify me**. Disable the original plugin before switching to this copy.

原作者 / Original author: **chromoany** and contributors. Based on `chromoany/dsh-notify-me` 1.21.4. See [NOTICE](NOTICE) and [MIT license](LICENSE).
