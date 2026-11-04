# 发布流水（逐条命令与判据）

以下命令在**仓库根**执行。`$D` 是临时目录，中间文件不入库。

```bash
export GIT_TERMINAL_PROMPT=0
D="$TEMP/release"; mkdir -p "$D"
TAG="V3.3.0.6_main_250715001_20261104_2d4a4c28"
VER="${TAG#V}"
PROJECT=280
```

---

## 0. 前置检查（30 秒）

```bash
git rev-parse --short HEAD          # 记下来，后面要贴进发布页的 ref
git status --porcelain              # 必须为空
git remote -v                       # 必须是 ssh://...:2222，不是 https
timeout 20 git ls-remote --tags origin
```

**https 会挂死**：`origin` 是 `https://...` 时，非交互环境里 `git ls-remote` /
`git push` 会卡在 `git credential-manager get` 25s 以上直到被杀。改 ssh：

```bash
git remote set-url origin ssh://git@192.168.1.218:2222/<group>/<repo>.git
```

只改 `.git/config`，不入版本控制。

---

## 1. 产物

```bash
"C:/Keil_v5/UV4/UV4.exe" -b SCM620_BCMU_V3300.uvprojx -j0 -o build-release.log
tail -5 build-release.log            # 必须 0 Error(s)
ls -l --time-style=long-iso Output/*.bin Output/*.hex Objects/*.axf
```

- **`UV4 -b` 正常退出码是 1**，不是 0。判据只看日志里的 `0 Error(s)`。
- AfterMake 自动跑 `Brun/xujinghan.BAT`，产出
  `Output/SCM620-BC-H-V3306.<固件号>维冠.{bin,hex,s19}`。
- `Output/` 里并排躺着历史交付（公版 / 250715000 / 250715001 / poweron-insulation-b-5M）。
  **按时间戳取本次那一份**，不要按文件名长短挑。

记指纹：

```bash
python -c "import hashlib,pathlib;b=pathlib.Path('Output/SCM620-BC-H-V3306.250715001维冠.bin').read_bytes();print(len(b),hashlib.sha256(b).hexdigest())"
```

曾实测：同一份源码重编两次，`bin`/`hex` 逐字节相同 → 产物确实来自该 commit。

---

## 2. 发布说明

基线是**上一次真实交付的 commit**，不是上一次 tag（首次发布时远端可能零 tag）。

```bash
git log --oneline <基线>..HEAD       # 逐条读
git show <sha> -- <file>             # 措辞看真实 diff，别凭标题猜
```

写成 `{"description": "- …\n- …\n"}`。

规则：一行一条、以 `- ` 开头、只描述**行为变化**、不写"已验证/待验证"、
不写标题与日期。

---

## 3. 标签

```bash
git tag -a "$TAG" -F "$D/tagmsg.txt"
git push origin "$TAG"
git ls-remote --tags origin          # 核对 ^{} 那行等于 HEAD
```

`tagmsg.txt` 体例：

```
SCM620_BCMU_V3300 <tag>

SOFTVER 0x03030006 + 固件号 250715001
<本次改动一行>
```

---

## 4. 软件包（先传字节）

ASCII 副本：

```bash
cp "Output/...250715001维冠.bin" "$D/SCM620-BC-H-V3306.250715001-WeiGuan.bin"
cp "Output/...250715001维冠.hex" "$D/SCM620-BC-H-V3306.250715001-WeiGuan.hex"
```

上传（token 从 `glab auth status --show-token` 取，只放内存、不落盘）：

```
PUT https://192.168.1.218/api/v4/projects/280/packages/generic/<tag>/<tag去V>/<文件名>
Header: PRIVATE-TOKEN: <token>
Header: Content-Type: application/octet-stream
Body: 文件字节
```

每传一个立刻 `GET` 同一路由比 sha256 与字节数。`PUT` 同内容重传是幂等的，可原地重试。

---

## 5. 发布页

```
POST https://192.168.1.218/api/v4/projects/280/releases
{
  "name":        "<tag>",
  "tag_name":    "<tag>",
  "ref":         "<HEAD 全 sha>",
  "description": "<第 2 步的正文>",
  "assets": {"links": [
    {"name":"<ASCII 文件名>",
     "url":"https://192.168.1.218/api/v4/projects/280/packages/generic/<tag>/<ver>/<文件名>",
     "link_type":"package"}
  ]}
}
```

`url` 用**数值 project id**（`/projects/280/...`）。用命名空间路径时父组含中文，
编码错一位就 404 且看不出原因。

---

## 6. 读回（12 项契约）

| # | 检查 | 期望 |
| --- | --- | --- |
| 1 | `GET /releases/<tag>` | 200 |
| 2 | `name == tag_name == tag` | 三者逐字相同 |
| 3 | `commit.id` | 以被推的 HEAD 短 sha 开头 |
| 4 | `description` | 等于第 2 步正文，行数正确 |
| 5 | `assets.links` 数量 | 等于上传文件数 |
| 6 | 每条 link 的 url | 都落在 `packages/generic/<tag>/<ver>/` |
| 7 | 有 url 含 `/uploads/` | 不允许 |
| 8 | `GET /packages?package_name=<tag>` | 命中 1 个 |
| 9 | `package.name == tag` | 逐字 |
| 10 | `package.version == tag去V` | 逐字 |
| 11 | `package_files` 数量 | 等于上传文件数 |
| 12 | 每个文件下载回来 | sha256 == API 记录 == 本地副本 |

全 pass 才算完成。任一失败按 `rollback.md` 撤，不要"再发一版盖住"。

打印四行收尾：发布页 / 包页 / 每个资产的下载地址 / 运行记录位置。

---

## 7. 记录

把下面这些写进 `references/history.md` 的表格，下一版才知道基线在哪：

- 时间、标签、commit、SOFTVER、固件号、说明行数
- 两个资产的 `字节数 + sha256`
- 12 项读回的结论
