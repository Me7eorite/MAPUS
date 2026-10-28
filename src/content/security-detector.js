(function () {
  if (typeof window !== 'undefined' && window.__mapus_securityDetector) return;

  const CAT = {
    INFINITE_DEBUGGER: 'infiniteDebugger',
    ANTI_DEBUGGER: 'antiDebugger',
    OBFUSCATION: 'obfuscation',
    DEVTOOLS_DETECT: 'devtoolsDetect',
    ANTI_TAMPER: 'antiTamper',
    OTHER: 'other'
  };

  function run(scriptText, source) {
    if (!scriptText || typeof scriptText !== 'string') return [];
    const findings = [];
    const add = (category, level, text, detail) => {
      findings.push({ category, level, text, detail, source: source || null });
    };

    const infiniteDebuggerPatterns = [
      { re: /setInterval\s*\(\s*function\s*\([^)]*\)\s*\{\s*debugger\s*\}/gi, desc: 'setInterval + debugger' },
      { re: /setInterval\s*\(\s*\(\)\s*=>\s*\{\s*debugger\s*\}/gi, desc: 'setInterval 箭头函数 + debugger' },
      { re: /setInterval\s*\(\s*["']\s*debugger\s*["']\s*\)/gi, desc: 'setInterval("debugger")' },
      { re: /while\s*\(\s*true\s*\)\s*\{\s*debugger\s*\}/gi, desc: 'while(true) + debugger' },
      { re: /while\s*\(\s*!?\s*0\s*\)\s*\{\s*debugger\s*\}/gi, desc: 'while 死循环 + debugger' },
      { re: /Function\s*\(\s*["']debugger["']\s*\)\s*\(\s*\)/gi, desc: 'Function("debugger")()' },
      { re: /new\s+Function\s*\(\s*["']debugger["']\s*\)\s*\(\s*\)/gi, desc: 'new Function("debugger")()' },
      { re: /eval\s*\(\s*["']debugger["']\s*\)/gi, desc: 'eval("debugger")' },
      { re: /\.constructor\s*\(\s*["']debugger["']\s*\)/gi, desc: 'constructor("debugger")' },
      { re: /setTimeout\s*\(\s*function\s*\([^)]*\)\s*\{\s*debugger\s*[;\}]/gi, desc: 'setTimeout + debugger' },
      { re: /requestAnimationFrame\s*\([^)]*debugger/gi, desc: 'requestAnimationFrame + debugger' },
      { re: /\[["']debugger["']\]\s*\(\s*\)/gi, desc: '["debugger"]() 调用' }
    ];
    for (const { re, desc } of infiniteDebuggerPatterns) {
      re.lastIndex = 0;
      if (re.test(scriptText)) {
        add(CAT.INFINITE_DEBUGGER, 'danger', '无限 debugger', desc);
        break;
      }
    }

    const antiDebuggerPatterns = [
      { re: /console\.(clear|log|debug|info|warn)\s*=\s*function\s*\(/gi, desc: 'Console 方法被重写' },
      { re: /console\s*=\s*\{\s*\}/gi, desc: 'console 被置空' },
      { re: /delete\s+console\.(log|debug|info)/gi, desc: 'delete console' },
      { re: /Date\.now\s*\(\s*\)\s*[-+*\/].*setTimeout|setInterval.*Date\.now/gi, desc: '时间差检测断点' },
      { re: /performance\.now\s*\(\s*\)\s*[-+].*debugger|debugger.*performance\.now/gi, desc: 'performance 时间检测' },
      { re: /\.toString\s*=\s*function\s*\(\)\s*\{\s*return\s*["']/gi, desc: 'toString 被重写隐藏' },
      { re: /Function\.prototype\.(toString|apply|call)\s*=\s*function/gi, desc: 'Function 原型被改写' },
      { re: /Object\.defineProperty\s*\(\s*(?:window|document|navigator)\s*,/gi, desc: '关键对象 defineProperty' },
      { re: /devtools\s*[=!]==?\s*true|__REACT_DEVTOOLS|__VUE_DEVTOOLS|__REDUX_DEVTOOLS/gi, desc: 'DevTools 标识检测' },
      { re: /window\.outerWidth\s*[-+<>]|window\.outerHeight\s*[-+<>]|firebug/gi, desc: '窗口尺寸 / Firebug 检测' },
      { re: /\/\*@\s*cc_on\s*@\*\/\s*debugger/gi, desc: '条件编译 debugger' },
      { re: /debugger\s*;\s*}\s*\)\s*\(\s*\)/gi, desc: 'IIFE 内 debugger' }
    ];
    for (const { re, desc } of antiDebuggerPatterns) {
      re.lastIndex = 0;
      if (re.test(scriptText)) {
        add(CAT.ANTI_DEBUGGER, 'warn', '反 debugger / 断点检测', desc);
      }
    }

    const obfSignals = [];
    const backslashX = (scriptText.match(/\\x[0-9a-fA-F]{2}/g) || []).length;
    if (backslashX > 8) obfSignals.push('大量 \\x 转义(' + backslashX + ')');
    const unicodeEscape = (scriptText.match(/\\u[0-9a-fA-F]{4}/g) || []).length;
    if (unicodeEscape > 10) obfSignals.push('大量 \\u 转义(' + unicodeEscape + ')');
    if (/\[["'][a-zA-Z0-9_]{1,3}["']\]/.test(scriptText) && (scriptText.match(/\[["'][a-zA-Z0-9_]{1,3}["']\]/g) || []).length > 6) obfSignals.push('短字符数组索引');
    if (/eval\s*\(\s*atob\s*\(|atob\s*\([^)]+\)\s*\)\s*\)/.test(scriptText)) obfSignals.push('eval+atob 解码');
    if (/\.join\s*\(\s*["'][^"']*["']\s*\)/.test(scriptText) && (scriptText.match(/\.join\s*\(\s*["'][^"']*["']\s*\)/g) || []).length > 3) obfSignals.push('数组 join 拼接');
    const density = scriptText.length > 200 ? scriptText.replace(/\s/g, '').length / Math.max(1, (scriptText.match(/[;,{}\[\]()]/g) || []).length) : 0;
    if (density > 70) obfSignals.push('高密度/超长表达式');
    if (/^[\w\s\.\[\]\(\)\,\;\+\-\*\/\'\"\=\>\<\&\|\\]+$/.test(scriptText.slice(0, 500)) && scriptText.length > 300) obfSignals.push('高度压缩无空格');
    if (/\["\w{1,2}"\]\s*\+?\s*\["\w{1,2}"\]/.test(scriptText)) obfSignals.push('字符串碎片拼接');
    if (obfSignals.length) add(CAT.OBFUSCATION, 'warn', 'JS 混淆', obfSignals.join('、'));

    if (/devtools|__REACT_DEVTOOLS|__VUE_DEVTOOLS/.test(scriptText) && !findings.some(f => f.category === CAT.DEVTOOLS_DETECT)) {
      add(CAT.DEVTOOLS_DETECT, 'info', 'DevTools 相关引用', '存在 devtools 或框架调试标识');
    }
    if (/console\.(log|debug|info)\s*=\s*function/.test(scriptText) && !findings.some(f => f.text === 'Console 方法被重写')) {
      add(CAT.DEVTOOLS_DETECT, 'info', 'Console 被重写', '可能被用于防止调试或统计埋点');
    }

    if (/Object\.defineProperty\s*\(\s*(?:window|document)\s*,/.test(scriptText)) {
      add(CAT.ANTI_TAMPER, 'info', '关键对象 defineProperty', '可能用于防篡改或防止调试');
    }
    if (/\.toString\s*=\s*function|Function\.prototype\.toString/.test(scriptText)) {
      add(CAT.ANTI_TAMPER, 'info', 'toString 被重写', '可能被用于防止调试或隐藏代码');
    }

    return findings;
  }

  function dedupeFindings(findings) {
    const seen = new Set();
    return findings.filter(f => {
      const key = f.category + '|' + f.text + '|' + (f.detail || '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  if (typeof window !== 'undefined') {
    window.__mapus_securityDetector = {
      run,
      dedupeFindings,
      CAT
    };
  }
})();
