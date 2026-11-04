---
name: release
description: >-
  给 BCMU 固件仓库发一版：编译取产物、打标签推标签、把 bin/hex 传进 GitLab
  通用包仓库、建 Release 并挂上发布说明，最后逐字节读回复核。当要给 SCM620_BCMU_V3300
  或同类 MDK 工程发版、补发说明、核对已发布资产、或问"这个仓库怎么发布"时使用。
  触发词：发版、发布固件、打标签、SCM620 发版、维冠发版、补发布说明、核对发布。
license: UNLICENSED
metadata:
  author: Jinghan Xu
  created: 2026-11-04
  last_reviewed: 2026-11-04
  verified_against: SCM620_BCMU_V3300 V3.3.0.6_main_250715001_20261104_2d4a4c28
---

# release

一条龙发版：**产物 → 标签 → 软件包 → 发布页 → 读回**。任何一步不能自证就停下，不要发。

第一次按本技能跑通的实例是 `embedded/bcmu/custom/25071500/SCM620_BCMU_V3300`
（GitLab 17.5.0-ee，project id **280**），标签
`V3.3.0.6_main_250715001_20261104_2d4a4c28`，12 项读回全 pass。

## 五步

| 步 | 动作 | 判据 |
| --- | --- | --- |
| 1 产物 | `UV4 -b <工程>.uvprojx -j0 -o build-release.log` | 日志 `0 Error(s)`；`Output/` 里本次时间戳的那一份 |
| 2 标签 | 附注标签 + `git push origin <tag>` | 远端 `refs/tags/<tag>^{}` == `git rev-parse HEAD` |
| 3 软件包 | `PUT .../packages/generic/<tag>/<ver>/<文件>` | 每个文件立刻 GET 回来比 sha256 |
| 4 发布页 | `POST .../releases`（description + assets.links 一次带上） | 201，`name == tag_name == tag` |
| 5 读回 | 12 项契约逐项核对 | 全 pass 才算发布完成 |

命令原文与判据见 `references/pipeline.md`；失败怎么撤见 `references/rollback.md`；
踩过的坑见 `references/gotchas.md`；历次发布与基线见 `references/history.md`。

## 硬规则

1. **标签形状**：`V<SOFTVER>_<分支>_<固件号>_<日期>_<短sha>`，例
   `V3.3.0.6_main_250715001_20261104_2d4a4c28`。分支在固件号**之前**。
   不要用 `3.3.0.6_250715001`（只有版本+固件号，同 SOFTVER 第二次发布必然重名）。
2. **包名 = 标签原文；包版本 = 标签去掉前导 V**。tag / `release.name` / `package.name`
   三者逐字一致，少一个字符后面读回就会自相矛盾。
3. **资产文件名必须纯 ASCII**。GitLab 拒绝非 ASCII 的 filepath；中文产品名一律转写
   （`维冠` → `WeiGuan`）。规范中文名留在 `Output/`，上传 ASCII 副本。
4. **资产只发 bin + hex**。`bin` 不含 Bootloader，`hex` 已由 `Brun/xujinghan.BAT`
   用 `srec_cat` 合并 `Brun/SCM620_BCMU_Bootloader_V322.hex`。`s19` 与 bin 同层，不发。
5. **发布说明只写"从上次发布以来的改动"，一个改动一行**，以 `- ` 开头；
   不写标题、不写 commit 列表、不写验证过程、不写日期（页面自己显示）。
6. **先传字节，再建 Release**。`assets.links` 只是链接，反序会得到死链。
7. **失败按 rollback 顺序撤**：Release → 包 → 远端 tag → 本地 tag。反序留孤儿。
8. **产物必须来自被推的那个 commit**。构建后把 `sha256` 与 `git rev-parse HEAD`
   一起记进运行记录，要敢回答"这批字节是从哪个 commit 编的"。

## 版本标识从哪读

`Project/User/parameters.h`：

```
#define SW_FIRMWARE_NUM   250715001     // 固件号
#define SOFTVER           0x03030006    // 0x03.03.00.06 -> 3.3.0.6
```

两者都是**代码立即数**，在 `.bin` / `.hex` 里按大小端搜都是 -1，
**无法从产物反读版本**。发版前必须人眼确认这两个宏与标签文案一致。

SOFTVER 允许一版内不递增，但**发布说明里要提一句**，否则现场读到版本号不变会以为刷错。

## 不要做

- 不要因为别的仓库有 `.ci/` 或 release-it 适配器就搬进来 —— 那是另一套运行时，
  本技能是手工一条龙，不往仓库加脚本与流水线。
- 不要用"再发一版"盖住错误发布（两个 tag 指同一 commit 时现场无法分辨）。
- 不要 `git push --force` 移动已推送的 tag。
