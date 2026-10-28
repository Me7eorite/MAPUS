(function () {
  'use strict';
  if (!window.__mapusReport) return;
  const api = window.__mapusReport.create({ title: 'DOM XSS 检测', subtitle: location.hostname });

  const cfg = window.__mapusToolConfig && window.__mapusToolConfig.xss;
  if (!cfg) {
    api.status('未获取到 XSS 规则，请从侧边栏重新运行');
    return;
  }

  const compile = (list, flags) => (Array.isArray(list) ? list : [])
    .map(item => {
      try { return { name: item.name, re: new RegExp(item.pattern, item.flags || flags || 'g') }; } catch (_) { return null; }
    })
    .filter(Boolean);

  const SOURCES = compile(cfg.sources);
  const SINKS = compile(cfg.sinks);
  const maxInline = Math.max(10, Math.min(2000, Number(cfg.maxInlineScripts) || 200));
  const maxAttrs = Math.max(0, Math.min(200, Number(cfg.maxEventAttrs) || 12));

  if (!SINKS.length) {
    api.status('规则中没有任何 sink，无法检测');
    return;
  }

  function collect(list, text) {
    const hits = [];
    for (const item of list) {
      item.re.lastIndex = 0;
      if (item.re.test(text)) hits.push(item.name);
    }
    return hits;
  }

  function snippet(text, index) {
    const start = Math.max(0, index - 60);
    return text.slice(start, index + 90).replace(/\s+/g, ' ');
  }

  try {
    let findings = 0;

    let index = 0;
    for (const script of document.querySelectorAll('script:not([src])')) {
      if (index >= maxInline) break;
      const code = script.textContent || '';
      if (code.length < 8) continue;
      index++;
      const sources = collect(SOURCES, code);
      const sinks = collect(SINKS, code);
      if (sources.length && sinks.length) {
        findings++;
        const firstSink = SINKS.find(item => { item.re.lastIndex = 0; return item.re.test(code); });
        const at = firstSink ? code.search(firstSink.re) : 0;
        api.add({
          label: '内联脚本#' + index + '：' + sinks.join(' / '),
          meta: 'source: ' + sources.join(', ') + '｜' + snippet(code, Math.max(0, at)),
          level: 'danger',
          badge: 'XSS'
        });
      } else if (sinks.length) {
        findings++;
        api.add({
          label: '内联脚本#' + index + '：危险 sink ' + sinks.join(' / '),
          meta: '未匹配到明显 source，建议人工确认数据来源',
          level: 'warn',
          badge: 'SINK'
        });
      }
    }

    const eventAttrs = [];
    for (const el of document.querySelectorAll('*')) {
      for (const attr of el.attributes || []) {
        if (/^on/i.test(attr.name) && attr.value && attr.value.length > 3) {
          eventAttrs.push({ name: attr.name, tag: el.tagName.toLowerCase(), value: attr.value.slice(0, 120) });
        }
      }
      if (el.tagName === 'A' && /^javascript:/i.test(el.getAttribute('href') || '')) {
        eventAttrs.push({ name: 'href', tag: 'a', value: (el.getAttribute('href') || '').slice(0, 120) });
      }
    }
    for (const attr of eventAttrs.slice(0, maxAttrs)) {
      findings++;
      api.add({
        label: `<${attr.tag} ${attr.name}>`,
        meta: attr.value,
        level: /eval|document\.write|innerHTML/i.test(attr.value) ? 'danger' : 'warn',
        badge: 'HTML'
      });
    }

    const hash = decodeURIComponent(location.hash || '');
    if (hash && /<|javascript:|on\w+=/i.test(hash)) {
      findings++;
      api.add({ label: 'URL hash 含可疑字符', meta: hash.slice(0, 160), level: 'warn', badge: 'URL' });
    }
    const search = decodeURIComponent(location.search || '');
    if (search && /<script|javascript:|on\w+=/i.test(search)) {
      findings++;
      api.add({ label: 'URL 查询串含可疑字符', meta: search.slice(0, 160), level: 'warn', badge: 'URL' });
    }

    if (!findings) {
      api.add({ label: '未发现明显 DOM XSS 静态特征', meta: '仅覆盖内联脚本与内联事件，外链脚本请结合「脚本」面板分析', level: 'ok', badge: 'OK' });
    }
    api.status(`静态检查完成：${findings} 处可疑`);
  } catch (error) {
    api.status('执行失败：' + error.message);
  }
})();
