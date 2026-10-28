<div align="center">


<img src="https://bfs.iloli.moe/mapus/banner.png" width="640" alt="MAPUS">

# MAPUS - 装进浏览器侧边栏的 AI 工作台

**一个能看懂你当前网页的 AI 助手**：总结页面、编写文章、提取信息、评论点赞、下载视频、整理表格、批量操作、跨页收集，都在浏览器里完成，不离开你正在看的页面，你能实时看见智能体在做些什么。

MAPUS 可运行在 DeepSeek Harness，也可自定义自己的大模型，智能体能真正“看见”并操作当前网页：读内容、点按钮、填表单、抓数据、管理标签页。你只需要用自然语言描述想做什么。

> 专业模式：面向已获书面授权的安全测试场景，MAPUS 额外提供反蜜罐对抗、敏感信息梳理、反调试 Hook 等能力。默认关闭，需在设置中手动开启。

<p>
  <img src="https://img.shields.io/badge/version-3.0.1-1f6feb?style=flat-square" alt="version">
  <img src="https://img.shields.io/badge/Chrome-%E2%89%A5%20120-4285F4?style=flat-square&logo=googlechrome&logoColor=white" alt="chrome">
  <img src="https://img.shields.io/badge/Manifest-V3-374151?style=flat-square" alt="manifest">
  <img src="https://img.shields.io/badge/%E7%95%8C%E9%9D%A2-%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-4b5563?style=flat-square" alt="language">
</p>

</div>

---

## 设计初衷

> **为什么我们不打造一个能在浏览器 ALL IN ONE 的插件**

简单来说，我们仅需要一个浏览器，一个插件，就能联通万物，在任何网页上做你想做的操作，案例特别多，欢迎自己尝试，比如可以让他做算法题目

