# 踩过的坑

每条都在 SCM620_BCMU_V3300 上实测过，不是推测。

## 1. https + GCM 挂死，标签推不出去

`origin` 是 `https://192.168.1.218/...` 时，非交互环境里 `git ls-remote` / `git push`
卡 25s 以上被杀。`GIT_TRACE=1` 显示停在：

```
run_command: 'git credential-manager get'
```

改为 `ssh://git@192.168.1.218:2222/...` 后 10s 内返回。
**信号**：push 前先跑 `timeout 20 git ls-remote --tags origin`，超时就是这个问题。

## 2. `UV4 -b` 的退出码是 1

正常构建也返回 1。判据只能看日志：
`".\Objects\SCM620_BCMU_V3300.axf" - 0 Error(s), 1 Warning(s)`。
`can1.c:827` 那条 warning 是既有的，不是本次引入。

## 3. 版本号在产物里搜不到

`SOFTVER 0x03030006` 与 `SW_FIRMWARE_NUM 250715001` 是代码立即数，
在 `.bin` / `.hex` 里按大端、小端、字符串搜都是 **-1**：

```
03030006 -> -1    06000303 -> -1    0ef19b79 -> -1
```

所以**不能**从产物反读版本做交叉校验。唯一依据是 `parameters.h` 的两个宏 + 人眼核对。

## 4. GitLab 拒绝非 ASCII 资产 filepath

含中文（`维冠`）的文件名会被 400 `Filepath is in an invalid format`，
同一路径只换文件名（`WeiGuan`）就成功。**标签名可含中文，受限的只有资产 filepath。**

## 5. `Output/` 里并排四套产物

`公版` / `250715000` / `250715001` / `250715001-poweron-insulation-b-5M`。
按**时间戳**取本次那一份，不要按文件名长短挑。

## 6. 未合并分支的产物不能发

`feat/poweron-insulation-b-5M`（`729f299`，2026-07-27）出过产物但没进 main。
`Output/...-poweron-insulation-b-5M.bin` 至今还在，发布只取 main 上 HEAD 构建的那一份。

## 7. 包版本复用会牵连别的发布

包版本 = 标签去前导 V。旧形状 `3.3.0.6_250715001` 在 SOFTVER 不变时必然重名。
这就是标签必须 `V<版本>_<分支>_<固件号>_<日期>_<sha>` 的原因。

## 8. 先传字节再建 Release

`POST /releases` 的 `assets.links` 只是链接，不传字节。反序得到死链。

## 9. 链接用 `/projects/280/...`（数值 id）

父组路径含中文（URL 段是 `25071500`）。用
`projects/embedded%2Fbcmu%2Fcustom%2F25071500%2FSCM620_BCMU_V3300`
很容易编码错一位，错位后 404 且原因不可见。

## 10. 内网自签证书

Node / Python urllib 默认校验报 `DEPTH_ZERO_SELF_SIGNED_CERT`；
`glab` 读系统证书库不受影响。手工调 API 时要显式关校验，并在脚本里写清楚，别静默。

## 11. 控制台编码

`Brun/xujinghan.BAT` 是 **CP936**，文件里 `维冠` 是 GBK 字节。UTF-8 终端 `cat` 会乱码，
但 `cmd` / Keil 执行正常。**不要"修"这个文件的编码**，修了就产出不了中文交付名。

## 12. 别把参考仓的 `.ci` 搬过来

`BC-W/HC32F4A0_Lwip_V5.1.7.12` 的 `.ci/config.json` 里 `mdk.project` 指向
`MDK/HC32F4A0_Lwip_V515.uvprojx`、`build.armcc` 指向 `CMake-ARMCC\build.bat`、
依赖里有 `Brun/update_size.py` —— 本仓库工程文件在根目录、没有 CMake-ARMCC、
没有 update_size.py。照搬一路 red，而且引入 `.ci` 本身就是引入流水线。

## 13. 改标签名要整条链路重走

只改本地 tag 名没用：远端 tag、Release、包版本三者都绑定旧名字。
必须删干净（见 `rollback.md`）再用新名字重发，否则页面读回 `name != tag_name`。
