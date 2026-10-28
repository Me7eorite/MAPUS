(function () {
  'use strict';
  if (!window.__mapusReport) return;
  const api = window.__mapusReport.create({ title: '敏感目录探测', subtitle: location.origin });

  const cfg = (window.__mapusToolConfig && window.__mapusToolConfig.probe) || null;
  const wordlist = cfg && Array.isArray(cfg.wordlist) ? cfg.wordlist.filter(Boolean) : [];

  if (!wordlist.length) {
    api.status('未获取到目录字典，请在「设置 → 字典与规则」里检查后从侧边栏重新运行');
    return;
  }

  const allowed = new Set(Array.isArray(cfg.acceptStatus) && cfg.acceptStatus.length
    ? cfg.acceptStatus
    : [200, 201, 204, 301, 302, 401, 403, 500]);
  const concurrency = Math.max(1, Math.min(20, Number(cfg.concurrency) || 5));
  const timeoutMs = Math.max(1000, Math.min(60000, Number(cfg.timeoutMs) || 6000));
  const credentials = ['omit', 'same-origin', 'include'].includes(cfg.credentials) ? cfg.credentials : 'omit';
  const redirect = cfg.followRedirect === false ? 'manual' : 'follow';

  function classify(status) {
    if (status === 200) return 'danger';
    if (status === 401 || status === 403) return 'warn';
    if (status >= 300 && status < 400) return 'warn';
    return 'info';
  }

  async function probe(path) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(new URL(path, location.origin).href, {
        method: 'GET',
        credentials,
        cache: 'no-store',
        redirect,
        signal: controller.signal
      });
      const body = await response.text();
      return {
        path,
        status: response.status,
        length: body.length,
        type: response.headers.get('content-type') || ''
      };
    } catch (error) {
      return { path, status: 0, error: error.name === 'AbortError' ? '超时' : '请求失败' };
    } finally {
      clearTimeout(timer);
    }
  }

  async function run() {
    let cursor = 0;
    let done = 0;
    const hits = [];
    api.status(`探测 0/${wordlist.length}…`);

    async function worker() {
      while (cursor < wordlist.length) {
        const path = wordlist[cursor++];
        const result = await probe(path);
        done++;
        api.progress(done, wordlist.length);
        api.status(`探测 ${done}/${wordlist.length}…`);
        if (result.status && allowed.has(result.status)) hits.push(result);
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, wordlist.length) }, worker));

    api.clear();
    hits.sort((a, b) => a.status - b.status);
    if (!hits.length) {
      api.add({ label: '未发现可访问的敏感路径（不代表绝对安全）', level: 'ok', badge: 'OK' });
    }
    for (const hit of hits) {
      api.add({
        label: '/' + hit.path,
        meta: [hit.type, hit.length + ' 字节'].filter(Boolean).join(' · '),
        level: classify(hit.status),
        badge: String(hit.status)
      });
    }
    api.status(`完成：${hits.length} 个可疑路径 / 共 ${wordlist.length} 条字典`);
  }

  run().catch(error => api.status('执行失败：' + error.message));
})();
