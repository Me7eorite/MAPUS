# BUILD.md

> 一句话：**这个插件不需要编译。** 仓库里的 `src/` 就是一个可以直接装进浏览器的扩展。

## 装进浏览器（三步）

1. 拿到源码：`git clone` 本仓库，或者右侧 **Code → Download ZIP** 后解压
2. 打开 `chrome://extensions`（Edge 是 `edge://extensions`），右上角打开 **开发者模式**
3. 点 **加载已解压的扩展程序**，选中 **`src/` 目录**（注意不是仓库根目录）

装好后工具栏会出现图标，点开是侧边栏面板。

要求：Chrome / Edge **120 及以上**。

## 为什么不用编译

扩展本身就是一堆明文脚本加一个 `manifest.json`，浏览器直接读，没有构建这一步。

整个仓库里唯一的一个「打包产物」是 `src/popup/agent.bundle.js`，它提供智能体界面的 React 代码，**已经随源码一起提供**。所以 clone 下来就能装，连 `npm install` 都不用跑。

装好之后改代码也不用重新构建：改完在 `chrome://extensions` 里点该扩展的 **重新加载** 按钮即可生效。

## 可选：接上 DeepSeek Harness（`dsh-mapus`）

**装插件本体用不到这一步**，跳过不影响任何功能。只有当你想把侧边栏那场对话交给
dsh 的 agent 循环去思考时才需要——工具执行仍然回到浏览器里，界面和会话都不变。

前提：本机已经装好 DeepSeek Harness，能跑 `dsh --profile web`。

> **桥不在本仓库里**：从 3.0.3 起 `dsh-mapus` 是独立项目，
> 源码在 [github.com/icecliffs/dsh-mapus](https://github.com/icecliffs/dsh-mapus)，
> 也发布在 npm 上（包名 `dsh-mapus`）。

### 1. 把插件装进 profile（常驻）

```bash
# 一条命令（需要 pnpm 在 PATH 上）
dsh plugin --profile web add dsh-mapus
```

这条命令失败就手工登记。它底层是 `pnpm add`，会把整个 profile 的依赖重装一遍，
profile 里只要有一个本地依赖的文件已经不在，就会整体报 `ENOENT`——跟本插件无关：

```bash
cd ~/.dsh/profiles/web
ln -sfn /path/to/dsh-mapus node_modules/dsh-mapus
```

再编辑 `~/.dsh/profiles/web/package.json`，**两处都要写**（只放进 `dependencies`
是不会加载的）：

```json
{
  "dsh": {
    "profile": {
      "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-mapus"]
    }
  },
  "dependencies": {
    "dsh-mapus": "file:/path/to/dsh-mapus"
  }
}
```

### 2. 起桥，拿到地址和 Token

```bash
# 模型 Key 可选：脚本会自动从 ~/.dsh/.credentials.yaml 里补，没有这份文件才需要手动给
export DEEPSEEK_API_KEY=sk-...
/path/to/dsh-mapus/bin/start.sh
```

控制台会打印：

```
[dsh-mapus] ready  http://127.0.0.1:7355  token 8ccb0a7d…  (generated, ~/.dsh/mapus-bridge/token)
[dsh-mapus] provider profile default  model profile default  ·  paste the url and token into MAPUS → Settings → Agent model
```

### 3. 在 MAPUS 里指过去

控制大屏 → **设置 → 智能体模型** → 执行后端选 **DeepSeek Harness（本地 DSH）** →
填上面那个地址和 Token → 点「测试连接」，返回工具数量就说明通了 → 保存。

想换回扩展自带的后端，把「执行后端」切回内置即可，两套配置互不覆盖。

> 协议、工具面、回看历史会话、排障细节在
> [dsh-mapus 的 README](https://github.com/icecliffs/dsh-mapus)。

## 只有一种情况需要构建

你改了 `src/ui/agent/` 下的文件（智能体界面的源码，`.jsx` 和 `.js` 都算），才需要重新生成上面那个 bundle：

```bash
cd src
npm install
npm run build:ui
```

然后回扩展页点「重新加载」。改其他任何文件都不需要。

## `src/scripts/` 目录是空的，这是正常的

插件内置的 hook 脚本库不随源码发布，原因见 `src/scripts/README.md`。

`src/scripts.json` 里的索引仍然保留着，想用哪个就自己写一个同名文件丢进去：

```
src/scripts/<id>.js      # id 对应 scripts.json 里每个条目的 id
```

重启扩展后，那些条目就会真正可用。

## 装不上时先看这几条

| 现象 | 原因 |
| :-- | :-- |
| 提示「清单文件缺失或不可读取」 | 目录选错了，要选 `src/`，不是仓库根目录 |
| 智能体标签页一直转圈或空白 | 确认 `src/popup/agent.bundle.js` 在里面（若删过，按上面「需要构建」跑一次） |
| 扩展图标是灰的、点了没反应 | 浏览器版本低于 120 |
| 起了 `bin/start.sh` 但没有 `[dsh-mapus] ready` | 插件没装进 profile，或 `bundles` 里没登记 |
