# v3.9.4

`GET` / `DELETE /v1/responses/{id}` **自 v3.9.1 发布起对所有客户端都不可用** ——
任何客户端形态都必然 404。用到这两个端点的部署需要升级;其余部分无变化。

升级无需改配置(但这两个端点的调用方式有一处新增,见下)。

---

## 用户可感知

### 检索/删除端点从发布起就是死的

无请求体的 `GET`/`DELETE` 用 `callerKeyFromRequest(req, token, null)` 派生身份,
而这在**每种**客户端形态下都得不到能命中的 callerKey:

- **能链式续接的客户端**都会发 `user` / `prompt_cache_key` / `safety_identifier`,
  所以它 `POST` 时的 callerKey 带 `:user:<hash>` 段;而无 body 的 `GET` 派生
  `:client:<ip+ua>` —— 键不同,查询必然 miss。
- **什么身份都不发的客户端**两边键相同,但过不了 `hasPerUserScope` —— 同样 404。
- 连 `WINDSURFAPI_SINGLE_TENANT_CACHE=1` 也救不了:身份不匹配是先决问题,那个开关
  只影响信任判定。

实测:`POST` 存下 id 后,同一客户端 `GET`/`DELETE` 全部 404,而用它自己的 `POST`
身份查同一 id 返回 200 —— 记录确实在,只是它自己读不到。

### 调用方式:身份信号走 query

Responses 检索 API 没有请求体,所以身份信号改走查询串,词汇与 `POST` body 完全一致
(并且走**同一条**提取路径,所以调用方能精确复现自己的作用域):

```
GET    /v1/responses/{id}?prompt_cache_key=<你 POST 时用的值>
DELETE /v1/responses/{id}?user=<你 POST 时用的值>
```

`user` / `prompt_cache_key` / `safety_identifier` 三者都支持,取值**必须与创建该响应
时用的一致**,否则 404。不带这些参数时行为与之前一致(仍然 404)。

跨租户隔离未被削弱:别人的身份参数一律 404 且不泄漏内容,这一点有独立守卫。

---

## 工程

**这个缺陷之所以能带着全绿的测试发布,是因为我当时写的测试把 bug 固化成了契约。**

那条路由层测试断言"bodyless GET 必须 404",还在注释里称之为
*"the documented contract … the scoping gate holds even at the route layer"*。
它测到的现象是真的,但对现象的解释是错的 —— 于是功能是死的、测试却一直绿,而且后来
读到这条测试的人会以为这是设计意图。

这比"缺一条测试"更糟。缺测试只是没覆盖;**把错误行为写进断言,是主动为它背书。**
本轮已把该断言改成正向断言(必须能读到自己的响应),并补了两条对照:外来身份参数
仍 404、无参数仍 404。突变验证:把身份派生退回发布时的 `(req, token, null)`,
新守卫立即失败。

这也是这一轮记入台账的一条更普适的规律:**写测试时区分"我在断言期望行为"还是
"我在记录当前行为"** —— 后者必须在注释里标明是观察而非契约,否则它会伪装成结论。

**测试 3070 → 3072**,全量绿(`npm run test:release`,逐文件进程隔离)。

---

**升级**:`git pull && 重启`,或换用新版二进制 / 镜像。
