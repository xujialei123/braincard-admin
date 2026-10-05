(function () {
  'use strict';

  const SUPABASE_URL = 'https://idwcuvqskvuqpjizfpwl.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkd2N1dnFza3Z1cXBqaXpmcHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MzgzODIsImV4cCI6MjA5NjAxNDM4Mn0.lCXo6MTLiD8CW0_E2F2TJ55prv8qlop092NStloRvyw';
  const API_URL = SUPABASE_URL + '/functions/v1/braincard-api';
  const STORE = { token: 'braincard_admin_access_token', legacyToken: 'braincard_admin_token', legacyKey: 'braincard_admin_anon_key' };
  const $ = function (selector) { return document.querySelector(selector); };
  let days = 30;
  let configs = [];
  let toastTimer = null;

  function read(key) { try { return sessionStorage.getItem(key) || ''; } catch (e) { return ''; } }
  function write(key, value) { try { sessionStorage.setItem(key, value); } catch (e) {} }
  function clearSession() {
    [STORE.token, STORE.legacyToken, STORE.legacyKey, 'braincard_admin_api_url'].forEach(function (key) {
      try { sessionStorage.removeItem(key); } catch (e) {}
    });
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
  async function request(action, payload) {
    const headers = {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + read(STORE.token)
    };
    const response = await fetch(API_URL, {
      method: 'POST', headers: headers, body: JSON.stringify(Object.assign({ action: action }, payload || {}))
    });
    const data = await response.json();
    if (response.status === 401 || response.status === 403) {
      const message = response.status === 403
        ? '该 Supabase 账号没有后台权限。'
        : '登录已过期，请重新登录。';
      clearSession();
      showLogin(message);
      throw new Error(data.message || message);
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
    const email = $('#admin-email').value.trim();
    const password = $('#admin-password').value;
    const error = $('#login-error');
    error.textContent = '';
    try {
      const response = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ email: email, password: password })
      });
      const result = await response.json();
      if (!response.ok || !result.access_token) {
        throw new Error(result.msg || result.message || '邮箱或密码不正确。');
      }
      write(STORE.token, result.access_token);
      $('#admin-password').value = '';
      showApp();
    } catch (e) {
      error.textContent = e.message || '登录失败，请检查 Supabase Auth 账号和密码。';
    }
  }

  function metricCard(title, value, hint) {
    return '<article class="metric-card"><div class="metric-top"><span>' + safeText(title) + '</span></div><div class="metric-value">' + safeText(value) + '</div><div class="metric-hint">' + safeText(hint) + '</div></article>';
  }

  function formatCount(value) {
    return Number(value || 0).toLocaleString('zh-CN');
  }

  function formatRate(num, den) {
    const n = Number(num || 0);
    const d = Number(den || 0);
    if (!d) return '—';
    return (Math.round(n / d * 1000) / 10).toFixed(1) + '%';
  }

  function formatYuan(fen) {
    return '¥' + (Number(fen || 0) / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function characterName(id) {
    const meta = characterMeta(id);
    return meta && meta.name && meta.name !== id ? (id + ' ' + meta.name) : String(id || '');
  }

  function renderBars(target, series, metrics) {
    const chart = $(target);
    if (!chart) return;
    const max = Math.max(1, ...series.flatMap(function (row) {
      return metrics.map(function (m) { return Number(row[m.key] || 0); });
    }));
    chart.innerHTML = series.map(function (row, index) {
      const date = String(row.metric_date || '').slice(5);
      const bars = metrics.map(function (metric) {
        const value = Number(row[metric.key] || 0);
        const height = value ? Math.max(3, Math.round(value / max * 100)) : 0;
        return '<i class="bar ' + metric.cls + '" title="' + safeText(metric.label + ' ' + value) + '" style="height:' + height + '%"></i>';
      }).join('');
      const label = index === 0 || index === series.length - 1 || (days === 7) || date.slice(-2) === '01' ? date : '';
      return '<div class="chart-day"><div class="bar-stack">' + bars + '</div><span class="chart-label">' + safeText(label) + '</span></div>';
    }).join('');
  }

  function renderRank(target, rows, valueKey, hintKey) {
    const el = $(target);
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) {
      el.innerHTML = '<div class="loading-card">所选范围内暂无数据。</div>';
      return;
    }
    const max = Math.max(1, ...list.map(function (row) { return Number(row[valueKey] || 0); }));
    el.innerHTML = list.map(function (row, index) {
      const amount = Number(row[valueKey] || 0);
      const extra = hintKey ? (' · ' + formatCount(row[hintKey]) + ' 次获得') : '';
      return '<div class="rank-row"><span class="rank-n">' + (index + 1) + '</span><div class="rank-main"><b>' + safeText(characterName(row.character_id)) + '</b><i class="rank-bar" style="width:' + Math.round(amount / max * 100) + '%"></i></div><span class="rank-val">' + formatCount(amount) + extra + '</span></div>';
    }).join('');
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
    $('#rate-grid').innerHTML = '';
    try {
      const result = await request('adminGetDashboard', { days: days });
      const t = result.totals || {};
      const snap = result.snapshot || {};
      const period = snap.period || {};
      const funnel = snap.funnel || {};
      const retention = snap.retention || {};
      const vip = snap.vip || {};
      const revenue = snap.revenue || {};
      const shares = snap.daybook_shares || {};
      const identity = snap.identity || {};
      const used = Number(identity.profiles_used || 0);
      const wxUsers = Number(identity.profiles_wx || 0);
      const allProfiles = Number(identity.profiles_all || t.profiles || 0);
      $('#metric-grid').innerHTML = [
        metricCard('有效用户', formatCount(used), '测过状态 / 写过日子 / 有图鉴，不含仅打开'),
        metricCard('微信账号', formatCount(wxUsers), '静默登录建档，含测朋友打开；改过昵称 ' + formatCount(identity.profiles_named)),
        metricCard('全部档案', formatCount(allProfiles), '含未绑微信游客 ' + formatCount(identity.profiles_device) + ' · 打开过进度 ' + formatCount(identity.profiles_opened)),
        metricCard('今日活跃', formatCount(result.activeUsersToday), '云端进度同步'),
        metricCard('区间活跃', formatCount(period.active_users), '近 ' + days + ' 天有同步'),
        metricCard('状态测试', formatCount(t.daily_statuses), '累计结果 · 近窗 ' + formatCount(period.status_tests)),
        metricCard('日子本', formatCount(t.daybook_entries), '累计条目 · 近窗 ' + formatCount(period.daybook_entries)),
        metricCard('图鉴解锁', formatCount(t.collection_unlocks), '用户×角色 · 近窗 ' + formatCount(period.collection_unlocks)),
        metricCard('好友邀请', formatCount(t.friend_invites), '累计发起 · 近窗 ' + formatCount(period.friend_invites)),
        metricCard('好友答题', formatCount(t.friend_tests), '累计完成 · 近窗 ' + formatCount(period.friend_tests)),
        metricCard('关系卡', formatCount(t.relation_cards), '累计生成 · 近窗 ' + formatCount(period.relation_cards)),
        metricCard('同类互动', formatCount(t.peer_reactions), '累计轻互动 · 近窗 ' + formatCount(period.peer_reactions)),
        metricCard('日子同步', formatCount(t.daybook_shares), '待确认 ' + formatCount(shares.pending) + ' · 已接受 ' + formatCount(shares.accepted)),
        metricCard('有效会员', formatCount(vip.active), 'Plus ' + formatCount(vip.plus) + ' / Pro ' + formatCount(vip.pro)),
        metricCard('已支付订单', formatCount(t.paid_orders), '近窗 ' + formatCount(period.paid_orders)),
        metricCard('支付金额', formatYuan(revenue.paid_amount_fen), '近窗 ' + formatYuan(revenue.period_amount_fen))
      ].join('');
      $('#rate-grid').innerHTML = [
        metricCard('首测完成率', formatRate(funnel.status_users, wxUsers), formatCount(funnel.status_users) + ' 人测过状态 / 微信账号'),
        metricCard('日子本渗透', formatRate(funnel.daybook_users, used), formatCount(funnel.daybook_users) + ' 人写过日子 / 有效用户'),
        metricCard('图鉴渗透', formatRate(funnel.collection_users, used), formatCount(funnel.collection_users) + ' 人有云端图鉴 / 有效用户'),
        metricCard('好友完成率', formatRate(period.friend_tests, period.friend_invites), '近窗答题 / 邀请；累计 ' + formatRate(t.friend_tests, t.friend_invites)),
        metricCard('关系卡生成率', formatRate(period.relation_cards, period.friend_tests), '近窗关系卡 / 答题；累计 ' + formatRate(t.relation_cards, t.friend_tests)),
        metricCard('日子同步接受率', formatRate(shares.accepted, t.daybook_shares), '已接受 / 全部同步请求'),
        metricCard('付费转化', formatRate(funnel.paid_users, wxUsers), formatCount(funnel.paid_users) + ' 人付过费 / 微信账号'),
        metricCard('D1 留存', formatRate(retention.d1_returned, retention.d1_cohort), '昨日新用户 ' + formatCount(retention.d1_cohort) + '，今日仍同步 ' + formatCount(retention.d1_returned)),
        metricCard('D7 留存', formatRate(retention.d7_returned, retention.d7_cohort), '7 日前新用户 ' + formatCount(retention.d7_cohort) + '，今日仍同步 ' + formatCount(retention.d7_returned)),
        metricCard('人均持有角色', funnel.avg_characters == null ? '0' : String(funnel.avg_characters), '有图鉴用户平均 · 相对有效用户 ' + (used ? (Number(t.collection_unlocks || 0) / used).toFixed(2) : '0')),
        metricCard('状态互动率', funnel.avg_reactions_per_status == null ? '0' : String(funnel.avg_reactions_per_status), '每条状态卡平均互动次数')
      ].join('');
      const series = result.series || [];
      renderBars('#chart', series, [
        { key: 'new_users', cls: 'bar-user', label: '新用户' },
        { key: 'active_users', cls: 'bar-active', label: '活跃' },
        { key: 'status_tests', cls: 'bar-status', label: '状态测试' },
        { key: 'friend_invites', cls: 'bar-invite', label: '好友邀请' }
      ]);
      renderBars('#chart-social', series, [
        { key: 'daybook_entries', cls: 'bar-daybook', label: '日子本' },
        { key: 'relation_cards', cls: 'bar-card', label: '关系卡' },
        { key: 'daybook_shares', cls: 'bar-share', label: '日子同步' },
        { key: 'paid_orders', cls: 'bar-pay', label: '已支付' }
      ]);
      $('#chart-period').textContent = '近 ' + series.length + ' 天';
      $('#chart-period-social').textContent = '近 ' + series.length + ' 天';
      renderRank('#top-status', snap.top_status_characters, 'amount');
      renderRank('#top-collection', snap.top_collection_characters, 'owners', 'copies');
      renderServerConfig(result.serverConfig || {});
      $('#last-updated').textContent = '更新于 ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      $('#metric-grid').innerHTML = '<div class="loading-card">统计数据加载失败：' + safeText(e.message) + '</div>';
      $('#chart').innerHTML = '';
      $('#chart-social').innerHTML = '';
      $('#rate-grid').innerHTML = '';
      $('#top-status').innerHTML = '';
      $('#top-collection').innerHTML = '';
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
        if (preview.length > 100) preview = preview.slice(0, 97) + '...';
        return '<article class="config-card" data-edit-config="' + safeText(config.key) + '" role="button" tabindex="0">' +
          '<div class="config-icon">⚙</div>' +
          '<div class="config-main">' +
            '<div class="config-key-row"><div class="config-key">' + safeText(config.key) + '</div></div>' +
            '<div class="config-desc">' + safeText(config.description || '暂无用途说明') + ' · 更新于 ' + safeText(formatDate(config.updated_at)) + '</div>' +
            '<code class="config-value">' + safeText(preview) + '</code>' +
          '</div>' +
          '<button class="button secondary config-edit-btn" type="button" data-edit-config="' + safeText(config.key) + '">编辑</button>' +
          '</article>';
      }).join('');
    } catch (e) {
      $('#config-list').innerHTML = '<div class="loading-card">配置读取失败：' + safeText(e.message) + '</div>';
    }
  }

  function findConfig(key) {
    return configs.find(function (item) { return item.key === key; }) || null;
  }

  function parseConfigValue(raw, fallback) {
    if (raw == null) return fallback;
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch (e) { return fallback; }
    }
    return raw;
  }

  function boolChecked(value) {
    return value === true || value === 'true' || value === 1 || value === '1';
  }

  function field(label, html, full) {
    return '<label class="' + (full ? 'full' : '') + '">' + label + html + '</label>';
  }

  function inputHtml(name, value, attrs) {
    return '<input name="' + name + '" value="' + safeText(value == null ? '' : value) + '" ' + (attrs || '') + '>';
  }

  function textareaHtml(name, value, rows) {
    return '<textarea name="' + name + '" rows="' + (rows || 3) + '" spellcheck="false">' + safeText(value == null ? '' : value) + '</textarea>';
  }

  function selectHtml(name, value, options) {
    return '<select class="ops-select" name="' + name + '">' + options.map(function (opt) {
      const selected = opt === value ? ' selected' : '';
      return '<option value="' + safeText(opt) + '"' + selected + '>' + safeText(opt) + '</option>';
    }).join('') + '</select>';
  }

  async function saveOpsConfig(key, value, description) {
    await request('adminSaveConfig', { key: key, value: value, description: description });
    showToast(key + ' 已保存');
  }

  function renderVipPanel(config) {
    const visible = boolChecked(config && config.value);
    return '<section class="ops-panel" data-ops="vip_entry_visible"><h3>会员入口</h3><p class="ops-desc">控制「我的」页是否显示会员栏。关闭后小程序隐藏入口，无需发版。</p><div class="ops-row"><span>显示会员入口</span><label class="ops-toggle"><input type="checkbox" name="vip_visible"' + (visible ? ' checked' : '') + '> 开启</label></div><div class="ops-actions"><button class="button primary" type="button" data-save-ops="vip_entry_visible">保存</button></div></section>';
  }

  function renderAdsPanel(config) {
    const value = parseConfigValue(config && config.value, {}) || {};
    return '<section class="ops-panel" data-ops="rewarded_ads"><h3>激励广告</h3><p class="ops-desc">需填写有效微信广告位 ID 并开启后，小程序才展示看视频恢复次数。</p><div class="ops-grid">' +
      field('启用广告', '<label class="ops-toggle"><input type="checkbox" name="enabled"' + (value.enabled === true ? ' checked' : '') + '> 开启</label>') +
      field('广告位 ID', inputHtml('rewardAdUnitId', value.rewardAdUnitId || '', 'placeholder="adunit-xxxx"')) +
      field('恢复次数', inputHtml('restoreAmount', value.restoreAmount != null ? value.restoreAmount : 5, 'type="number" min="1" max="50"')) +
      field('每日上限', inputHtml('maxPerDay', value.maxPerDay != null ? value.maxPerDay : 1, 'type="number" min="1" max="10"')) +
      field('超时毫秒', inputHtml('timeoutMs', value.timeoutMs != null ? value.timeoutMs : 90000, 'type="number" min="10000" max="180000"')) +
      field('按钮文案（可选）', inputHtml('buttonText', value.buttonText || '', 'maxlength="32"')) +
      '</div><div class="ops-actions"><button class="button primary" type="button" data-save-ops="rewarded_ads">保存</button></div></section>';
  }

  function renderGameplayPanel(config) {
    const value = parseConfigValue(config && config.value, {}) || {};
    return '<section class="ops-panel" data-ops="gameplay"><h3>玩法数值</h3><p class="ops-desc">每日翻卡、分享恢复、会员加成。小程序启动后读取，失败时回落本地默认值。</p><div class="ops-grid">' +
      field('每日翻卡次数', inputHtml('dailyDrawLimit', value.dailyDrawLimit != null ? value.dailyDrawLimit : 10, 'type="number" min="1" max="50"')) +
      field('会员每日加成', inputHtml('vipDailyBonus', value.vipDailyBonus != null ? value.vipDailyBonus : 3, 'type="number" min="0" max="30"')) +
      field('分享恢复次数', inputHtml('shareRestoreAmount', value.shareRestoreAmount != null ? value.shareRestoreAmount : 5, 'type="number" min="1" max="50"')) +
      field('分享每日上限', inputHtml('maxShareResetPerDay', value.maxShareResetPerDay != null ? value.maxShareResetPerDay : 2, 'type="number" min="0" max="20"')) +
      field('启用分享恢复', '<label class="ops-toggle"><input type="checkbox" name="shareRestoreEnabled"' + (value.shareRestoreEnabled !== false ? ' checked' : '') + '> 开启</label>') +
      '</div><div class="ops-actions"><button class="button primary" type="button" data-save-ops="gameplay">保存</button></div></section>';
  }

  function renderAnnouncementPanel(config) {
    const value = parseConfigValue(config && config.value, {}) || {};
    return '<section class="ops-panel" data-ops="home_announcement"><h3>首页公告</h3><p class="ops-desc">开启后首页弹一次；version 变化才会再弹。适合维护通知或活动说明。</p><div class="ops-grid">' +
      field('启用公告', '<label class="ops-toggle"><input type="checkbox" name="enabled"' + (value.enabled === true ? ' checked' : '') + '> 开启</label>') +
      field('版本号（变更才再弹）', inputHtml('version', value.version || '', 'placeholder="2026-09-30-a"')) +
      field('标题', inputHtml('title', value.title || '', 'maxlength="40"'), true) +
      field('正文', textareaHtml('content', value.content || '', 4), true) +
      '</div><div class="ops-actions"><button class="button primary" type="button" data-save-ops="home_announcement">保存</button></div></section>';
  }

  function renderPaymentPanel(config) {
    const products = Array.isArray(parseConfigValue(config && config.value, []))
      ? parseConfigValue(config.value, [])
      : [];
    const cards = products.map(function (product, index) {
      return '<div class="ops-item-card" data-product-index="' + index + '"><div class="ops-item-head"><b>' + safeText(product.id || ('商品 ' + (index + 1))) + '</b><label class="ops-toggle"><input type="checkbox" name="enabled"' + (product.enabled !== false ? ' checked' : '') + '> 上架</label></div><div class="ops-grid">' +
        field('商品 ID', inputHtml('id', product.id || '', 'required')) +
        field('名称', inputHtml('name', product.name || '')) +
        field('会员天数', inputHtml('vipDays', product.vipDays != null ? product.vipDays : 30, 'type="number" min="1"')) +
        field('价格（分）', inputHtml('amountFen', product.amountFen != null ? product.amountFen : 490, 'type="number" min="1"')) +
        field('等级', inputHtml('vipLevel', product.vipLevel || 'plus')) +
        field('说明', inputHtml('description', product.description || ''), true) +
        '</div><div class="ops-inline"><button class="button secondary" type="button" data-remove-product="' + index + '">删除</button></div></div>';
    }).join('') || '<div class="loading-card">还没有套餐，点下方添加。</div>';
    return '<section class="ops-panel" data-ops="payment_products"><h3>会员商品</h3><p class="ops-desc">虚拟支付套餐。价格单位为分，须与微信虚拟支付道具价格一致。</p><div data-products>' + cards + '</div><div class="ops-actions"><button class="button secondary" type="button" data-add-product>＋ 添加套餐</button><button class="button primary" type="button" data-save-ops="payment_products">保存</button></div></section>';
  }

  function renderCatalogPanel(config) {
    let packs = parseConfigValue(config && config.value, []);
    if (packs && !Array.isArray(packs) && Array.isArray(packs.packs)) packs = packs.packs;
    if (!Array.isArray(packs)) packs = [];
    const cards = packs.map(function (pack, index) {
      const unlock = pack.unlock && typeof pack.unlock === 'object' ? pack.unlock : null;
      const characterIds = Array.isArray(pack.characterIds) ? pack.characterIds.join(',') : (pack.characterIds == null ? '' : String(pack.characterIds));
      const teaser = Array.isArray(pack.teaserHints) ? pack.teaserHints.join(' / ') : '';
      return '<div class="ops-item-card" data-pack-index="' + index + '"><div class="ops-item-head"><b>' + safeText(pack.id || ('pack-' + index)) + '</b>' +
        selectHtml('status', pack.status || 'coming', ['open', 'coming', 'locked', 'ended', 'cleared']) +
        '</div><div class="ops-grid">' +
        field('ID', inputHtml('id', pack.id || '')) +
        field('标题', inputHtml('title', pack.title || '')) +
        field('副标题', inputHtml('subtitle', pack.subtitle || ''), true) +
        field('关卡展示', inputHtml('season', pack.season || '')) +
        field('角标', inputHtml('badge', pack.badge || '')) +
        field('排序', inputHtml('sort', pack.sort != null ? pack.sort : index, 'type="number"')) +
        field('封面 URL', inputHtml('cover', pack.cover || ''), true) +
        field('角色 ID（逗号分隔，空=本地全量）', inputHtml('characterIds', characterIds), true) +
        field('预告词（/ 分隔）', inputHtml('teaserHints', teaser), true) +
        field('解锁依赖包 ID', inputHtml('requirePackId', unlock && unlock.requirePackId || '')) +
        field('解锁最低完成%', inputHtml('minUnlockPercent', unlock && unlock.minUnlockPercent != null ? unlock.minUnlockPercent : '', 'type="number" min="0" max="100"')) +
        '</div><div class="ops-inline"><button class="button secondary" type="button" data-remove-pack="' + index + '">删除篇章</button></div></div>';
    }).join('') || '<div class="loading-card">还没有篇章配置。</div>';
    return '<section class="ops-panel" data-ops="catalog_packs"><h3>图鉴篇章</h3><p class="ops-desc">闯关包远程配置。status=open 可进入；远程整表替换时请保留首章。</p><div data-packs>' + cards + '</div><div class="ops-actions"><button class="button secondary" type="button" data-add-pack>＋ 添加篇章</button><button class="button primary" type="button" data-save-ops="catalog_packs">保存</button></div></section>';
  }

  async function loadOps() {
    const root = $('#ops-root');
    root.innerHTML = '<div class="loading-card">正在读取运营配置…</div>';
    try {
      const result = await request('adminListConfigs');
      configs = result.configs || [];
      root.innerHTML = [
        renderVipPanel(findConfig('vip_entry_visible')),
        renderAdsPanel(findConfig('rewarded_ads')),
        renderGameplayPanel(findConfig('gameplay')),
        renderAnnouncementPanel(findConfig('home_announcement')),
        renderPaymentPanel(findConfig('payment_products'))
      ].join('');
      bindOpsEvents();
    } catch (e) {
      root.innerHTML = '<div class="loading-card">运营配置读取失败：' + safeText(e.message) + '</div>';
    }
  }

  function readPanelInputs(panel) {
    const data = {};
    panel.querySelectorAll('input, textarea, select').forEach(function (el) {
      if (!el.name) return;
      if (el.type === 'checkbox') data[el.name] = el.checked;
      else data[el.name] = el.value;
    });
    return data;
  }

  function collectProducts(panel) {
    return Array.from(panel.querySelectorAll('[data-product-index]')).map(function (card) {
      const data = {};
      card.querySelectorAll('input').forEach(function (el) {
        if (!el.name) return;
        data[el.name] = el.type === 'checkbox' ? el.checked : el.value;
      });
      return {
        id: String(data.id || '').trim(),
        type: 'vip',
        name: String(data.name || '').trim(),
        vipLevel: String(data.vipLevel || 'plus').trim() || 'plus',
        vipDays: Number(data.vipDays) || 30,
        amountFen: Number(data.amountFen) || 0,
        enabled: data.enabled === true,
        description: String(data.description || '').trim()
      };
    }).filter(function (item) { return item.id; });
  }

  function collectPacks(panel) {
    return Array.from(panel.querySelectorAll('[data-pack-index]')).map(function (card) {
      const data = {};
      card.querySelectorAll('input, select').forEach(function (el) {
        if (!el.name) return;
        data[el.name] = el.type === 'checkbox' ? el.checked : el.value;
      });
      const idsRaw = String(data.characterIds || '').trim();
      let characterIds = null;
      if (idsRaw) {
        characterIds = idsRaw.split(/[,，\s]+/).map(function (id) { return id.trim(); }).filter(Boolean);
      }
      const teaserRaw = String(data.teaserHints || '').trim();
      const teaserHints = teaserRaw
        ? teaserRaw.split(/\s*\/\s*/).map(function (s) { return s.trim(); }).filter(Boolean)
        : [];
      const requirePackId = String(data.requirePackId || '').trim();
      const minUnlockPercent = data.minUnlockPercent === '' || data.minUnlockPercent == null
        ? null
        : Number(data.minUnlockPercent);
      let unlock = null;
      if (requirePackId || minUnlockPercent != null) {
        unlock = {};
        if (requirePackId) unlock.requirePackId = requirePackId;
        if (minUnlockPercent != null && Number.isFinite(minUnlockPercent)) unlock.minUnlockPercent = minUnlockPercent;
      }
      return {
        id: String(data.id || '').trim(),
        title: String(data.title || '').trim(),
        subtitle: String(data.subtitle || '').trim(),
        season: String(data.season || '').trim(),
        status: String(data.status || 'coming').trim(),
        sort: Number(data.sort) || 0,
        badge: String(data.badge || '').trim(),
        cover: String(data.cover || '').trim(),
        characterIds: characterIds,
        themeHint: 'chapter',
        teaserHints: teaserHints,
        unlock: unlock
      };
    }).filter(function (item) { return item.id; });
  }

  function bindOpsEvents() {
    const root = $('#ops-root');
    root.querySelectorAll('[data-save-ops]').forEach(function (button) {
      button.addEventListener('click', async function () {
        const key = button.dataset.saveOps;
        const panel = root.querySelector('[data-ops="' + key + '"]');
        if (!panel) return;
        button.disabled = true;
        try {
          if (key === 'vip_entry_visible') {
            const visible = !!panel.querySelector('[name="vip_visible"]').checked;
            await saveOpsConfig(key, visible, '我的页「会员」栏是否显示；true 显示，false 隐藏');
          } else if (key === 'rewarded_ads') {
            const data = readPanelInputs(panel);
            await saveOpsConfig(key, {
              enabled: !!data.enabled,
              rewardAdUnitId: String(data.rewardAdUnitId || '').trim(),
              restoreAmount: Number(data.restoreAmount) || 5,
              maxPerDay: Number(data.maxPerDay) || 1,
              timeoutMs: Number(data.timeoutMs) || 90000,
              buttonText: String(data.buttonText || '').trim()
            }, '激励广告开关与参数；enabled=true 且 rewardAdUnitId 为有效微信广告位 ID 后才开放');
          } else if (key === 'gameplay') {
            const data = readPanelInputs(panel);
            await saveOpsConfig(key, {
              dailyDrawLimit: Number(data.dailyDrawLimit) || 10,
              shareRestoreEnabled: !!data.shareRestoreEnabled,
              shareRestoreAmount: Number(data.shareRestoreAmount) || 5,
              maxShareResetPerDay: Number(data.maxShareResetPerDay) || 0,
              vipDailyBonus: Number(data.vipDailyBonus) || 0
            }, '玩法数值：每日翻卡、分享恢复、会员每日加成');
          } else if (key === 'home_announcement') {
            const data = readPanelInputs(panel);
            await saveOpsConfig(key, {
              enabled: !!data.enabled,
              title: String(data.title || '').trim(),
              content: String(data.content || '').trim(),
              version: String(data.version || '').trim()
            }, '首页运营公告；enabled=true 且有文案时弹出；version 变化才再弹一次');
          } else if (key === 'payment_products') {
            await saveOpsConfig(key, collectProducts(panel), '虚拟支付会员套餐；enabled=false 可下架；金额单位为分');
          }
          await loadOps();
        } catch (e) {
          showToast(e.message || '保存失败');
        } finally {
          button.disabled = false;
        }
      });
    });

    const addProduct = root.querySelector('[data-add-product]');
    if (addProduct) {
      addProduct.addEventListener('click', function () {
        const panel = root.querySelector('[data-ops="payment_products"]');
        const products = collectProducts(panel);
        products.push({
          id: 'plus_new',
          type: 'vip',
          name: '新套餐',
          vipLevel: 'plus',
          vipDays: 30,
          amountFen: 490,
          enabled: false,
          description: ''
        });
        const config = findConfig('payment_products') || { value: products };
        config.value = products;
        panel.outerHTML = renderPaymentPanel(config);
        bindOpsEvents();
      });
    }

    root.querySelectorAll('[data-remove-product]').forEach(function (button) {
      button.addEventListener('click', function () {
        const panel = root.querySelector('[data-ops="payment_products"]');
        const products = collectProducts(panel);
        const index = Number(button.dataset.removeProduct);
        products.splice(index, 1);
        const config = { value: products };
        panel.outerHTML = renderPaymentPanel(config);
        bindOpsEvents();
      });
    });
  }

  function characterList() {
    return Array.isArray(window.BRAINCARD_CHARACTERS) ? window.BRAINCARD_CHARACTERS : [];
  }

  function characterMeta(id) {
    const key = String(id || '').toUpperCase();
    return characterList().find(function (item) { return item.id === key; }) || {
      id: key, name: key, chapter: '', rarity: '', image: ''
    };
  }

  function fileToPayload(file) {
    if (!file) return Promise.reject(new Error('请选择图片'));
    if (file.size > 2500000) return Promise.reject(new Error('图片请小于 2.5MB'));
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        resolve({
          imageBase64: String(reader.result || ''),
          contentType: file.type || 'image/jpeg'
        });
      };
      reader.onerror = function () { reject(new Error('读取图片失败')); };
      reader.readAsDataURL(file);
    });
  }

  function renderCatalogStudio(config) {
    let packs = parseConfigValue(config && config.value, []);
    if (packs && !Array.isArray(packs) && Array.isArray(packs.packs)) packs = packs.packs;
    if (!Array.isArray(packs)) packs = [];
    const cards = packs.map(function (pack, index) {
      const unlock = pack.unlock && typeof pack.unlock === 'object' ? pack.unlock : null;
      const ids = Array.isArray(pack.characterIds) ? pack.characterIds : [];
      const chips = ids.map(function (id) {
        const meta = characterMeta(id);
        return '<span class="char-chip">' + safeText(meta.id + ' ' + meta.name) + '</span>';
      }).join('') || '<span class="muted small-text">尚未指定角色</span>';
      const cover = pack.cover
        ? '<img class="cover-preview" src="' + safeText(pack.cover) + '" alt="">'
        : '<div class="cover-preview empty">无封面</div>';
      return '<div class="ops-item-card catalog-card" data-pack-index="' + index + '">' +
        '<div class="ops-item-head"><b>' + safeText(pack.id || ('pack-' + index)) + '</b>' +
        selectHtml('status', pack.status || 'coming', ['open', 'coming', 'locked', 'ended', 'cleared']) +
        '</div><div class="catalog-layout">' + cover +
        '<div class="ops-grid">' +
        field('ID', inputHtml('id', pack.id || '')) +
        field('标题', inputHtml('title', pack.title || '')) +
        field('副标题', inputHtml('subtitle', pack.subtitle || ''), true) +
        field('关卡展示', inputHtml('season', pack.season || '')) +
        field('角标', inputHtml('badge', pack.badge || '')) +
        field('排序', inputHtml('sort', pack.sort != null ? pack.sort : index, 'type="number"')) +
        field('封面 URL', inputHtml('cover', pack.cover || ''), true) +
        field('角色 ID（逗号分隔）', inputHtml('characterIds', ids.join(',')), true) +
        field('预告词（/ 分隔）', inputHtml('teaserHints', Array.isArray(pack.teaserHints) ? pack.teaserHints.join(' / ') : ''), true) +
        field('解锁依赖包 ID', inputHtml('requirePackId', unlock && unlock.requirePackId || '')) +
        field('解锁最低完成%', inputHtml('minUnlockPercent', unlock && unlock.minUnlockPercent != null ? unlock.minUnlockPercent : '', 'type="number" min="0" max="100"')) +
        '</div></div><div class="chip-row">' + chips + '</div>' +
        '<div class="ops-inline">' +
        '<button class="button secondary" type="button" data-upload-cover="' + index + '">上传封面</button>' +
        '<button class="button secondary" type="button" data-remove-pack="' + index + '">删除篇章</button>' +
        '</div></div>';
    }).join('') || '<div class="loading-card">还没有篇章配置。</div>';
    return '<section class="ops-panel" data-ops="catalog_packs"><p class="ops-desc">status=open 可进入。角色 ID 用逗号分隔，例如 C001,C002。封面可填 URL 或点上传。</p><div data-packs>' + cards + '</div><div class="ops-actions"><button class="button primary" type="button" data-save-ops="catalog_packs">保存图鉴配置</button></div></section>';
  }

  async function loadCatalog() {
    const root = $('#catalog-root');
    root.innerHTML = '<div class="loading-card">正在读取图鉴配置…</div>';
    try {
      const result = await request('adminListConfigs');
      configs = result.configs || [];
      root.innerHTML = renderCatalogStudio(findConfig('catalog_packs'));
      bindCatalogEvents();
    } catch (e) {
      root.innerHTML = '<div class="loading-card">图鉴配置读取失败：' + safeText(e.message) + '</div>';
    }
  }

  function bindCatalogEvents() {
    const root = $('#catalog-root');
    const saveBtn = root.querySelector('[data-save-ops="catalog_packs"]');
    if (saveBtn) {
      saveBtn.addEventListener('click', async function () {
        const panel = root.querySelector('[data-ops="catalog_packs"]');
        saveBtn.disabled = true;
        try {
          await saveOpsConfig('catalog_packs', collectPacks(panel), '图鉴篇章闯关包；可远程改标题/状态/角色列表/解锁门槛，无需发版');
          await loadCatalog();
        } catch (e) {
          showToast(e.message || '保存失败');
        } finally {
          saveBtn.disabled = false;
        }
      });
    }
    root.querySelectorAll('[data-remove-pack]').forEach(function (button) {
      button.addEventListener('click', function () {
        const panel = root.querySelector('[data-ops="catalog_packs"]');
        const packs = collectPacks(panel);
        packs.splice(Number(button.dataset.removePack), 1);
        root.innerHTML = renderCatalogStudio({ value: packs });
        bindCatalogEvents();
      });
    });
    root.querySelectorAll('[data-upload-cover]').forEach(function (button) {
      button.addEventListener('click', function () {
        const input = $('#cover-file');
        input.dataset.packIndex = button.dataset.uploadCover;
        input.value = '';
        input.click();
      });
    });
  }

  async function loadArt() {
    const root = $('#art-root');
    root.innerHTML = '<div class="loading-card">正在读取角色立绘…</div>';
    try {
      const result = await request('adminListConfigs');
      configs = result.configs || [];
      artImages = parseConfigValue(findConfig('character_images') && findConfig('character_images').value, {}) || {};
      renderArtGrid();
    } catch (e) {
      root.innerHTML = '<div class="loading-card">立绘读取失败：' + safeText(e.message) + '</div>';
    }
  }

  let artImages = {};
  let artQuery = '';

  function renderArtGrid() {
    const q = String(artQuery || '').trim().toLowerCase();
    const images = artImages && typeof artImages === 'object' ? artImages : {};
    const list = characterList().filter(function (item) {
      if (!q) return true;
      return (item.id + ' ' + item.name + ' ' + item.chapter + ' ' + item.rarity).toLowerCase().indexOf(q) >= 0;
    });
    $('#art-root').innerHTML = list.map(function (item) {
      const override = images[item.id] || '';
      const src = override || item.image || '';
      return '<article class="art-card">' +
        '<img class="art-thumb" src="' + safeText(src) + '" alt="' + safeText(item.name) + '">' +
        '<div class="art-meta"><b>' + safeText(item.id) + ' ' + safeText(item.name) + '</b>' +
        '<span>' + safeText(item.chapter) + ' · ' + safeText(item.rarity) + (override ? ' · 已覆盖' : '') + '</span></div>' +
        '<div class="ops-inline">' +
        '<button class="button primary" type="button" data-upload-art="' + safeText(item.id) + '">更换立绘</button>' +
        (override ? '<button class="button secondary" type="button" data-clear-art="' + safeText(item.id) + '">恢复默认</button>' : '') +
        '</div></article>';
    }).join('') || '<div class="loading-card">没有匹配的角色。</div>';
    $('#art-root').querySelectorAll('[data-upload-art]').forEach(function (button) {
      button.addEventListener('click', function () {
        const input = $('#art-file');
        input.dataset.characterId = button.dataset.uploadArt;
        input.value = '';
        input.click();
      });
    });
    $('#art-root').querySelectorAll('[data-clear-art]').forEach(function (button) {
      button.addEventListener('click', async function () {
        try {
          const res = await request('adminClearCharacterImage', { characterId: button.dataset.clearArt });
          artImages = res.images || {};
          renderArtGrid();
          showToast('已恢复默认立绘');
        } catch (e) {
          showToast(e.message || '恢复失败');
        }
      });
    });
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
    const configKey = String(key || '').trim();
    const config = configKey ? configs.find(function (item) { return item.key === configKey; }) : null;
    $('#modal-title').textContent = config ? '编辑配置' : '新建配置';
    $('#config-key').value = config ? config.key : '';
    $('#config-key').readOnly = !!config;
    $('#config-key').classList.toggle('is-readonly', !!config);
    $('#config-description').value = config ? (config.description || '') : '';
    $('#config-value').value = config ? JSON.stringify(config.value, null, 2) : '{\n  "enabled": false\n}';
    $('#config-error').textContent = '';
    $('#config-modal').classList.remove('hidden');
    if (config) $('#config-value').focus();
    else $('#config-key').focus();
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
    ['overview', 'ops', 'catalog', 'art', 'configs', 'audit'].forEach(function (name) { $('#page-' + name).classList.toggle('hidden', name !== page); });
    $('#page-title').textContent = { overview: '数据概览', ops: '运营配置', catalog: '图鉴篇章', art: '角色立绘', configs: '运行配置', audit: '配置记录' }[page];
    if (page === 'overview') loadDashboard();
    if (page === 'ops') loadOps();
    if (page === 'catalog') loadCatalog();
    if (page === 'art') loadArt();
    if (page === 'configs') loadConfigs();
    if (page === 'audit') loadAudit();
  }

  $('#login-form').addEventListener('submit', onLogin);
  $('#refresh').addEventListener('click', function () {
    const active = document.querySelector('.nav-item.active').dataset.page;
    if (active === 'overview') loadDashboard();
    if (active === 'ops') loadOps();
    if (active === 'catalog') loadCatalog();
    if (active === 'art') loadArt();
    if (active === 'configs') loadConfigs();
    if (active === 'audit') loadAudit();
  });
  $('#logout').addEventListener('click', function () {
    const accessToken = read(STORE.token);
    clearSession();
    showLogin('');
    if (accessToken) {
      fetch(SUPABASE_URL + '/auth/v1/logout', {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + accessToken }
      }).catch(function () {});
    }
  });
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
  $('#config-list').addEventListener('click', function (event) {
    const target = event.target.closest('[data-edit-config]');
    if (!target || !$('#config-list').contains(target)) return;
    event.preventDefault();
    openConfig(target.getAttribute('data-edit-config') || '');
  });
  $('#config-list').addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target.closest('[data-edit-config]');
    if (!target || target.tagName === 'BUTTON') return;
    event.preventDefault();
    openConfig(target.getAttribute('data-edit-config') || '');
  });
  $('#config-form').addEventListener('submit', saveConfig);
  $('#modal-close').addEventListener('click', closeModal);
  $('#modal-cancel').addEventListener('click', closeModal);
  $('#config-modal').addEventListener('click', function (event) { if (event.target === $('#config-modal')) closeModal(); });
  $('#add-pack').addEventListener('click', function () {
    const panel = $('#catalog-root').querySelector('[data-ops="catalog_packs"]');
    const packs = panel ? collectPacks(panel) : [];
    packs.push({
      id: 'ch-new',
      title: '新篇章',
      subtitle: '',
      season: '新关',
      status: 'coming',
      sort: packs.length * 10,
      badge: '预告',
      cover: '',
      characterIds: [],
      teaserHints: [],
      unlock: null
    });
    $('#catalog-root').innerHTML = renderCatalogStudio({ value: packs });
    bindCatalogEvents();
  });
  $('#art-search').addEventListener('input', function () {
    artQuery = this.value || '';
    if ($('#page-art').classList.contains('hidden')) return;
    renderArtGrid();
  });
  $('#art-file').addEventListener('change', async function () {
    const file = this.files && this.files[0];
    const characterId = this.dataset.characterId || '';
    this.value = '';
    if (!file || !characterId) return;
    try {
      const payload = await fileToPayload(file);
      const res = await request('adminUploadCharacterImage', {
        characterId: characterId,
        imageBase64: payload.imageBase64,
        contentType: payload.contentType
      });
      artImages = res.images || {};
      renderArtGrid();
      showToast('立绘已更新');
    } catch (e) {
      showToast(e.message || '上传失败');
    }
  });
  $('#cover-file').addEventListener('change', async function () {
    const file = this.files && this.files[0];
    const index = Number(this.dataset.packIndex);
    this.value = '';
    const panel = $('#catalog-root').querySelector('[data-ops="catalog_packs"]');
    if (!file || !panel || Number.isNaN(index)) return;
    const packs = collectPacks(panel);
    const pack = packs[index];
    if (!pack || !pack.id) {
      showToast('请先填写篇章 ID 再上传封面');
      return;
    }
    try {
      const payload = await fileToPayload(file);
      const res = await request('adminUploadCatalogCover', {
        packId: pack.id,
        imageBase64: payload.imageBase64,
        contentType: payload.contentType
      });
      packs[index].cover = res.coverUrl || packs[index].cover;
      $('#catalog-root').innerHTML = renderCatalogStudio({ value: packs });
      bindCatalogEvents();
      showToast('封面已上传，记得保存图鉴配置');
    } catch (e) {
      showToast(e.message || '封面上传失败');
    }
  });

  if (read(STORE.token)) showApp();
})();

