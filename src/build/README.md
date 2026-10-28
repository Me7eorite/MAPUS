# 构建与发布

这份文档只给维护者看：怎么把源码打成可发行的产物，以及为什么只能做到「混淆」而不是「加密」。

## 先明确一件事

**CRX 不可能加密。** 它本质是「zip + 签名」：

- 签名（`.pem` 私钥）只证明「这个包是我发的」，不提供任何保密；
- Chrome 必须在本地把 JS 读出来、解析、执行，所以文件一定是明文；
- 用户拿到 `.crx` 后改后缀为 `.zip` 就能解包，或者直接在 `chrome://extensions` 里点开源码。

所以「发布 CRX 时加密」物理上做不到。能做到的是**把逆向成本抬到不值得**：字符串全编码、控制流打散、结构抹平、符号全丢。下面是我们实际采用的做法，每一档都经过真实 Chromium 加载验证。

## 命令

```bash
npm install          # esbuild + javascript-obfuscator + react/react-dom，全是构建期依赖
npm run build:ui     # 只重建智能体界面（React 源码在 ui/agent/，输出 popup/agent.bundle.js）
npm run build        # mid 档，输出 dist/
npm run build:min    # 仅压缩，不混淆（过商店审核用这个）
npm run build:max    # 最强档
npm run pack         # max 档构建 + 打包 release/MAPUS-<版本>.crx（对外分发用这个）
npm run pack:min     # min 档构建 + 打包（提交 Chrome Web Store 用这个）
```

`popup/agent.bundle.js` 是构建产物，但**要跟着仓库一起提交**：直接「加载已解压的扩展程序」时没有构建步骤，缺这个文件智能体页会提示加载失败。改 `ui/` 下的代码后必须重跑 `npm run build:ui`。

产物：

| 路径 | 说明 |
| :-- | :-- |
| `dist/` | 已处理、可直接「加载已解压的扩展程序」的目录 |
| `release/MAPUS-x.y.z.crx` | 签名后的发行包 |
| `build/mapus.pem` | **签名私钥，绝对不能提交、不能外发** |

## 三档到底做了什么

| 档位 | 处理 | JS 产物 | 整包 |
| :-- | :-- | :-- | :-- |
| `min` | esbuild 打包 + 压缩，标识符压缩，无字符串数组 | 582 KB | 1.2 MB |
| `mid` | 上面 + 十六进制标识符 + 字符串抽成数组（base64）并打乱、轮转、加壳 | 1.45 MB | 2.0 MB |
| `max` | 上面 + 字符串双编码（base64 + RC4）+ 拆分字符串 + 控制流平坦化 + 死代码注入 + 自防御 | 3.57 MB | 4.2 MB |

`max` 档的关键差异：

- **字符串表是加密的**：`base64` 与 `RC4` 双重编码，取值必须走运行时解码器，静态 grep 拿不到任何中文提示、接口路径、权限名；
- **控制流平坦化**：函数体被改写成 `switch` 状态机，`if/else` 与循环的原始结构消失，反编译出来是一团跳转；
- **死代码注入**：混入永不执行的等价分支，误判率上升；
- **自防御**：检测自身函数是否被格式化或改写，被改过就不正常工作（所以**不要**再对产物做二次美化或替换，改了就得重新构建）。**只对扩展上下文里的脚本开启**，页面注入的那几个文件必须关掉，原因见下面的坑。

除了混淆器，构建过程本身还做了三件事，这三件事比混淆更有价值：

1. **后台 16 个文件合并成 1 个**，内容脚本 6 个合并成 1 个，弹窗 7 个 ES 模块合并成 1 个 —— 源码的模块划分、文件命名、函数边界全部消失；
2. **删掉所有注释与空行**，不给任何「这段是干反蜜罐的」提示；
3. **不产出 sourcemap**，构建结束会自动扫描产物，出现 `.map` / `.ts` / `.jsx` 直接告警。

## 为什么后台现在能上完整混淆

早先 `background` 与 `popup` 只能用「安全模式」（只改标识符，不开字符串数组）。原因是 `chrome.scripting.executeScript({ func })` 会把函数 `toString()` 后丢进页面执行：

```js
func: url => fetch(url, { credentials: 'omit' }).then(res => res.text())
```

一旦字符串被抽成数组，函数体变成 `fetch(_0x1a2b(3), ...)`，而 `_0x1a2b` 定义在后台闭包里，页面里根本不存在 → `_0x1a2b is not defined`。

**现在的做法：所有会被字符串化的函数外移到 `background/pagefn.js`。**

- 这个文件只做压缩、**不做混淆**，字符串保持字面量，`toString()` 出来仍是可独立运行的代码；
- 后台通过 `importScripts('/background/pagefn.js')` 引入，调用时传函数对象：`func: self.MAPUS_PAGEFN.fetchText`；
- 弹窗通过 `<script src="../background/pagefn.js">` 引入，同一份实现两边共用；
- 因此 `background` / `popup` 不再有任何自带闭包的注入函数，可以整体上 `max`。