![](https://bfs.iloli.moe/mapus/demo6.gif)

另外，欢迎使用我们另外一个渗透智能体产品，叫做 VAELOR 项目地址在：https://github.com/Gh0xE9/ErraticGopher

*MAPUS is a Chrome side-panel extension that combines anti-honeypot defence, sensitive-data discovery, anti-debug hooking and an LLM agent that can read and operate on the current page — with every rule table user-configurable.*

---

## 能力一览

| 模块           | 做什么                                                       |
| :------------- | :----------------------------------------------------------- |
| 隐私防护       | 识别追踪脚本与浏览器特征采集，拦截采集类请求，改写 UA 与转发头，按站点清理痕迹 |
| 敏感数据梳理   | 从页面、脚本与请求里汇总接口、路径、凭据、身份信息、文件与第三方域名 |
| 技术栈识别     | 依据响应特征判断后端框架、中间件与常见产品                   |
| 站点画像       | 汇总域名权重、IP 归属、备案等公开信息（需自备密钥，默认关闭） |
| 调试防护与脚本 | 内置脚本库解除常见的页面调试限制，可提取前端路由、注入自定义脚本 |
| AI 助手        | 一步一个动作：先思考再调一个工具、看结果再决定下一步，工具卡按步编号；步数用完可一键接着跑；会话按站点本地留存 |
| 浏览器控制     | 智能体通过 CDP 真正驱动浏览器：真实鼠标键盘（isTrusted）、结构快照、点击输入选择、跳转与标签页管理、CDP 层抓包与响应体、控制台异常、截图、主世界执行任意 JS、UA/地理位置/时区/视口/网络模拟 |
| 规则中心       | 字典、特征、拦截列表、UA 池、服务地址、模型预设、系统提示词全部可视化编辑 |
| 全局开关       | 顶栏那个滑动开关是总开关，点一下停用全部功能（扫描 / 隐私防护 / 脚本 / AI 助手），页面不再被注入或改写 |

## 插件安装

默认本地解压插件，开箱即用

![](https://bfs.iloli.moe/mapus/demo4.gif)

如果要赋能 DeepSeek Harness，需要本地 `dsh plugin add` 添加插件进去

![](https://bfs.iloli.moe/mapus/1.jpg)

接着重启 DeepSeek Harness，会输出 Token 信息

![](https://bfs.iloli.moe/mapus/2.jpg)

然后到控制大屏-设置配置相关信息即可

![](https://bfs.iloli.moe/mapus/3.jpg)

## 界面预览

<p align="center">
  <img src="https://bfs.iloli.moe/mapus/demo5.gif" width="720" alt="MAPUS 运行演示"><br>
  <sub>抖音视频下载</sub>
</p>



<p align="center">
  <img src="https://bfs.iloli.moe/mapus/demo1.gif" width="720" alt="MAPUS 运行演示"><br>
  <sub>经典 DVWA 打靶</sub>
</p>
<p align="center">
  <img src="https://bfs.iloli.moe/mapus/demo2.gif" width="720" alt="MAPUS 运行演示"><br>
  <sub>爬取企业 ICP 备案并保存到本地</sub>
</p>


<p align="center">
  <img src="https://bfs.iloli.moe/mapus/demo3.jpg" width="720" alt="MAPUS 运行演示"><br>
  <sub>帮你评论 B 站评论</sub>
</p>


<table>
  <tr>
    <td align="center" width="33%"><img src="https://bfs.iloli.moe/mapus/overview.png" width="240" alt="总览"><br><sub><b>总览</b></sub></td>
    <td align="center" width="33%"><img src="https://bfs.iloli.moe/mapus/anti.png" width="240" alt="反蜜罐"><br><sub><b>反蜜罐</b></sub></td>
    <td align="center" width="33%"><img src="https://bfs.iloli.moe/mapus/agent.png" width="240" alt="智能体"><br><sub><b>智能体：按步推进</b></sub></td>
  </tr>
  <tr>
    <td align="center" width="33%"><img src="https://bfs.iloli.moe/mapus/browser-control.png" width="240" alt="智能体驱动浏览器"><br><sub><b>智能体驱动浏览器</b></sub></td>
    <td align="center" width="33%"><img src="https://bfs.iloli.moe/mapus/hooks.png" width="240" alt="反调试 Hook"><br><sub><b>反调试 Hook</b></sub></td>
    <td align="center" width="33%"><img src="https://bfs.iloli.moe/mapus/rules.png" width="240" alt="规则中心"><br><sub><b>规则中心</b></sub></td>
  </tr>
</table>


## 规则中心

进入 **设置 → 字典与规则**，可以按分组修改：

目录探测字典、蜜罐与混淆特征、自定义扫描规则、追踪器拦截列表、UA 伪装池、第三方数据服务、模型预设与系统提示词，以及一份供整体导入导出的完整 JSON。

- 保存后新打开的页面立即生效，已打开的页面刷新一次即可；
- 只保存与默认值的差异，随时可以「恢复默认」；
- 第三方数据服务默认关闭，未填写密钥时不会发起任何请求。

---

## 上游项目与致谢

MAPUS 站在这几个开源项目的基础上，建议给它们点个 Star

| 项目                                                         | 作者                                      | 在 MAPUS 中的角色                                            |
| :----------------------------------------------------------- | :---------------------------------------- | :----------------------------------------------------------- |
| **[MAPUS](https://github.com/icecliffs/MAPUS)**              | [icecliffs](https://github.com/icecliffs) | 编排所有的项目，以及核心智能体设计思路，完善界面、功能排版、架构等等 |
| **[AntiDebug_Breaker](https://github.com/0xsdeo/AntiDebug_Breaker)** | [0xsdeo](https://github.com/0xsdeo)       | 反调试与 JS 逆向 Hook 的思路、脚本库与注入方式，在此基础上做了一定的修改 |
| **[NextAnti](https://github.com/icecliffs/nextanti)**        | [icecliffs](https://github.com/icecliffs) | 反蜜罐、反追踪与浏览器特征对抗（本项目的反蜜罐引擎在其基础上重构），在此基础上做了一定的修改 |
| **[Heimdallr](https://github.com/Ghr07h/Heimdallr)**         | [Ghr07h](https://github.com/Ghr07h)       | NextAnti 的主要参考项目，指纹与蜜罐特征的设计思路来源，在此基础上做了一定的修改 |
| **[SnowEyes](https://github.com/SickleSec/SnowEyes)**        | [SickleSec](https://github.com/SickleSec) | 页面敏感信息提取，在此基础上做了一定的修改                   |

<a href="https://www.star-history.com/?repos=icecliffs%2Fmapus&type=date&legend=top-left">

 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=icecliffs/mapus&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=icecliffs/mapus&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=icecliffs/mapus&type=date&legend=top-left" />
 </picture>

</a>

---

<div align="center">
<sub>MAPUS · v3.0.1 · 面向浏览器端的智能体渗透测试插件</sub>


<sub>本项目仅用于已获授权的安全测试、应急响应与自有资产排查 · 使用前请阅读 <a href="#法律合规与免责声明">法律合规与免责声明</a></sub>

</div>
