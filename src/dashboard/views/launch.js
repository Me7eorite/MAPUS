import { $, esc, harness, toast } from '../lib.js';
import { state, refreshTasks, refreshProfiles, emitChange } from '../store.js';

export const SETTINGS_MODEL = '__settings__';

export function modelOptions(selected) {
  const options = [];
  const config = state.agentConfig;
  if (config && config.baseUrl && config.model) {
    const keyNote = config.hasKey ? '' : '（未配置密钥）';
    options.push(`<option value="${SETTINGS_MODEL}">跟随设置里的智能体模型 · ${esc(config.model)}${esc(keyNote)}</option>`);
  }
  for (const profile of state.profiles) {
    options.push(`<option value="${profile.id}">${esc(profile.name)} · ${esc(profile.model)}</option>`);
  }
  if (!options.length) return '<option value="">尚未配置模型，先到「模型」页添加</option>';
  const html = options.join('');
  return selected && html.includes(`value="${selected}"`) ? html : html;
}

export function launchHtml(compact) {
  const selected = state.launch.profileId || (state.agentConfig && state.agentConfig.model ? SETTINGS_MODEL : '');
  return `
    <div class="launch${compact ? ' compact' : ''}">
      <textarea id="launchUrls" rows="${compact ? 3 : 5}" placeholder="一行一个站点，例如：&#10;http://localhost:1180/&#10;https://target.example.com/"></textarea>
      <div class="launch-side">
        <label class="field">
          <span>调用模型</span>
          <select id="launchModel">${modelOptions(selected)}</select>
        </label>
        <label class="field">
          <span>步数预算</span>
          <input id="launchSteps" type="number" min="1" max="200" value="${Number(state.launch.steps) || 90}">
        </label>
        <button class="btn primary block" id="btnLaunch">下发并开始扫描</button>
      </div>
    </div>
    <p class="hint-line">模型下拉里可以直接选「设置」页里已经配好的智能体模型，也可以选「模型」页里保存的档案，不用手动填地址。</p>`;
}

export function bindLaunch(root) {
  const select = $('#launchModel', root);
  if (select) {
    select.addEventListener('change', () => {
      state.launch.profileId = select.value === SETTINGS_MODEL ? '' : select.value;
      state.launch.useSettingsModel = select.value === SETTINGS_MODEL;
      emitChange('launch');
    });
    if (state.launch.profileId) select.value = state.launch.profileId;
    else if (state.agentConfig && state.agentConfig.model) select.value = SETTINGS_MODEL;
  }
  const steps = $('#launchSteps', root);
  if (steps) steps.addEventListener('change', () => { state.launch.steps = Number(steps.value) || 90; });

  const button = $('#btnLaunch', root);
  if (!button) return;
  button.addEventListener('click', async () => {
    const urls = String($('#launchUrls', root).value || '')
      .split('\n').map(line => line.trim()).filter(Boolean);
    if (!urls.length) { toast('先填至少一个站点 URL', 'error'); return; }
    const value = select ? select.value : '';
    const useSettings = value === SETTINGS_MODEL;
    if (!useSettings && !value) { toast('先选一个模型', 'error'); return; }
    button.disabled = true;
    button.textContent = '下发中…';
    const res = await harness('HARNESS_ENQUEUE', {
      urls,
      options: {
        profileId: useSettings ? '' : value,
        modelMode: useSettings ? 'settings' : 'profile',
        steps: Number(steps && steps.value) || 90
      }
    });
    button.disabled = false;
    button.textContent = '下发并开始扫描';
    if (res && res.ok) {
      $('#launchUrls', root).value = '';
      toast(`已下发 ${res.created || urls.length} 个站点`, 'ok');
      await refreshTasks();
      emitChange('task');
    } else {
      toast((res && res.error) || '下发失败', 'error');
    }
  });
}

export async function refreshModelOptions(root) {
  await refreshProfiles();
  const select = $('#launchModel', root);
  if (!select) return;
  const current = state.launch.profileId || SETTINGS_MODEL;
  select.innerHTML = modelOptions(current);
  if (select.querySelector(`option[value="${current}"]`)) select.value = current;
}
