(function () {
  'use strict';

  const DEFAULT_API_URL = 'https://idwcuvqskvuqpjizfpwl.supabase.co/functions/v1/braincard-api';
  const STORE = { url: 'braincard_admin_api_url', key: 'braincard_admin_anon_key', token: 'braincard_admin_token' };
  const $ = function (selector) { return document.querySelector(selector); };
  let days = 30;
  let configs = [];
  let toastTimer = null;

  function read(key) { try { return sessionStorage.getItem(key) || ''; } catch (e) { return ''; } }
  function write(key, value) { try { sessionStorage.setItem(key, value); } catch (e) {} }
  function clearSession() {
    [STORE.token, STORE.key].forEach(function (key) { try { sessionStorage.removeItem(key); } catch (e) {} });
  }
  function safeText(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('visible'); }, 2500);
  }
  function apiUrl() { return (read(STORE.url) || DEFAULT_API_URL).replace(/\/$/, ''); }

  async function request(action, payload, authenticated) {
    const anonKey = read(STORE.key);
    const headers = { 'Content-Type': 'application/json', apikey: anonKey, Authorization: 'Bearer ' + anonKey };
    if (authenticated !== false) headers['x-braincard-admin-token'] = read(STORE.token);
    const response = await fetch(apiUrl(), {
      method: 'POST', headers: headers, body: JSON.stringify(Object.assign({ action: action }, payload || {}))
    });
    const data = await response.json();
    if (response.status === 401 && authenticated !== false) {
      clearSession();
      showLogin('登录已过期，请重新登录。');
      throw new Error('登录已过期');
    }
    if (!response.ok || !data.ok) throw new Error(data.message || data.error || '请求失败');
    return data;
  }

  function showLogin(message) {
    $('#app-view').classList.add('hidden');
    $('#login-view').classList.remove('hidden');
    $('#login-error').textContent = message || '';
  }
  function showApp() {
    $('#login-view').classList.add('hidden');
    $('#app-view').classList.remove('hidden');
    loadDashboard();
  }

  async function onLogin(event) {
    event.preventDefault();
    const url = ($('#api-url').value || DEFAULT_API_URL).trim();
    const anonKey = $('#anon-key').value.trim();
    const password = $('#admin-password').value;
    const error = $('#login-error');
    error.textContent = '';
    write(STORE.url, url);
    write(STORE.key, anonKey);
    try {
      const result = await request('adminLogin', { password: password }, false);
      write(STORE.token, result.token);
      $('#admin-password').value = '';
      showApp();
    } catch (e) {
      error.textContent = e.message || '登录失败，请检查接口配置和密码。';
    }
  }

  function metricCard(title, value, hint, icon) {
    return '<article class="metric-card"><div class="metric-top"><span>' + safeText(title) + '</span><span class="metric-icon">' + icon + '</span></div><div class="metric-value">' + Number(value || 0).toLocaleString('zh-CN') + '</div><div class="metric-hint">' + safeText(hint) + '</div></article>';
  }

  function renderChart(series) {
    const chart = $('#chart');
    const metrics = [
      { key: 'new_users', cls: 'bar-user' }, { key: 'daybook_entries', cls: 'bar-daybook' },
      { key: 'status_tests', cls: 'bar-status' }, { key: 'friend_invites', cls: 'bar-invite' }
    ];
    const max = Math.max(1, ...series.flatMap(function (row) { return metrics.map(function (m) { return Number(row[m.key] || 0); }); }));
    chart.innerHTML = series.map(function (row, index) {
      const date = String(row.metric_date || '').slice(5);
      const bars = metrics.map(function (metric) {
        const value = Number(row[metric.key] || 0);
        const height = value ? Math.max(3, Math.round(value / max * 100)) : 0;
        return '<i class="bar ' + metric.cls + '" title="' + safeText(value) + '" style="height:' + height + '%"></i>';
      }).join('');
      const label = index === 0 || index === series.length - 1 || (days === 7) || date.slice(-2) === '01' ? date : '';
      return '<div class="chart-day"><div class="bar-stack">' + bars + '</div><span class="chart-label">' + safeText(label) + '</span></div>';
    }).join('');
    $('#chart-period').textContent = '近 ' + series.length + ' 天';
  }

  function renderServerConfig(config) {
    const items = [
      ['微信 AppID', config.wechatAppId], ['微信登录密钥', config.wechatSecret],
      ['提醒任务密钥', config.cronSecret], ['虚拟支付密钥', config.virtualPay]
    ];
    $('#server-config').innerHTML = items.map(function (item) {
      return '<div class="system-item"><span>' + item[0] + '</span><b class="status-pill ' + (item[1] ? 'ok' : 'missing') + '">' + (item[1] ? '已配置' : '未配置') + '</b></div>';
    }).join('');
  }

  async function loadDashboard() {
    $('#metric-grid').innerHTML = '<div class="loading-card">正在读取统计数据…</div>';
    try {
      const result = await request('adminGetDashboard', { days: days });
      const t = result.totals || {};
      $('#metric-grid').innerHTML = [
        metricCard('注册用户', t.profiles, '累计账号', '♙'),
        metricCard('同步活跃用户', result.activeUsersToday, '今日云端进度同步', '↗'),
        metricCard('日子本记录', t.daybook_entries, '累计创建条数', '♡'),
        metricCard('状态测试结果', t.daily_statuses, '累计测试结果', '✦'),
        metricCard('好友邀请', t.friend_invites, '累计发起', '⇧'),
        metricCard('好友答题', t.friend_tests, '累计完成', '✓'),
        metricCard('关系卡', t.relation_cards, '累计生成', '⌘'),
        metricCard('已支付订单', result.paidOrders, '累计订单数', '￥')
      ].join('');
      renderChart(result.series || []);
      renderServerConfig(result.serverConfig || {});
      $('#last-updated').textContent = '更新于 ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      $('#metric-grid').innerHTML = '<div class="loading-card">统计数据加载失败：' + safeText(e.message) + '</div>';
      $('#chart').innerHTML = '';
    }
  }

  async function loadConfigs() {
    $('#config-list').innerHTML = '<div class="loading-card">正在读取配置…</div>';
    try {
      const result = await request('adminListConfigs');
      configs = result.configs || [];
      if (!configs.length) {
        $('#config-list').innerHTML = '<div class="loading-card">还没有配置项，可以新建一项。</div>';
        return;
      }
      $('#config-list').innerHTML = configs.map(function (config) {
        let preview = '';
        try { preview = JSON.stringify(config.value); } catch (e) { preview = String(config.value); }
        return '<article class="config-card"><div class="config-icon">⚙</div><div class="config-main"><div class="config-key">' + safeText(config.key) + '</div><div class="config-desc">' + safeText(config.description || '暂无用途说明') + ' · 更新于 ' + safeText(formatDate(config.updated_at)) + '</div></div><code class="config-value">' + safeText(preview) + '</code><button class="button secondary" data-edit-config="' + safeText(config.key) + '">编辑</button></article>';
      }).join('');
      $('#config-list').querySelectorAll('[data-edit-config]').forEach(function (button) {
        button.addEventListener('click', function () { openConfig(button.dataset.editConfig); });
      });
    } catch (e) {
      $('#config-list').innerHTML = '<div class="loading-card">配置读取失败：' + safeText(e.message) + '</div>';
    }
  }

  async function loadAudit() {
    $('#audit-list').innerHTML = '<div class="loading-card">正在读取记录…</div>';
    try {
      const result = await request('adminListConfigAudit');
      const entries = result.entries || [];
      if (!entries.length) {
        $('#audit-list').innerHTML = '<div class="loading-card">还没有配置修改记录。</div>';
        return;
      }
      $('#audit-list').innerHTML = entries.map(function (entry) {
        return '<article class="audit-card"><div class="audit-top"><b class="audit-key">' + safeText(entry.config_key) + '</b><span class="audit-time">' + safeText(formatDate(entry.created_at)) + '</span></div><div class="audit-values"><div><b>修改前</b><pre>' + safeText(pretty(entry.previous_value)) + '</pre></div><div><b>修改后</b><pre>' + safeText(pretty(entry.new_value)) + '</pre></div></div></article>';
      }).join('');
    } catch (e) {
      $('#audit-list').innerHTML = '<div class="loading-card">记录读取失败：' + safeText(e.message) + '</div>';
    }
  }

  function pretty(value) { return value == null ? '（无）' : JSON.stringify(value, null, 2); }
  function formatDate(value) {
    if (!value) return '未知';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN', { hour12: false });
  }
  function openConfig(key) {
    const config = configs.find(function (item) { return item.key === key; });
    $('#modal-title').textContent = config ? '编辑配置' : '新建配置';
    $('#config-key').value = config ? config.key : '';
    $('#config-key').readOnly = !!config;
    $('#config-description').value = config ? (config.description || '') : '';
    $('#config-value').value = config ? JSON.stringify(config.value, null, 2) : '{\n  "enabled": false\n}';
    $('#config-error').textContent = '';
    $('#config-modal').classList.remove('hidden');
    $('#config-key').focus();
  }
  function closeModal() { $('#config-modal').classList.add('hidden'); }

  async function saveConfig(event) {
    event.preventDefault();
    const key = $('#config-key').value.trim();
    let value;
    try { value = JSON.parse($('#config-value').value); }
    catch (e) { $('#config-error').textContent = 'JSON 格式不正确：' + e.message; return; }
    const button = $('#config-save');
    button.disabled = true;
    button.textContent = '正在保存…';
    try {
      await request('adminSaveConfig', { key: key, value: value, description: $('#config-description').value.trim() });
      closeModal();
      showToast('配置已保存');
      await loadConfigs();
    } catch (e) {
      $('#config-error').textContent = e.message || '保存失败';
    } finally {
      button.disabled = false;
      button.textContent = '保存配置';
    }
  }

  function openPage(page) {
    document.querySelectorAll('.nav-item').forEach(function (button) { button.classList.toggle('active', button.dataset.page === page); });
    ['overview', 'configs', 'audit'].forEach(function (name) { $('#page-' + name).classList.toggle('hidden', name !== page); });
    $('#page-title').textContent = { overview: '数据概览', configs: '运行配置', audit: '配置记录' }[page];
    if (page === 'overview') loadDashboard();
    if (page === 'configs') loadConfigs();
    if (page === 'audit') loadAudit();
  }

  $('#login-form').addEventListener('submit', onLogin);
  $('#api-url').value = read(STORE.url) || DEFAULT_API_URL;
  $('#anon-key').value = read(STORE.key);
  $('#refresh').addEventListener('click', function () {
    const active = document.querySelector('.nav-item.active').dataset.page;
    if (active === 'overview') loadDashboard();
    if (active === 'configs') loadConfigs();
    if (active === 'audit') loadAudit();
  });
  $('#logout').addEventListener('click', function () { clearSession(); showLogin(''); });
  $('#nav').addEventListener('click', function (event) {
    const button = event.target.closest('[data-page]');
    if (button) openPage(button.dataset.page);
  });
  document.querySelectorAll('.range-switch button').forEach(function (button) {
    button.addEventListener('click', function () {
      days = Number(button.dataset.days) || 30;
      document.querySelectorAll('.range-switch button').forEach(function (item) { item.classList.toggle('selected', item === button); });
      loadDashboard();
    });
  });
  $('#add-config').addEventListener('click', function () { openConfig(''); });
  $('#config-form').addEventListener('submit', saveConfig);
  $('#modal-close').addEventListener('click', closeModal);
  $('#modal-cancel').addEventListener('click', closeModal);
  $('#config-modal').addEventListener('click', function (event) { if (event.target === $('#config-modal')) closeModal(); });

  if (read(STORE.token) && read(STORE.key)) showApp();
})();

