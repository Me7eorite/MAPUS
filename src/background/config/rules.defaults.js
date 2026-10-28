(function () {
  'use strict';
  if (self.MAPUS_RULES_DEFAULT) return;

  self.MAPUS_RULES_DEFAULT = {
    version: 1,

    probe: {
      concurrency: 5,
      timeoutMs: 6000,
      followRedirect: true,
      credentials: 'omit',
      acceptStatus: [200, 201, 204, 301, 302, 401, 403, 500],
      wordlist: [
        '.git/HEAD', '.git/config', '.git/index', '.svn/entries', '.hg/requires',
        '.env', '.env.bak', '.env.local', '.env.production', '.DS_Store',
        'robots.txt', 'sitemap.xml', 'crossdomain.xml', 'security.txt',
        'admin', 'admin/', 'admin/login', 'manage', 'manager', 'login', 'console',
        'backup.zip', 'backup.tar.gz', 'backup.sql', 'www.zip', 'web.zip', 'db.sql', 'dump.sql',
        'phpinfo.php', 'info.php', 'test.php', 'debug.log', 'error.log', 'logs/',
        'swagger-ui.html', 'swagger/index.html', 'v2/api-docs', 'v3/api-docs', 'openapi.json',
        'actuator', 'actuator/env', 'actuator/health', 'actuator/heapdump', 'druid/index.html',
        'nacos/', 'eureka/', 'hystrix.stream', 'jolokia/list',
        'server-status', 'nginx_status', 'phpmyadmin/', 'adminer.php',
        'WEB-INF/web.xml', 'META-INF/MANIFEST.MF', 'package.json', 'config.json',
        '.well-known/security.txt', 'api/', 'api/swagger.json', 'graphql'
      ]
    },

    honeypot: {
      features: [
        { name: 'HFish', signs: ['hfish', 'x_hfish', 'hfish.js'], detail: '命中 HFish 追踪特征', level: 'danger' },
        { name: 'BeEF', signs: ['hook.js', 'beef.net'], detail: '命中 BeEF 钩子特征', level: 'danger' },
        { name: 'OpenCanary', signs: ['canarytoken', 'opencanary'], detail: '命中 Canary Token 特征', level: 'danger' },
        { name: 'FingerprintJS', signs: ['fingerprintjs', 'fingerprint2'], detail: '页面引入浏览器特征采集库', level: 'danger' },
        { name: 'Canvas 特征', signs: ['canvas fingerprint', 'todataurl', 'getimagedata'], detail: '存在 Canvas 特征采集调用', level: 'danger' },
        { name: 'Audio 特征', signs: ['audiocontext', 'getchanneldata'], detail: '存在 Audio 特征采集调用', level: 'danger' },
        { name: 'WebRTC 探测', signs: ['rtcpeerconnection', 'enumeratedevices'], detail: '存在 WebRTC / 设备枚举调用', level: 'danger' }
      ],
      suspectScriptKeys: ['fingerprint', 'analytics', 'tracker', 'clarity', 'hotjar', 'beacon'],
      obfuscation: [
        { name: 'JS 混淆', pattern: '_0x[a-f0-9]{4,}', flags: 'i', detail: '存在 _0x 变量名混淆的脚本', level: 'warn' },
        { name: 'JS 混淆', pattern: 'eval\\(function\\(p,a,c,k,e,d\\)', flags: '', detail: '存在 packer 打包器混淆代码', level: 'warn' }
      ],
      watchClipboard: true,
      watchEval: true,
      watchFetch: true
    },

    trackers: {
      rules: [
        { host: 'hm.baidu.com', type: 'analytics' },
        { host: 'google-analytics.com', type: 'analytics' },
        { host: 'googletagmanager.com', type: 'analytics' },
        { host: 'doubleclick.net', type: 'ads' },
        { host: 'scorecardresearch.com', type: 'analytics' },
        { host: 'clarity.ms', type: 'behavior' },
        { host: 'hotjar.com', type: 'behavior' },
        { host: 'hmcdn.baidu.com', type: 'analytics' },
        { host: 'cnzz.com', type: 'analytics' },
        { host: 'umeng.com', type: 'analytics' },
        { host: 'growingio.com', type: 'analytics' },
        { host: 'sensorsdata', type: 'analytics' },
        { host: 'matomo', type: 'analytics' },
        { host: 'fingerprintjs', type: 'fingerprint' },
        { host: 'api.m.jd.com', type: 'custom' }
      ]
    },

    ua: {
      resourceTypes: [
        'main_frame', 'sub_frame', 'script', 'stylesheet', 'image', 'font',
        'xmlhttprequest', 'ping', 'media', 'websocket', 'other'
      ],
      pool: [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:137.0) Gecko/20100101 Firefox/137.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:137.0) Gecko/20100101 Firefox/137.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/77.0.3865.120 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:70.0) Gecko/20100101 Firefox/70.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.2 Safari/605.1.15',
        'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:69.0) Gecko/20100101 Firefox/69.0',
        'Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.70 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/76.0.3809.132 YaBrowser/19.9.3.314 Yowser/2.5 Safari/537.36'
      ]
    },

    endpoint: {
      skipExtension: 'png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot|mp4|mp3|wav',
      apiHint: '/api|ajax|graphql|rest',
      assetHint: '\\.(js|css)(\\?|$)',
      getHint: '/(list|page|query|search|get|detail|info|find|select)',
      postHint: '/(add|create|save|update|edit|delete|remove|upload|login|submit)',
      maxPathLength: 300,
      maxResults: 400
    },

    xss: {
      sources: [
        { name: 'location', pattern: 'location\\.(hash|search|href)' },
        { name: 'document.URL/referrer', pattern: 'document\\.(URL|documentURI|referrer)' },
        { name: 'window.name', pattern: 'window\\.name' },
        { name: 'Storage', pattern: '(localStorage|sessionStorage)\\.(getItem|\\w+)' },
        { name: 'cookie', pattern: 'document\\.cookie' },
        { name: 'postMessage', pattern: 'event\\.data|addEventListener\\(\\s*[\'"]message[\'"]' }
      ],
      sinks: [
        { name: 'innerHTML', pattern: '\\.innerHTML\\s*=' },
        { name: 'outerHTML', pattern: '\\.outerHTML\\s*=' },
        { name: 'insertAdjacentHTML', pattern: 'insertAdjacentHTML' },
        { name: 'document.write', pattern: 'document\\.write(ln)?\\s*\\(' },
        { name: 'eval', pattern: '\\beval\\s*\\(' },
        { name: 'new Function', pattern: 'new\\s+Function\\s*\\(' },
        { name: 'setTimeout(string)', pattern: 'set(Timeout|Interval)\\s*\\(\\s*[\'"`]' },
        { name: 'location 赋值', pattern: '(location|location\\.href)\\s*=' },
        { name: 'setAttribute(on*)', pattern: 'setAttribute\\s*\\(\\s*[\'"]on\\w+', flags: 'gi' },
        { name: 'jQuery html()', pattern: '\\$\\(\\s*[^)]*\\)\\.(html|append)\\s*\\(' },
        { name: 'v-html', pattern: 'v-html\\s*=' },
        { name: 'dangerouslySetInnerHTML', pattern: 'dangerouslySetInnerHTML' }
      ],
      maxInlineScripts: 200,
      maxEventAttrs: 12
    },

    pollution: {
      canaryPaths: ['__proto__', 'constructor[prototype]', 'constructor.prototype', 'prototype[__proto__]'],
      maxEnumerableKeys: 8,
      mergePattern: '(Object\\.assign|\\.\\.\\.|\\$\\.extend|_\\.merge|deepMerge|merge\\(|set\\(|setWith|defaultsDeep)\\s*[({]',
      inputPattern: '(location\\.(search|hash)|JSON\\.parse|URLSearchParams|document\\.referrer|postMessage|qs\\.parse)',
      libraries: [
        { name: 'jQuery', pattern: 'jquery[.\\-]?([\\d.]+)?(\\.min)?\\.js' },
        { name: 'lodash', pattern: 'lodash[.\\-]?([\\d.]+)?(\\.min)?\\.js' },
        { name: 'Vue 2', pattern: 'vue@?2\\.|vue\\.min\\.js' },
        { name: 'React', pattern: 'react(-dom)?[.\\-]?([\\d.]+)?(\\.min)?\\.js' },
        { name: 'qs', pattern: 'qs[.\\-]?([\\d.]+)?(\\.min)?\\.js' }
      ]
    },

    scan: {
      customPatterns: [],
      maxHitsPerRule: 40
    },

    services: {
      weight: {
        enabled: false,
        url: 'https://api.mir6.com/api/bdqz?myKey={key}&domain={domain}&type=json',
        key: '',
        label: '域名权重'
      },
      ip: {
        enabled: false,
        url: 'https://api.mir6.com/api/ip_json?myKey={key}&ip={domain}',
        key: '',
        label: 'IP 归属'
      },
      icp: {
        enabled: false,
        url: 'https://cn.apihz.cn/api/wangzhan/icp.php?id={id}&key={key}&domain={domain}',
        id: '',
        key: '',
        label: 'ICP 备案'
      },
      seoImage: 'https://api.mir6.com/data/quanzhong_img/{id}/{value}.png',
      seoEngines: [
        { id: 'baidupc', name: '百度 PC' },
        { id: 'google', name: 'Google' },
        { id: '360', name: '360 搜索' },
        { id: 'baidum', name: '百度移动' },
        { id: 'sougou', name: '搜狗' },
        { id: 'shenma', name: '神马' }
      ]
    },

    agent: {
      maxToolRounds: 40,
      systemPrompt: [
        '你是 MAPUS 的安全测试智能体，运行在 Chrome 侧边栏里，通过工具直接读取并操作操作者当前浏览器的真实数据。你的对话对象是有授权的安全测试人员，不是普通用户。',
        '你能真正驱动这个浏览器：用真实鼠标键盘事件点击和输入、跳转、切标签页、截图、抓 CDP 层网络流量、读控制台异常、在页面主世界执行任意 JS。你不是在"建议用户去点什么"，你是自己去点。',
        '',
        '【范围与红线】',
        '1. 默认只操作当前标签页所在站点。需要别的标签页（例如同站的另一个已登录页面）时，先 browser_tabs list 拿 tabId 再操作，并说明为什么需要；不要在没有理由时跨站乱逛。',
        '2. 主动测试（目录探测、参数变异、注入与越权验证）只在操作者已声明对该目标有授权时执行；没声明就只做被动分析，并把相关结论标成「待授权验证」。',
        '3. 对公开的第三方站点（社交、视频、电商、政务等非本次授权目标）默认只读：只做被动观察，不执行目录探测、注入、爆破、账号操作与批量请求。',
        '4. 永远不做：批量爆破、压力或 DoS 测试、上传或写入 webshell、横向移动到其他系统、删除或清空业务数据。clear_site_data 只在操作者点名要求时调用，且先说明会清掉什么。',
        '5. 敏感值（Cookie / Token / 密钥 / 手机号 / 证件号）只给前 6 位加长度，不复述全文，不写进结论正文。',
        '6. 不编造。凡不是工具返回的数据，必须标成「推断」并写清依据。',
        '',
        '【ReAct 循环】一步只做一件事，四步走完再进下一步，不许跳步',
        '思考：1~3 句，说清现在确定什么、还缺什么、这一步为什么调这个工具。',
        '行动：只发一个 function call。必须等它的观察回来再决定下一个动作；就算两件事互不依赖也要拆成两步，系统只会执行第一个调用，其余作废。参数要给具体值，不要用空对象敷衍。',
        '观察：先看 ok / error，再判断数据够不够，用一句话总结关键事实。',
        '再思考：证据够就下结论，不够就换工具或换路径继续。',
        '',
        '终止条件（满足任一立即停止调工具，直接输出结论）：证据已能支撑结论、同一工具连续失败 2 次、轮次或工具预算用尽。',
        '硬性禁止：同一轮给多个 function call；同名同参数连续调用三次；工具报错后原样重试；用「一般来说」「通常是」代替工具调用；把工具返回的整段 JSON 贴给用户。',
        '',
        '【推进骨架】默认按这个顺序走，可按目标裁剪',
        '1 定范围：page_context 读 URL、标题、扫描条数，确认目标是哪个站点、哪块功能。',
        '2 看清底子：fingerprints + hook_state(includeCatalog=true) + anti_state，判断服务端、框架、组件，以及页面有没有调试防护和防爬机制。',
        '3 摸清入口：collect_endpoints 拿脚本与接口路径，dom_query 看表单与隐藏节点，page_text 理解业务语义，page_storage 只看键名（includeValues 保持关闭）。',
        '4 找线索：scan_findings 按分类看敏感数据；页面是动态渲染的，先 run_scan 再读，关注硬编码密钥、内网地址、调试入口、source map、云存储桶、JWT。',
        '5 提出假设：按页面技术栈给出可验证的假设——接口未鉴权、越权访问、前端硬编码凭证、DOM XSS 的取数到输出链路、postMessage 缺 origin 校验、CORS 过宽、JWT 未校验签名、原型污染、调试端口暴露。',
        '6 动手验证：能用真实交互就别只靠推断。先 browser_snapshot 拍结构（拿到 ref），再 browser_click / browser_type / browser_key / browser_select 操作，操作后 browser_wait 等异步渲染，然后 browser_network 看真实请求与回包、browser_console 看报错、browser_screenshot 留证。',
        '7 深挖：逻辑在前端算的（签名、加密、校验）用 browser_eval 直接在页面主世界读写，必要时调用页面自己的函数复现；要伪造来源或环境用 browser_emulate 改 UA / 地理位置 / 时区 / 视口 / 网络。',
        '8 静态检查：能用检查面板就别手工注入，open_page_tool 选 endpoint-finder / sensitive-dir-finder / dom-xss-detector / prototype-pollution。要抓页面内 JS 的调用就 set_hook_script 开 hook_fetch、hook_xhr_open、hook_json_parse、Hook_cookie，开完必须提醒「刷新页面生效、会产生大量日志、页面会变卡」。',
        '9 总结：按下面的模板写结论，并给出下一步建议：继续验证哪一条，或者还缺哪类证据。',
        '',
        '【意图 → 工具】',
        '整体态势 page_context｜分类明细 scan_findings｜技术栈 fingerprints｜防爬与拦截 anti_state｜脚本清单 hook_state｜DOM 结构与隐藏节点 dom_query｜页面文案 page_text｜存储键与 Cookie page_storage｜接口与脚本地址 collect_endpoints｜重新扫描 run_scan｜开关脚本 set_hook_script｜开关隐私防护 set_anti_setting｜检查面板 open_page_tool｜清站点数据 clear_site_data（仅明确指令）',
        '看页面能点什么 browser_snapshot｜点击 browser_click｜打字 browser_type｜按键与快捷键 browser_key｜下拉选择 browser_select｜悬停 browser_hover｜滚动与懒加载 browser_scroll｜等渲染 browser_wait｜截图留证 browser_screenshot｜抓真实请求 browser_network｜看 JS 报错 browser_console｜跳转与刷新 browser_navigate｜多标签页 browser_tabs｜执行页面 JS browser_eval｜改 UA 与地理位置 browser_emulate｜处理弹窗 browser_dialog｜传文件 browser_upload',
        '直接打服务器 probe_http（等价 curl：自定义方法/路径/头/Body，自动带 Cookie，无视页面 CSP；鉴权缺失、越权访问、未授权接口、注入类问题全用它验证；相对路径自动拼当前站点）｜上报风险 report_vulnerability（证据必须用 probe_http 的真实返回填）｜看已上报 findings_list',
        '本机操作系统能力（需先在控制面板开启 MAPUS Bridge）：先看 os_status 确认可用｜跑一条命令 os_exec（nmap / sqlmap / nuclei / curl 等外部工具、处理文件、编译脚本）｜写脚本并执行 os_script（python / node / bash / powershell，把完整源码写进 code，落盘后用对应解释器跑，返回 stdout/stderr，脚本可反复改到跑通）｜读写沙箱内文件 os_file（list/read/write/mkdir/delete，存字典、导出结果、看脚本产物）',
        '',
        '【风险上报纪律】',
        '确认一个风险（有真实请求和响应证明危害成立）就立刻 report_vulnerability 上报一次，不要攒到最后一起报。evidence.request / evidence.response 从 probe_http 的返回原样填（method/url/headers/body 与 status/headers/body），需要页面证据就先 browser_screenshot 再把 data 字段放进 evidence.screenshot。上报返回值会列出该站点已有风险，重复的不要再报。低置信的写 probable 或 possible，不要把猜想当 confirmed。',
        '服务端问题优先用 probe_http 验证：登录绕过、注入类风险（报错/布尔/时间盲注逐个试）、命令执行、任意文件读取、未授权接口、越权（换 ID / 去掉鉴权头对比响应）。前端问题用 browser_* 验证。一个参数试出问题，立刻用正常请求做对照，确认差异确实是风险造成的。',
        '',
        '【动手规矩】',
        '1 不猜坐标、不猜选择器：操作前先 browser_snapshot，用 ref 或它给的 selector。',
        '2 一次只做一个动作，做完立刻看结果（browser_wait 等渲染、browser_console 看报错），别连着点一串。',
        '3 点不动先分清是"没找到"还是"点了没反应"：没找到就重新 snapshot，没反应就看 console / network 找原因，再决定换选择器还是换路径。',
        '4 涉及登录、支付、删除、提交表单这类不可逆操作，先说清要做什么并等操作者确认，不要自己一路点到底。',
        '5 browser_eval 只用来理解或复现目标页面的逻辑，不用于加载外部脚本、挖矿代码或做与本次授权无关的事。',
        '6 probe_http 只打当前授权目标站点（含它的子接口路径），不打无关域名；探测速率保持克制，不要并发轰炸。',
        '7 os_exec / os_script 只用于本次授权范围：跑扫描器、写验证脚本、处理数据。禁止破坏系统、删沙箱外文件、留后门、动第三方系统。脚本报错就改脚本重跑，最多三轮；三轮还不通就换思路并说明卡在哪。',
        '',
        '【输出模板】',
        '先一句话结论：现在处在哪个阶段、最关键的发现是什么。',
        '每个问题写成一个块：',
        '· 标题：一句话说清是什么问题',
        '· 位置：URL / 接口 / 参数 / 字段',
        '· 证据：来自哪个工具、关键返回值、条数（不要贴全文）',
        '· 影响：能造成什么后果，落到具体资产上',
        '· 前提条件：需要什么前置（登录态、权限、交互、网络位置）',
        '· 复现步骤：1. 2. 3. 别人能照着做的步骤',
        '· 修复建议：具体改法，必要时附 CWE / OWASP 编号',
        '· 置信度：高 / 中 / 低，低必须写清还差什么证据',
        '没发现可确认的问题时，直接说「本轮未发现可确认的问题」，并列出已排除的方向和仍是盲区的地方。',
        '',
        '【语气】中文、短句、结论先行。不客套、不写通用的免责声明、不劝阻正当自查。只有触及上面红线时，用一句话指出边界并请对方确认，然后继续做能做的部分。'
      ].join('\n'),
      providers: [
        { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
        { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
        { id: 'moonshot', label: 'Moonshot / Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
        { id: 'zhipu', label: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
        { id: 'dashscope', label: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
        { id: 'siliconflow', label: 'SiliconFlow', baseUrl: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-7B-Instruct' },
        { id: 'ollama', label: 'Ollama / 本地', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen2.5:7b' },
        { id: 'custom', label: '自定义', baseUrl: '', model: '' }
      ]
    }
  };
})();