`pagefn.js` 里只有 DOM 查询、文本抽取、存储读取、端点收集这类页面侧动作，不含规则判定、指纹词库、DMR 规则与智能体逻辑 —— 核心仍然在混淆后的 `background.js` 里。这是为了「能混淆」付出的必要代价，别往里塞敏感逻辑。

## 坑一：页面注入的脚本不能开自防御

`chrome.scripting.executeScript({ files })` 和 `chrome.userScripts` 都是把文件内容当成脚本文本注入页面。自防御在注入后会认为自己「被改写过」，于是进入死循环 —— 表现是页面卡死、调用永不返回，30 秒后 Service Worker 被判空闲重启，报 `Service worker restarted`。

实测踩到两次：取证面板（`content/modules/*`）一点就卡、反蜜罐注入（`inject/nextanti.js`）在页面里抛错。所以构建脚本把这几类文件标成 `PAGE_SIDE`，只关自防御，其余（字符串编码、平坦化、死代码）照开：

```js
const PAGE_SIDE = { selfDefending: false };
```

涉及文件：`content/modules/*.js`、`inject/nextanti.js`、`scripts/*.js`。这三类本来就是注入到别人页面里跑的，逆向门槛天然低一档，不必纠结。

## 坑二：MV3 的 CSP 不允许 eval 和 debugProtection

扩展页与 Service Worker 的 CSP 是 `script-src 'self'`，`eval` 和 `new Function` 直接抛错。所以：

```js
debugProtection: false,      // 依赖 Function 构造器 + debugger 循环
debugProtectionInterval: 0
```

`selfDefending` 是开着的（它只用 `Function.prototype.toString` 检查自身是否被改写，不构造新函数）。这一点实测过：开 `debugProtection` 后 Service Worker 直接卡死，`--level=max` 都跑不完一轮测试，所以写死成 `false`，不要改。

改完产物可以自查：

```bash
grep -c "eval(\|Function(" dist/background/background.js   # 必须是 0
grep -c "安全测试智能体\|chat/completions" dist/background/background.js  # 必须是 0（字符串已加密）
```

## 智能体界面为什么不进混淆

`popup/agent.bundle.js` 是 React 运行时（`ui/agent/*.jsx` 编译产物，约 160 KB），在 dist 里**原样拷贝**，不走混淆器：

- 混淆后撑到 2.9 倍（实测 469 KB），换来的只是 React 内部标识符改名，没有意义；
- 弹窗通过 `import(chrome.runtime.getURL('popup/agent.bundle.js'))` 动态加载，它必须是独立文件。

界面层只有布局与渲染，不含规则与算法；`popup.js` 本身是 `max` 档混淆的。

## 私钥与扩展 ID

第一次 `npm run pack` 会生成 `build/mapus.pem`，之后复用。

- **扩展 ID 由私钥决定**（公钥 SHA-256 前 16 字节）。当前 ID：`lmoaehkcnlnhfabciklpkkloldloopbp`
- 私钥丢了 → 扩展 ID 变了 → 所有用户必须卸载重装，配置与规则全部丢失；
- 私钥泄漏 → 别人能签一个同 ID 的恶意包推给你的用户。

建议：私钥单独加密备份到离线介质，仓库里 `.gitignore` 已经排除 `build/*.pem`。

## 分发方式与各自的坑

| 方式 | 优点 | 坑 |
| :-- | :-- | :-- |
| 直接发 `.crx`（`npm run pack`） | 混淆最强 | Chrome 稳定版提示「未在商店发布」，可能被策略拦截；Edge 对非商店包更宽松 |
| 企业策略 `ExtensionInstallForcelist` | 静默安装、可控 | 需要自建 `update_url` 与 XML 清单，仅限企业环境 |
| Chrome Web Store（`npm run pack:min`） | 最正规、可自动更新 | **禁止重度混淆**，`max` 档大概率审核不过 |

## 还能更强吗

按性价比排序，都评估过：

1. **关键逻辑服务端化** —— 把规则判定、特征匹配、提示词挪到自己 API 后面，前端只留调用。这是唯一真正防得住的手段，代价是必须联网；
2. **WASM** —— 把核心算法用 Rust/C 编译成 `.wasm`，反编译成本比 JS 高一个数量级，但仍是可直接反汇编的字节码，不是加密，构建链也更重；
3. **许可证 + 机器绑定** —— 挡的是「拷给别人用」，挡不住逆向；
4. **运行时反调试** —— 在 MV3 里基本不可行：CSP 禁 `Function`，SW 会休眠，而且会和扩展自己的 Hook 引擎打架。

一句话：**混淆是「让顺手抄的人放弃」，不是「防住专业的人」**。`max` 档下，读懂 `background.js` 需要先写脚本还原字符串表和控制流，成本已经远高于照着功能重写一遍；但真要防止核心逻辑外流，只能把它挪到服务端。
