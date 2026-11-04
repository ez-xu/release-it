# 回滚

顺序**不可颠倒**：先撤页面与包，再撤标签。反序会让发布页留下指不到东西的链接
（GitLab 17.5 删 tag 后对 Release 的 `DELETE` 会返回 403 而不是 404，容易误判为失败而反复重试）。

## 先回答两个问题

1. **远端 tag 推上去了吗？** `git ls-remote --tags origin | grep <tag>`
2. **Release 建了吗？** `GET /projects/<id>/releases/<tag>`（404 = 没建）

| 状态 | 只需做的事 |
| --- | --- |
| 只打了本地 tag | `git tag -d <tag>` |
| 推了 tag、没建 Release | 删远端 tag → 删本地 tag |
| 三样都成了 | 按下面四步倒着撤 |

## 四步（2026-11-04 实测有效）

```
1) DELETE /projects/280/releases/<tag>          -> 200，再 GET 确认 404
2) DELETE /projects/280/packages/<package_id>   -> 204，再 GET 列表确认空
3) git push origin --delete <tag>               -> - [deleted]
4) git tag -d <tag>                             -> Deleted tag
```

`package_id` 从 `GET /packages?package_name=<tag>` 取（是数字 id，不是名字）。

实测记录：`DELETE releases` 返回 **200**、`DELETE packages/<id>` 返回 **204**，
两者都要再 `GET` 一次确认真的没了 —— 只看状态码不够。

## 部分撤销

- **只撤发布页**：只做第 1 步。包还在，可用 `POST /releases` 重建页面并重新挂链接。
- **换资产**：先 `PUT` 新字节（同路由覆盖），再挂新链接、删旧链接。
  **不要**先删包，那样页面立刻变死链。
- **发布说明写错**：`PUT /projects/280/releases/<tag>` 带新 `{"description": "..."}` 覆盖。
  不动 tag，不动文件，不重建页面。
- **只改标签名（本次真实发生）**：删 Release → 删包 → 删远端 tag → 删本地 tag，
  然后用新名字重走全部五步。这是唯一安全的"改名"方式。

## 不要做

- 不要用"再发一版"盖住错误发布 —— 两个 tag 指同一 commit 时现场无法分辨刷哪个。
- 不要 `git push --force` 移动已推送的 tag。
- 不要在包版本被复用时删包 —— 两次发布挤进同一版本，删一个牵连另一个。
  这正是标签必须带日期与 sha 的原因。
