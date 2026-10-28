(function () {
  'use strict';
  if (!window.__mapusReport) return;
  const api = window.__mapusReport.create({ title: '原型污染检测', subtitle: location.hostname });

  const cfg = window.__mapusToolConfig && window.__mapusToolConfig.pollution;
  if (!cfg) {
    api.status('未获取到原型污染规则，请从侧边栏重新运行');
    return;
  }

  const build = (pattern, flags) => {
    try { return new RegExp(pattern, flags || ''); } catch (_) { return null; }
  };

  const CANARY_PATHS = Array.isArray(cfg.canaryPaths) ? cfg.canaryPaths.filter(Boolean) : [];
  const maxKeys = Math.max(1, Math.min(50, Number(cfg.maxEnumerableKeys) || 8));
  const MERGE = build(cfg.mergePattern);
  const INPUT = build(cfg.inputPattern);
  const LIBRARIES = (Array.isArray(cfg.libraries) ? cfg.libraries : [])
    .map(item => ({ name: item.name, re: build(item.pattern, 'i') }))
    .filter(item => item.re);

  function checkUrl() {
    if (!CANARY_PATHS.length) return false;
    const search = location.search + location.hash;
    let decoded = '';
    try { decoded = decodeURIComponent(search); } catch (_) { decoded = search; }
    const hit = CANARY_PATHS.find(path => decoded.includes(path));
    if (!hit) return false;
    api.add({
      label: 'URL 携带原型链参数：' + hit,
      meta: decoded.slice(0, 180),
      level: 'danger',
      badge: 'URL'
    });
    return true;
  }

  function checkPrototype() {
    const suspicious = [];
    for (const key in {}) {
      suspicious.push(key);
      if (suspicious.length > maxKeys) break;
    }
    if (suspicious.length) {
      api.add({
        label: 'Object.prototype 已被写入属性',
        meta: '检测到可枚举键：' + suspicious.join(', ') + '（可能是页面已有污染或框架扩展）',
        level: 'warn',
        badge: 'POLLUTE'
      });
      return true;
    }
    return false;
  }

  function checkInline() {
    if (!MERGE || !INPUT) return 0;
    let count = 0;
    let index = 0;
    for (const script of document.querySelectorAll('script:not([src])')) {
      const code = script.textContent || '';
      if (code.length < 20) continue;
      index++;
      if (MERGE.test(code) && INPUT.test(code)) {
        count++;
        const at = Math.max(0, code.search(MERGE));
        api.add({
          label: '内联脚本#' + index + '：疑似递归合并 + 外部输入',
          meta: code.slice(Math.max(0, at - 40), at + 120).replace(/\s+/g, ' '),
          level: 'warn',
          badge: 'MERGE'
        });
      }
    }
    return count;
  }

  function checkKnownLibraries() {
    if (!LIBRARIES.length) return 0;
    const html = document.documentElement.innerHTML;
    const hits = [];
    for (const lib of LIBRARIES) {
      const match = html.match(lib.re);
      if (match) hits.push(lib.name + (match[1] ? ' ' + match[1] : ''));
    }
    if (hits.length) {
      api.add({
        label: '可能受影响的库/框架',
        meta: hits.join(' · ') + '——请核对其递归合并 API 是否接收外部输入',
        level: 'info',
        badge: 'LIB'
      });
    }
    return hits.length;
  }

  try {
    const results = [checkUrl(), checkPrototype(), checkInline() > 0, checkKnownLibraries() > 0];
    if (!results.some(Boolean)) {
      api.add({ label: '未发现原型污染的可疑链路', level: 'ok', badge: 'OK' });
    }
    api.status('被动检测完成（未写入任何污染数据）');
  } catch (error) {
    api.status('执行失败：' + error.message);
  }
})();
