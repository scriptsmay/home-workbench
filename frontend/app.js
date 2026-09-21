/* ==================================================================
   1. 图标（圆头线框，stroke 2.25，随文字颜色）
   ================================================================== */
const ICONS = {
  today:
    '<path d="M4 11.2 12 4.6l8 6.6"/><path d="M6.6 9.9V19h10.8V9.9"/><path d="M10.5 19v-4.4h3V19"/>',
  wants:
    '<path d="M6.6 7.6h10.8l1 11.9H5.6z"/><path d="M9.4 7.6V6.3a2.6 2.6 0 0 1 5.2 0v1.3"/>',
  stock:
    '<rect x="4" y="7.4" width="16" height="12.2" rx="2.6"/><path d="M4 12.4h16"/><path d="M10 10.4h4"/>',
  expire: '<circle cx="12" cy="12" r="7.8"/><path d="M12 7.6V12l3.2 2"/>',
  settings:
    '<path d="M4 7.5h8.4M17.4 7.5H20M4 16.5h2.6M11.6 16.5H20"/><circle cx="15" cy="7.5" r="2.4"/><circle cx="9.2" cy="16.5" r="2.4"/>',
  plus: '<path d="M12 6v12M6 12h12"/>',
  minus: '<path d="M6 12h12"/>',
  check: '<path d="M5 12.6 9.4 17 19 7.2"/>',
  close: '<path d="M7 7l10 10M17 7 7 17"/>',
  edit: '<path d="M5.5 18.5h3.6L19 8.6 15.4 5 5.5 14.9z"/><path d="M13.8 6.6 17.4 10.2"/>',
  cart: '<circle cx="9.2" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/><path d="M3.5 4.5h2.3l2.4 9.6h9.6l2-7H6.5"/>',
  trash:
    '<path d="M5 7.4h14"/><path d="M9.4 7.4V5.5h5.2v1.9"/><path d="M7 7.4 8 19.4h8l1-12"/>',
  undo: '<path d="M4.6 9.4h9.2a4.6 4.6 0 1 1 0 9.2H8.6"/><path d="M8.2 5.4 4 9.4l4.2 4"/>',
  cal: '<rect x="4" y="6.4" width="16" height="13.6" rx="2.6"/><path d="M4 10.6h16M8.6 4.4v3.6M15.4 4.4v3.6"/>',
  spark:
    '<path d="M12 4.5l1.7 4.6 4.6 1.7-4.6 1.7L12 17.1l-1.7-4.6L5.7 10.8l4.6-1.7z"/>',
  my: '<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/>',
  sync: '<path d="M4 12a8 8 0 0 1 13.7-5.7L20 8M20 4v4h-4"/><path d="M20 12a8 8 0 0 1-13.7 5.7L4 16M4 20v-4h4"/>',
  link: '<path d="M9 15l6-6"/><path d="M10.5 6.5l1-1a3.5 3.5 0 0 1 5 5l-1 1"/><path d="M13.5 17.5l-1 1a3.5 3.5 0 0 1-5-5l1-1"/>',
  download: '<path d="M12 4v10M8 10l4 4 4-4"/><path d="M4 18h16"/>',
  logout:
    '<path d="M14 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2"/><path d="M18 14l4-2-4-2"/><path d="M22 12h-8"/>',
};
function icon(name, size) {
  const s = size || 20;
  return (
    '<svg class="ic" viewBox="0 0 24 24" width="' +
    s +
    '" height="' +
    s +
    '" fill="none" ' +
    'stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    (ICONS[name] || '') +
    '</svg>'
  );
}
/* ==================================================================
   2. 模块定义表（新增页签只改这里）
   ================================================================== */
const MODULES = [
  { id: 'today', name: '今日', glyph: 'today', sub: '家里今天要办的事' },
  {
    id: 'wants',
    name: '要买什么',
    glyph: 'wants',
    sub: '想买的、家人要的，先记下来',
  },
  { id: 'stock', name: '家里有啥', glyph: 'stock', sub: '库存台账与买回记录' },
  {
    id: 'expire',
    name: '快过期了',
    glyph: 'expire',
    sub: '按到期日分档，该用就用该扔就扔',
  },
  { id: 'my', name: '我的', glyph: 'my', sub: '登录与同步状态' },
];
/* ==================================================================
   3. 数据层（唯一出口，业务代码里不出现裸 localStorage）
   ================================================================== */
const DEFAULTS = {
  schemaVersion: 1,
  // 必须是 '' 而非 null：load() / importState() 的字段合并按 typeof 分派，
  // 而 typeof null === 'object'，会让字符串型 updatedAt 永远写不回来，
  // 导致设备读回后时间戳恒为 null、云端更新无法下发（2026-09-21 修复）。
  updatedAt: '',
  tab: 'today',
  shopName: '暖心小屋',
  tagline: '细水长流，岁岁年年',
  members: ['全家', '我', '老公', '孩子', '爸妈', '宠物'],
  cats: ['食品', '零食', '日用', '清洁', '洗护', '纸品', '药品', '其他'],
  places: ['厨房', '冰箱', '卫生间', '阳台', '储物间', '卧室', '客厅'],
  freshDays: 7,
  soonDays: 30,
  items: [],
  wants: [],
  logs: [],
  ui: {
    stockFilter: 'all',
    stockCat: '',
    stockPlace: '',
    stockQ: '',
    wantsDone: false,
    stockSub: 'items',
  },
};
const STORAGE_KEY = 'warm-home-workbench.v1';
const store = {
  _s: null,
  storageBroken: false,
  defaults() {
    return JSON.parse(JSON.stringify(DEFAULTS));
  },
  get s() {
    if (!this._s) this.load();
    return this._s;
  },
  load() {
    let raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      this.storageBroken = true;
    }
    let data = {};
    if (raw) {
      try {
        data = JSON.parse(raw) || {};
      } catch (e) {
        data = {};
      }
    }
    const base = this.defaults();
    Object.keys(base).forEach(function (k) {
      if (!(k in data) || data[k] == null) return;
      if (Array.isArray(base[k])) {
        if (Array.isArray(data[k])) base[k] = data[k];
      } else if (typeof base[k] === 'object') {
        if (typeof data[k] === 'object')
          base[k] = Object.assign(base[k], data[k]);
      } else base[k] = data[k];
    });
    this._s = base;
    return base;
  },
  save() {
    // 真实修改时间：合并方向判定的唯一依据（2026-09-21 覆盖事故根因修复）
    this._s.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._s));
    } catch (e) {
      toast('本地存不下更多数据了，建议先导出备份');
    }
    if (cloudSync.enabled && authStore.isAuthenticated()) cloudSyncPush();
  },
  touch() {
    this.save();
  },
  /* 采购需求 */
  addWant(row) {
    row._id = uid();
    row.createdAt = todayStr();
    row.status = 'todo';
    this.s.wants.unshift(row);
    this.save();
  },
  updateWant(id, patch) {
    const w = this.s.wants.find((x) => x._id === id);
    if (w) {
      Object.assign(w, patch);
      this.save();
    }
  },
  removeWant(id) {
    this.s.wants = this.s.wants.filter((x) => x._id !== id);
    this.save();
  },
  /* 库存 */
  addItem(row) {
    row._id = uid();
    row.addedAt = todayStr();
    this.s.items.unshift(row);
    this.save();
    return row;
  },
  getItem(id) {
    return this.s.items.find((x) => x._id === id);
  },
  updateItem(id, patch) {
    const it = this.getItem(id);
    if (it) {
      Object.assign(it, patch);
      this.save();
    }
  },
  removeItem(id) {
    this.s.items = this.s.items.filter((x) => x._id !== id);
    this.save();
  },
  /* 流水 */
  addLog(row) {
    row._id = uid();
    if (!row.date) row.date = todayStr();
    this.s.logs.unshift(row);
    this.save();
  },
  removeLog(id) {
    this.s.logs = this.s.logs.filter((x) => x._id !== id);
    this.save();
  },
  /* 备份 */
  exportState() {
    // 不再注入 exportedAt：它曾被当作「本地修改时间」参与合并比较，恒等于 now，
    // 导致本地数据永远被判为最新（2026-09-21 匿名数据覆盖云端事故根因）。
    // JSON 备份的导出戳由 csv.exportJSON() 自行补充。
    return JSON.parse(JSON.stringify(this.s));
  },
  importState(data) {
    const base = this.defaults();
    Object.keys(base).forEach(function (k) {
      if (k in data && data[k] != null) {
        if (Array.isArray(base[k])) {
          if (Array.isArray(data[k])) base[k] = data[k];
        } else if (typeof base[k] === 'object') {
          if (typeof data[k] === 'object')
            base[k] = Object.assign(base[k], data[k]);
        } else base[k] = data[k];
      }
    });
    this._s = base;
    this.save();
  },
};
/* ==================================================================
   3.1 云同步通道（CloudBase 云函数 HTTP API，v0.4 弃用 jssdk）
   ================================================================== */
const API_BASE =
  'https://trial-sh-d1gqznm4577d6a062-1251520283.ap-shanghai.app.tcloudbase.com/api';
// file:// 打开时 origin 为 null，跨域请求无合法 CORS，云功能整体不可用；本地功能不受影响
const CLOUD_ENABLED = location.protocol !== 'file:';
let cloudSync = {
  enabled: false,
  lastSync: null,
  syncing: false,
  mergeLock: false,
  pending: 0,
  queueTimer: null,
  lastPushTime: 0,
  throttleMs: 5000,
};
async function apiPost(path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (authStore.a.token) headers['Authorization'] = 'Bearer ' + authStore.a.token;
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(body || {}),
  });
  let data = null;
  try {
    data = await res.json();
  } catch (e) {}
  return { status: res.status, data: data };
}
function handleSessionExpired() {
  authStore.set({ status: 'anonymous', token: null, tokenExp: null });
  cloudSync.enabled = false;
  toast('登录状态已失效，请重新登录');
  render();
}
function syncStatus() {
  if (!cloudSync.enabled) return { mode: 'off', text: '未开启同步' };
  if (cloudSync.syncing) return { mode: 'syncing', text: '同步中…' };
  if (cloudSync.pending > 0)
    return { mode: 'pending', text: '待同步 ' + cloudSync.pending + ' 条' };
  if (cloudSync.lastSync) return { mode: 'synced', text: '已同步' };
  return { mode: 'idle', text: '等待同步' };
}
function mergeData(local, remote, localWins) {
  const result = JSON.parse(JSON.stringify(local));
  const localTime = new Date(
    local.updatedAt || local.exportedAt || 0,
  ).getTime();
  const remoteTime = new Date(
    remote.updatedAt || remote.exportedAt || 0,
  ).getTime();
  // localWins=true：本地权威（遗留无时间戳数据），只允许远端补空键，不覆盖
  const useRemote = !localWins && remoteTime >= localTime;
  for (const key in remote) {
    if (!Object.prototype.hasOwnProperty.call(remote, key)) continue;
    const localVal = local[key];
    const remoteVal = remote[key];
    if (remoteVal == null && localVal != null) {
      result[key] = localVal;
    } else if (localVal == null && remoteVal != null) {
      result[key] = remoteVal;
    } else if (useRemote) {
      result[key] = remoteVal;
    }
  }
  return result;
}
async function cloudSyncPush() {
  if (!cloudSync.enabled || cloudSync.syncing || cloudSync.mergeLock) return;
  if (!authStore.isAuthenticated()) return;
  const now = Date.now();
  if (now - cloudSync.lastPushTime < cloudSync.throttleMs) {
    cloudSync.pending++;
    if (!cloudSync.queueTimer) {
      cloudSync.queueTimer = setTimeout(function () {
        cloudSync.queueTimer = null;
        cloudSync.pending = 0;
        cloudSyncPush();
      }, cloudSync.throttleMs);
    }
    return;
  }
  cloudSync.lastPushTime = now;
  cloudSync.syncing = true;
  try {
    const state = store.exportState();
    const r = await apiPost('/sync/push', {
      data: state,
      updatedAt: state.updatedAt || new Date().toISOString(),
    });
    if (r.status === 401) {
      handleSessionExpired();
      return;
    }
    if (r.status === 200 && r.data && r.data.ok) {
      cloudSync.lastSync = r.data.updatedAt || new Date().toISOString();
      authStore.set({ lastSyncAt: cloudSync.lastSync });
      // 断网/多端期间以服务端字段级合并结果为准对齐本地（save 在 syncing 中不会再触发 push）
      if (r.data.data && cloudMergeRemote({ data: r.data.data, updatedAt: r.data.updatedAt })) {
        render();
      }
      console.log('数据已同步到云端');
    }
  } catch (e) {
    console.warn('同步失败:', e.message);
  } finally {
    cloudSync.syncing = false;
  }
}
/* 拉取结果三态（含忙碌/未登录哨兵）：
 *   'data'  云端有数据（含 data/updatedAt）
 *   'empty' 云端无数据（首次建号场景）
 *   'error' 网络或服务异常——云端状态未知，调用方禁止据此推送本地
 *   'busy'  已有同步在途
 * 不依赖 cloudSync.enabled：登录/会话恢复流程需在开同步之前先拉取。 */
async function cloudSyncPull() {
  if (cloudSync.syncing) return { status: 'busy' };
  if (!authStore.isAuthenticated()) return { status: 'off' };
  cloudSync.syncing = true;
  try {
    const r = await apiPost('/sync/pull', {});
    if (r.status === 401) {
      handleSessionExpired();
      return { status: 'error' };
    }
    if (r.status === 200 && r.data && r.data.ok) {
      if (r.data.data) {
        cloudSync.lastSync = new Date().toISOString();
        authStore.set({ lastSyncAt: cloudSync.lastSync });
        return {
          status: 'data',
          data: r.data.data,
          updatedAt: r.data.updatedAt,
        };
      }
      // 200 且 data:null = 云端无数据，首次同步正常现象
      return { status: 'empty' };
    }
    console.warn('拉取失败: HTTP ' + r.status);
    return { status: 'error' };
  } catch (e) {
    console.warn('拉取失败:', e.message);
    return { status: 'error' };
  } finally {
    cloudSync.syncing = false;
  }
}
/* 手动「立即同步」：拉取合并 → 推送本地，两端对齐 */
async function syncNow() {
  if (!authStore.isAuthenticated()) {
    toast('请先登录');
    return;
  }
  toast('同步中…');
  const r = await cloudSyncPull();
  if (r.status === 'error' || r.status === 'busy') {
    toast('云端数据拉取失败，请稍后重试');
    return;
  }
  if (r.status === 'data' && cloudMergeRemote(r)) render();
  cloudSync.enabled = true;
  cloudSyncPush();
}
function applyRemoteState(data) {
  // 合并回写期间持锁：importState→save 不得再触发 push（防写回放大）
  cloudSync.mergeLock = true;
  try {
    store.importState(data);
  } finally {
    cloudSync.mergeLock = false;
  }
}
function localBusinessEmpty(st) {
  return !st.items.length && !st.wants.length && !st.logs.length;
}
function cloudMergeRemote(remoteDoc) {
  if (
    !remoteDoc ||
    remoteDoc.status === 'error' ||
    remoteDoc.status === 'busy' ||
    !remoteDoc.data
  )
    return false;
  const localState = store.exportState();
  const remoteData = remoteDoc.data;
  /* 空云端不得「清空」有数据的本地（2026-09-21 事故善后期追加）：
   * 事故后云端可能仍是空文档（或被人为清空），若不加这道闸，任何一台
   * 存有数据的设备一登录就会被空云端覆盖——而那正是找回数据的最后机会。
   * 代价：云端刻意清空不会自动下发到有数据的设备，需在本机清空并等待推送。 */
  if (localBusinessEmpty(remoteData) && !localBusinessEmpty(localState)) {
    console.log('云端业务数据为空、本地有数据：保留本地，不做覆盖');
    return false;
  }
  const remoteTime = new Date(
    remoteDoc.updatedAt || remoteData.updatedAt || remoteData.exportedAt || 0,
  ).getTime();
  /* 本地态三分支：
   * 1) 处女态：无 updatedAt 且业务数组全空（新设备初始数据）→ 无条件全量采用云端；
   * 2) 遗留态：无 updatedAt 但有数据（修复上线前的存量本地数据）→ 本地权威，
   *    只补空键——防止被（可能已污染的）云端文档整包反噬，保住老设备好数据；
   * 3) 新格式：真实时间戳比较，云端新则整包取云端，否则字段级合并。 */
  if (!localState.updatedAt && localBusinessEmpty(localState)) {
    applyRemoteState(remoteData);
    console.log('新设备初始数据，已全量采用云端');
    return true;
  }
  if (!localState.updatedAt) {
    const merged = mergeData(localState, remoteData, true);
    if (JSON.stringify(merged) !== JSON.stringify(localState)) {
      applyRemoteState(merged);
      console.log('遗留本地数据权威合并（只补空键）');
      return true;
    }
    return false;
  }
  const localTime = new Date(localState.updatedAt).getTime();
  if (remoteTime > localTime) {
    applyRemoteState(remoteData);
    console.log('云端数据更新，已合并');
    return true;
  }
  const merged = mergeData(localState, remoteData);
  if (JSON.stringify(merged) !== JSON.stringify(localState)) {
    applyRemoteState(merged);
    console.log('数据已字段级合并');
    return true;
  }
  return false;
}
/* ==================================================================
   3.2 用户认证模块（hw_auth 独立于业务数据）
   ================================================================== */
const AUTH_KEY = 'hw-auth.v1';
const authStore = {
  _a: null,
  defaults() {
    return {
      status: 'anonymous',
      uid: null,
      nickname: null,
      token: null,
      tokenExp: null,
      loginAt: null,
      lastSyncAt: null,
    };
  },
  get a() {
    if (!this._a) this.load();
    return this._a;
  },
  load() {
    let raw = null;
    try {
      raw = localStorage.getItem(AUTH_KEY);
    } catch (e) {}
    let data = {};
    if (raw) {
      try {
        data = JSON.parse(raw) || {};
      } catch (e) {
        data = {};
      }
    }
    this._a = Object.assign(this.defaults(), data);
    return this._a;
  },
  save() {
    try {
      localStorage.setItem(AUTH_KEY, JSON.stringify(this._a));
    } catch (e) {}
  },
  set(patch) {
    Object.assign(this._a, patch);
    this.save();
  },
  isAuthenticated() {
    return !!(this._a && this._a.status === 'authenticated' && this._a.token);
  },
};
function tokenValid() {
  const a = authStore.a;
  return !!(a.token && (!a.tokenExp || new Date(a.tokenExp).getTime() > Date.now()));
}
async function checkAuth() {
  if (!CLOUD_ENABLED) return false;
  const a = authStore.a;
  if (a.status === 'authenticated' && tokenValid()) {
    // 只验会话有效性；enabled 延迟到 pull 合并完成后由调用方开启
    return true;
  }
  if (a.token && !tokenValid()) {
    authStore.set({ status: 'anonymous', token: null, tokenExp: null });
  }
  return false;
}
let loggingIn = false;
async function login(username, password) {
  if (!CLOUD_ENABLED) {
    toast('云同步需通过网站访问使用，本地功能不受影响');
    return false;
  }
  if (loggingIn) return false;
  loggingIn = true;
  try {
    const res = await fetch(API_BASE + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password }),
    });
    let data = null;
    try {
      data = await res.json();
    } catch (e) {}
    if (res.status === 200 && data && data.ok) {
      authStore.set({
        status: 'authenticated',
        uid: data.uid,
        nickname: data.username,
        token: data.token,
        tokenExp: data.expiresAt,
        loginAt: new Date().toISOString(),
      });
      toast('登录成功');
      /* 先拉取合并，完成后才开自动同步（enabled 延迟开启，
       * 关闭「登录竞态窗口内一次 save 即把本地态推上云端」的通道） */
      const remote = await cloudSyncPull();
      if (remote.status === 'data') {
        if (cloudMergeRemote(remote)) {
          render();
          toast('已同步云端数据');
        }
        cloudSync.enabled = true;
      } else if (remote.status === 'empty') {
        cloudSync.enabled = true;
        cloudSyncPush();
      } else {
        // error / busy：云端状态未知，不开自动同步，避免盲推本地
        toast('云端数据拉取失败，暂未开启自动同步；请稍后在「我的」里点「立即同步」');
      }
      return true;
    }
    if (res.status === 429) toast('尝试过于频繁，请稍后再试');
    else toast((data && data.error && data.error.message) || '登录失败，请检查用户名和密码');
    return false;
  } catch (e) {
    toast('网络异常，请检查网络后重试');
    return false;
  } finally {
    loggingIn = false;
  }
}
function logout() {
  authStore.set(authStore.defaults());
  cloudSync.enabled = false;
  toast('已退出登录');
  render();
}
async function bindOpenId() {
  toast('绑定功能将在小程序端上线后开放');
}
async function mergeAccounts() {
  toast('合并功能将在小程序端上线后开放');
}
function openLoginModal() {
  if (!CLOUD_ENABLED) {
    toast('云同步需通过网站访问使用，本地功能不受影响');
    return;
  }
  openModal({
    title: '登录',
    sub: '账号由管理员开通。登录后开启云端同步，多设备数据自动合并。',
    body:
      '<form id="modalForm" class="form-grid">' +
      fText('username', '用户名', '', '请输入用户名', 'text', true, 'wide') +
      fText('password', '密码', '', '请输入密码', 'password', true, 'wide') +
      '</form>',
    submitText: '登录',
    onSubmit: async function (d) {
      const ok = await login(d.username, d.password);
      if (ok) {
        closeModal();
        render();
      }
    },
  });
}
const el = (id) => document.getElementById(id);
const S = () => store.s;
const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c];
  });
}
function pad(n) {
  return String(n).padStart(2, '0');
}
function fmtDate(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function fmtDateTime(d) {
  const t = new Date(d);
  return (
    t.getFullYear() +
    '-' +
    pad(t.getMonth() + 1) +
    '-' +
    pad(t.getDate()) +
    ' ' +
    pad(t.getHours()) +
    ':' +
    pad(t.getMinutes()) +
    ':' +
    pad(t.getSeconds())
  );
}
function todayStr() {
  return fmtDate(new Date());
}
function stampStr() {
  const d = new Date();
  return '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
}
function daysLeft(dateStr) {
  if (!dateStr) return null;
  const t = new Date(dateStr + 'T00:00:00');
  if (isNaN(t.getTime())) return null;
  const n = new Date();
  n.setHours(0, 0, 0, 0);
  return Math.round((t - n) / 86400000);
}
function monthKey() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1);
}
function money(n) {
  return '¥' + (Math.round(Number(n) * 100) / 100).toLocaleString('zh-CN');
}
let toastTimer;
function toast(msg) {
  const t = el('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    t.classList.remove('on');
  }, 2400);
}
/* 判定：该补货了吗 */
function isLow(it) {
  if (it.track === 'state') return it.level === '没了' || it.level === '不多了';
  const qty = Number(it.qty || 0),
    low = Number(it.lowAt == null ? 1 : it.lowAt);
  return qty <= low;
}
function lowCount() {
  return S().items.filter(isLow).length;
}
function expiringItems() {
  return S()
    .items.filter(function (it) {
      const d = daysLeft(it.expire);
      return d !== null && d <= Number(S().soonDays || 30);
    })
    .sort(function (a, b) {
      return daysLeft(a.expire) - daysLeft(b.expire);
    });
}
function todoWants() {
  return S().wants.filter(function (w) {
    return w.status !== 'bought';
  });
}
function doneWants() {
  return S().wants.filter(function (w) {
    return w.status === 'bought';
  });
}
const URGENT_RANK = { 马上要: 0, 这周: 1, 不急: 2 };
function sortWants(list) {
  return list.slice().sort(function (a, b) {
    const ra = URGENT_RANK[a.urgent] == null ? 9 : URGENT_RANK[a.urgent];
    const rb = URGENT_RANK[b.urgent] == null ? 9 : URGENT_RANK[b.urgent];
    if (ra !== rb) return ra - rb;
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
}
function monthLogs() {
  const k = monthKey();
  return S().logs.filter(function (l) {
    return String(l.date || '').slice(0, 7) === k;
  });
}
function monthSpend() {
  return monthLogs().reduce(function (a, l) {
    return a + (l.type === '入库' ? Number(l.amount || 0) : 0);
  }, 0);
}
function monthWaste() {
  return monthLogs().filter(function (l) {
    return l.type === '丢弃';
  }).length;
}
function monthBuyTimes() {
  return monthLogs().filter(function (l) {
    return l.type === '入库';
  }).length;
}
/* ==================================================================
   5. 视图片段
   ================================================================== */
function emptyState(iconName, title, sub, btn) {
  return (
    '<div class="empty">' +
    '<div class="big">' +
    icon(iconName, 30) +
    '</div>' +
    '<div class="et">' +
    esc(title) +
    '</div>' +
    '<div class="es">' +
    esc(sub) +
    '</div>' +
    (btn || '') +
    '</div>'
  );
}
function optionList(list, cur) {
  return list
    .map(function (o) {
      return (
        '<option value="' +
        esc(o) +
        '"' +
        (String(o) === String(cur) ? ' selected' : '') +
        '>' +
        esc(o) +
        '</option>'
      );
    })
    .join('');
}
/* ---------- 今日 ---------- */
function viewToday() {
  const todo = todoWants().length,
    exp = expiringItems().length,
    low = lowCount();
  const allEmpty = !S().items.length && !S().wants.length;
  let h = '';
  if (allEmpty) {
    h +=
      '<div class="hero"><div class="face">' +
      icon('spark', 24) +
      '</div><div>' +
      '<div class="ht">欢迎回家，这里是你的小屋</div>' +
      '<div class="hs">先记一句「要买什么」，或者把家里现有的东西放进来。所有数据只存在这台设备上。</div>' +
      '</div></div>';
  }
  h +=
    '<div class="grid tiles">' +
    tile('wants', '待买', todo, '件', todo ? '去看看' : '暂时没有', '') +
    tile(
      'expire',
      '临期',
      exp,
      '件',
      exp ? '要看一眼' : '都还新鲜',
      exp ? 'warn' : '',
    ) +
    tile(
      'stock',
      '该补',
      low,
      '件',
      low ? '要补货了' : '还够用',
      low ? 'warn' : 'ok',
    ) +
    '</div>';
  h +=
    '<div class="card">' +
    '<h3><span class="h-l">' +
    icon('plus', 18) +
    ' 想到什么要买，先记一句</span></h3>' +
    '<form class="quick" id="quickForm">' +
    '<input id="quickInput" data-keep="1" autocomplete="off" placeholder="比如：酱油、孩子的酸奶、抽纸…">' +
    '<button class="btn primary" type="submit">记下</button>' +
    '</form>' +
    '<div class="field-note">只记名字最快；想写「谁要的、要几件、急不急」，去「要买什么」里补。</div>' +
    '</div>';
  h += viewTodayWants();
  h +=
    '<div class="card">' +
    '<h3><span class="h-l">' +
    icon('cal', 18) +
    ' 这个月的小结</span><span class="count">' +
    monthKey().replace('-', ' 年 ') +
    ' 月</span></h3>' +
    '<div class="stat-line"><span class="k">买回来</span><span class="v">' +
    monthBuyTimes() +
    ' 次</span></div>' +
    '<div class="stat-line"><span class="k">花了</span><span class="v">' +
    money(monthSpend()) +
    '</span></div>' +
    '<div class="stat-line"><span class="k">丢掉（过期）</span><span class="v">' +
    monthWaste() +
    ' 件</span></div>' +
    '<div class="field-note">金额是入库时顺手填的，不填也不影响使用。</div>' +
    '</div>';
  const recent = S()
    .logs.filter(function (l) {
      return l.type === '入库';
    })
    .slice(0, 4);
  h +=
    '<div class="card"><h3><span class="h-l">' +
    icon('cart', 18) +
    ' 最近买回</span></h3>';
  if (!recent.length) {
    h +=
      '<div class="hint">还没有买回记录。在「要买什么」里勾掉一件东西，就会自动记到这里。</div>';
  } else {
    h +=
      '<div class="rows">' +
      recent
        .map(function (l) {
          return (
            '<div class="row"><div class="grow">' +
            '<div class="n">' +
            esc(l.name || '—') +
            (l.qty
              ? ' <span class="m" style="display:inline">' +
                esc(l.qty) +
                (l.unit ? esc(l.unit) : '') +
                '</span>'
              : '') +
            '</div>' +
            '<div class="m">' +
            esc(l.date || '') +
            (l.amount ? ' · ' + (l.amount > 0 ? money(l.amount) : '') : '') +
            '</div>' +
            '</div></div>'
          );
        })
        .join('') +
      '</div>';
  }
  h += '</div>';
  h +=
    '<div class="signature">' +
    esc(S().shopName || '暖心小屋') +
    ' · ' +
    esc(S().tagline || DEFAULTS.tagline) +
    '</div>';
  return h;
}
/* ---------- 今日页的精简待买清单 ---------- */
/* 只收「马上要」和「这周」，最多 5 条；「不急」不占首页 */
const TODAY_WANT_MAX = 5;
function todayWantPick() {
  const sorted = sortWants(todoWants());
  const soon = sorted.filter(function (w) {
    return ['马上要', '这周'].indexOf(w.urgent || '这周') >= 0;
  });
  return {
    total: sorted.length,
    soon: soon,
    pick: soon.slice(0, TODAY_WANT_MAX),
  };
}
function viewTodayWants() {
  const t = todayWantPick();
  let h =
    '<div class="card" id="todayWantsCard">' +
    '<h3><span class="h-l">' +
    icon('wants', 18) +
    ' 今天要买</span><span class="count">' +
    t.soon.length +
    ' 件</span></h3>';
  if (!t.pick.length) {
    h +=
      '<div class="hint">' +
      (t.total
        ? '今天没有急着要买的。清单里还有 ' + t.total + ' 件，都还没标急。'
        : '清单是空的。想到什么就在上面记一句，不用记在脑子里。') +
      '</div>' +
      '<div style="margin-top:12px"><button class="chip" data-goto="wants">' +
      icon('wants', 16) +
      ' 去「要买什么」</button></div>';
  } else {
    h +=
      '<div class="rows">' +
      t.pick
        .map(function (w) {
          const meta = [esc(w.owner || '全家')];
          if (w.qty) meta.push(esc(w.qty) + (w.unit ? esc(w.unit) : ''));
          if (w.note) meta.push(esc(w.note));
          return (
            '<div class="row">' +
            '<button class="check" data-buy="' +
            w._id +
            '" title="买到了" aria-label="买到了">' +
            icon('check', 20) +
            '</button>' +
            '<div class="grow"><div class="n">' +
            esc(w.name) +
            '</div><div class="m">' +
            meta.join(' · ') +
            '</div></div>' +
            '<span class="badge ' +
            ((w.urgent || '这周') === '马上要' ? 'b-danger' : 'b-warn') +
            '">' +
            esc(w.urgent || '这周') +
            '</span>' +
            '</div>'
          );
        })
        .join('') +
      '</div>';
    if (t.soon.length > t.pick.length) {
      h +=
        '<div class="hint" style="margin-top:10px">还有 ' +
        (t.soon.length - t.pick.length) +
        ' 件急着要的没显示在上面。</div>';
    }
    h +=
      '<div style="margin-top:12px"><button class="chip" data-goto="wants">' +
      icon('wants', 16) +
      ' 看全部 ' +
      t.total +
      ' 件</button></div>';
  }
  h += '</div>';
  return h;
}
function tile(tab, key, num, unit, cap, cls) {
  return (
    '<button class="tile ' +
    (cls || '') +
    '" data-goto="' +
    tab +
    '">' +
    '<div class="tk">' +
    icon(
      MODULES.filter(function (m) {
        return m.id === tab;
      })[0].glyph,
      16,
    ) +
    ' ' +
    esc(key) +
    '</div>' +
    '<div class="tv">' +
    num +
    '<span class="u">' +
    esc(unit) +
    '</span></div>' +
    '<div class="cap">' +
    esc(cap) +
    '</div>' +
    '</button>'
  );
}
/* ---------- 要买什么 ---------- */
function viewWants() {
  const todo = sortWants(todoWants());
  const done = doneWants();
  const showDone = S().ui.wantsDone;
  let h =
    '<div class="card">' +
    '<h3><span class="h-l">' +
    icon('plus', 18) +
    ' 加一条采购需求</span></h3>' +
    '<form class="quick" id="wantQuick">' +
    '<input id="wantInput" data-keep="1" autocomplete="off" placeholder="想买什么？写完按回车">' +
    '<button class="btn primary" type="submit">记下</button>' +
    '</form>' +
    '<div class="field-note">只记名字：写完按回车。想写细一点：把下面几栏填上，再点「加进清单」。</div>' +
    '<div class="form-grid" style="margin-top:14px">' +
    '<label class="field"><span>谁要的</span><select id="wantOwner">' +
    optionList(S().members, '全家') +
    '</select></label>' +
    '<label class="field"><span>要几件</span><input id="wantQty" type="number" step="any" min="0" placeholder="可留空"></label>' +
    '<label class="field"><span>单位</span><input id="wantUnit" type="text" placeholder="瓶 / 袋 / 盒"></label>' +
    '<label class="field"><span>急不急</span><select id="wantUrgent"><option>马上要</option><option selected>这周</option><option>不急</option></select></label>' +
    '<label class="field wide"><span>备注</span><input id="wantNote" type="text" placeholder="牌子、规格、哪家买…"></label>' +
    '<div class="wide"><button class="btn" type="button" id="wantAddBtn">' +
    icon('plus', 18) +
    ' 加进清单</button></div>' +
    '</div>' +
    '</div>';
  h +=
    '<div class="card" id="wantsCard">' +
    '<h3><span class="h-l">' +
    icon('wants', 18) +
    ' 待买清单</span><span class="count">' +
    todo.length +
    ' 件</span></h3>';
  if (!todo.length) {
    h += emptyState(
      'wants',
      '清单是空的',
      '家里都够用。想到什么就在上面记一句，不用记在脑子里。',
    );
  } else {
    ['马上要', '这周', '不急'].forEach(function (g) {
      const list = todo.filter(function (w) {
        return (w.urgent || '这周') === g;
      });
      if (!list.length) return;
      h +=
        '<div class="group-head">' +
        esc(g) +
        '<span class="line"></span></div>';
      h += '<div class="rows">' + list.map(wantRow).join('') + '</div>';
    });
    const other = todo.filter(function (w) {
      return ['马上要', '这周', '不急'].indexOf(w.urgent || '这周') < 0;
    });
    if (other.length)
      h += '<div class="rows">' + other.map(wantRow).join('') + '</div>';
  }
  h += '</div>';
  h +=
    '<div class="card">' +
    '<h3><span class="h-l">' +
    icon('check', 18) +
    ' 已买到</span>' +
    '<button class="chip' +
    (showDone ? ' on' : '') +
    '" id="toggleDone">' +
    (showDone ? '收起' : '展开 ' + done.length + ' 件') +
    '</button></h3>';
  if (!done.length) {
    h +=
      '<div class="hint">勾掉的东西会出现在这里，方便你回头看「上次买的是什么牌子」。</div>';
  } else if (showDone) {
    h +=
      '<div class="rows">' +
      done
        .slice(0, 50)
        .map(function (w) {
          return (
            '<div class="row done"><div class="grow">' +
            '<div class="n">' +
            esc(w.name) +
            '</div>' +
            '<div class="m">' +
            esc(w.owner || '全家') +
            (w.doneAt ? ' · ' + esc(w.doneAt) + ' 买到' : '') +
            (w.qty ? ' · ' + esc(w.qty) + (w.unit ? esc(w.unit) : '') : '') +
            '</div>' +
            '</div>' +
            '<button class="iconbtn plain" data-undo="' +
            w._id +
            '" title="撤销，放回待买" aria-label="撤销">' +
            icon('undo', 18) +
            '</button>' +
            '<button class="iconbtn plain" data-delwant="' +
            w._id +
            '" title="删除" aria-label="删除">' +
            icon('close', 18) +
            '</button>' +
            '</div>'
          );
        })
        .join('') +
      '</div>';
  } else {
    h +=
      '<div class="hint">已买到 ' + done.length + ' 件，点右上角展开。</div>';
  }
  h += '</div>';
  return h;
}
function wantRow(w) {
  const meta = [];
  meta.push(esc(w.owner || '全家'));
  if (w.qty) meta.push(esc(w.qty) + (w.unit ? esc(w.unit) : ''));
  if (w.cat) meta.push(esc(w.cat));
  if (w.note) meta.push(esc(w.note));
  return (
    '<div class="row">' +
    '<button class="check" data-buy="' +
    w._id +
    '" title="买到了" aria-label="买到了">' +
    icon('check', 20) +
    '</button>' +
    '<div class="grow"><div class="n">' +
    esc(w.name) +
    '</div><div class="m">' +
    meta.join(' · ') +
    '</div></div>' +
    '<button class="iconbtn plain" data-delwant="' +
    w._id +
    '" title="删除" aria-label="删除">' +
    icon('close', 18) +
    '</button>' +
    '</div>'
  );
}
/* ---------- 家里有啥 ---------- */
function viewStock() {
  const u = S().ui;
  const cats = S().cats,
    places = S().places;
  let h =
    '<div class="card">' +
    '<div class="quick">' +
    '<input id="stockSearch" data-keep="1" autocomplete="off" placeholder="搜物品名、位置、备注…" value="' +
    esc(u.stockQ) +
    '">' +
    '<button class="btn primary" id="addItemBtn">' +
    icon('plus', 18) +
    ' 添加物品</button>' +
    '</div>' +
    '<div class="chips" style="margin-top:14px">' +
    chip('all', '全部', u.stockFilter === 'all') +
    chip('low', '该补了', u.stockFilter === 'low') +
    chip('exp', '临期的', u.stockFilter === 'exp') +
    '</div>' +
    '<div class="form-grid" style="margin-top:12px">' +
    '<label class="field"><span>分类</span><select id="stockCat"><option value="">全部分类</option>' +
    optionList(cats, u.stockCat) +
    '</select></label>' +
    '<label class="field"><span>存放位置</span><select id="stockPlace"><option value="">全部位置</option>' +
    optionList(places, u.stockPlace) +
    '</select></label>' +
    '</div>' +
    '</div>';
  h += '<div id="stockBody">' + stockBody() + '</div>';
  return h;
}
function chip(v, label, on) {
  return (
    '<button class="chip' +
    (on ? ' on' : '') +
    '" data-filter="' +
    v +
    '">' +
    esc(label) +
    '</button>'
  );
}
function stockBody() {
  const u = S().ui;
  let list = S().items.slice();
  if (u.stockFilter === 'low') list = list.filter(isLow);
  if (u.stockFilter === 'exp')
    list = list.filter(function (it) {
      const d = daysLeft(it.expire);
      return d !== null && d <= Number(S().soonDays || 30);
    });
  if (u.stockCat)
    list = list.filter(function (it) {
      return it.cat === u.stockCat;
    });
  if (u.stockPlace)
    list = list.filter(function (it) {
      return it.place === u.stockPlace;
    });
  if (u.stockQ) {
    const q = u.stockQ.toLowerCase();
    list = list.filter(function (it) {
      return [it.name, it.cat, it.place, it.note, it.owner].some(function (v) {
        return (
          String(v || '')
            .toLowerCase()
            .indexOf(q) >= 0
        );
      });
    });
  }
  list.sort(function (a, b) {
    const la = isLow(a) ? 0 : 1,
      lb = isLow(b) ? 0 : 1;
    if (la !== lb) return la - lb;
    const da = daysLeft(a.expire),
      db = daysLeft(b.expire);
    if (da !== null && db !== null && da !== db) return da - db;
    if (da !== null && db === null) return -1;
    if (da === null && db !== null) return 1;
    return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN');
  });
  let h = '';
  const total = S().items.length;
  h +=
    '<div class="card"><h3><span class="h-l">' +
    icon('stock', 18) +
    ' 库存</span><span class="count">' +
    (list.length === total
      ? total + ' 件'
      : list.length + ' / ' + total + ' 件') +
    '</span></h3>';
  if (!total) {
    h += emptyState(
      'stock',
      '柜子还是空的',
      '把家里现有的东西放进来：日用品、零食、清洁剂都行。之后取用点一下就减一。',
      '<button class="btn primary" data-newitem="1">' +
        icon('plus', 18) +
        ' 添加第一件物品</button>',
    );
  } else if (!list.length) {
    h += emptyState(
      'stock',
      '这个筛选下没有东西',
      '换个分类或清掉筛选看看。',
      '<button class="btn" data-clearfilter="1">清掉筛选</button>',
    );
  } else {
    h += '<div class="items">' + list.map(itemCard).join('') + '</div>';
  }
  h += '</div>';
  /* 买回记录 */
  const logs = S().logs;
  h +=
    '<div class="card"><h3><span class="h-l">' +
    icon('cart', 18) +
    ' 买回记录</span>' +
    '<button class="chip' +
    (S().ui.stockSub === 'logs' ? ' on' : '') +
    '" id="toggleLogs">' +
    (S().ui.stockSub === 'logs' ? '收起' : '展开 ' + logs.length + ' 条') +
    '</button></h3>';
  if (!logs.length) {
    h +=
      '<div class="hint">还没记录。在「要买什么」里勾掉一件东西，或在这里手动加一条。</div>';
  } else if (S().ui.stockSub === 'logs') {
    h +=
      '<div class="rows">' +
      logs
        .slice(0, 80)
        .map(function (l) {
          const b =
            l.type === '入库'
              ? 'b-ok'
              : l.type === '丢弃'
                ? 'b-danger'
                : 'b-plain';
          return (
            '<div class="row">' +
            '<span class="badge ' +
            b +
            '">' +
            esc(l.type) +
            '</span>' +
            '<div class="grow"><div class="n">' +
            esc(l.name || '—') +
            '</div>' +
            '<div class="m">' +
            esc(l.date || '') +
            (l.qty ? ' · ' + esc(l.qty) + (l.unit ? esc(l.unit) : '') : '') +
            (l.amount ? ' · ' + money(l.amount) : '') +
            '</div></div>' +
            '<button class="iconbtn plain" data-dellog="' +
            l._id +
            '" title="删除" aria-label="删除">' +
            icon('close', 18) +
            '</button>' +
            '</div>'
          );
        })
        .join('') +
      '</div>';
  } else {
    h +=
      '<div class="hint">共 ' + logs.length + ' 条记录，点右上角展开。</div>';
  }
  h += '</div>';
  return h;
}
function itemCard(it) {
  const low = isLow(it);
  const d = daysLeft(it.expire);
  let expBadge = '';
  if (d !== null) {
    if (d < 0)
      expBadge =
        '<span class="badge b-danger">过期 ' + Math.abs(d) + ' 天</span>';
    else if (d <= Number(S().freshDays || 7))
      expBadge = '<span class="badge b-warn">还有 ' + d + ' 天</span>';
    else if (d <= Number(S().soonDays || 30))
      expBadge = '<span class="badge b-note">还有 ' + d + ' 天</span>';
    else expBadge = '<span class="badge b-plain">' + esc(it.expire) + '</span>';
  }
  const meta = [];
  if (it.place) meta.push(esc(it.place));
  if (it.cat) meta.push(esc(it.cat));
  meta.push(esc(it.owner || '全家'));
  let qtyHTML = '';
  if (it.track === 'state') {
    const lv = it.level || '充足';
    qtyHTML =
      '<div class="levels">' +
      ['充足', '不多了', '没了']
        .map(function (v) {
          const on = lv === v;
          const danger = v === '没了' && on;
          return (
            '<button class="lv' +
            (on ? ' on' : '') +
            (danger ? ' danger' : '') +
            '" data-lv="' +
            it._id +
            '" data-val="' +
            v +
            '">' +
            v +
            '</button>'
          );
        })
        .join('') +
      '</div>';
  } else {
    qtyHTML =
      '<div class="stepper">' +
      '<button class="step-btn" data-dec="' +
      it._id +
      '" aria-label="用掉一件">' +
      icon('minus', 20) +
      '</button>' +
      '<div class="qty">' +
      (it.qty == null ? 0 : esc(it.qty)) +
      '<span class="u">' +
      esc(it.unit || '件') +
      '</span></div>' +
      '<button class="step-btn" data-inc="' +
      it._id +
      '" aria-label="加一件">' +
      icon('plus', 20) +
      '</button>' +
      '</div>';
  }
  return (
    '<div class="item' +
    (low ? ' low' : '') +
    '">' +
    '<div class="item-top">' +
    '<div class="item-name">' +
    esc(it.name) +
    '</div>' +
    (low ? '<span class="badge b-danger">该补</span>' : '') +
    '</div>' +
    '<div class="item-meta">' +
    meta.join(' · ') +
    '</div>' +
    qtyHTML +
    (expBadge ? '<div>' + expBadge + '</div>' : '') +
    (it.note ? '<div class="item-meta">' + esc(it.note) + '</div>' : '') +
    '<div class="item-foot">' +
    '<span class="hint">' +
    (it.track === 'state' ? '记状态' : '记数量') +
    '</span>' +
    '<div class="item-acts">' +
    '<button class="iconbtn plain" data-edititem="' +
    it._id +
    '" title="修改" aria-label="修改">' +
    icon('edit', 18) +
    '</button>' +
    '<button class="iconbtn plain" data-delitem="' +
    it._id +
    '" title="删除" aria-label="删除">' +
    icon('close', 18) +
    '</button>' +
    '</div>' +
    '</div>' +
    '</div>'
  );
}
/* ---------- 快过期了 ---------- */
function viewExpire() {
  const list = expiringItems();
  const over = list.filter(function (it) {
    return daysLeft(it.expire) < 0;
  });
  const week = list.filter(function (it) {
    const d = daysLeft(it.expire);
    return d >= 0 && d <= Number(S().freshDays || 7);
  });
  const soon = list.filter(function (it) {
    const d = daysLeft(it.expire);
    return d > Number(S().freshDays || 7) && d <= Number(S().soonDays || 30);
  });
  let h =
    '<div class="grid tiles">' +
    tile2(
      '已过期',
      over.length,
      over.length ? '要清理了' : '没有',
      over.length ? 'warn' : 'ok',
    ) +
    tile2(
      '7 天内',
      week.length,
      week.length ? '抓紧用' : '还稳',
      week.length ? 'warn' : '',
    ) +
    tile2(
      '30 天内',
      soon.length,
      soon.length ? '心里有数' : '很干净',
      soon.length ? '' : 'ok',
    ) +
    '</div>';
  h +=
    '<div class="card">' +
    '<h3><span class="h-l">' +
    icon('expire', 18) +
    ' 需要处理的</span><span class="count">' +
    list.length +
    ' 件</span></h3>' +
    '<div class="hint">只显示填了到期日的东西。处理完会自动扣库存、记一笔流水。</div>' +
    '<div class="divider"></div>';
  if (!list.length) {
    h += emptyState(
      'check',
      '没有快过期的东西',
      '家里清清爽爽。记得新增物品时填上到期日，以后这里就会替你盯着。',
    );
  } else {
    h += '<div class="rows">' + list.map(expireRow).join('') + '</div>';
  }
  h += '</div>';
  const noExp = S().items.filter(function (it) {
    return !it.expire;
  });
  if (noExp.length) {
    h +=
      '<div class="card"><h3><span class="h-l">' +
      icon('stock', 18) +
      ' 没填到期日的</span><span class="count">' +
      noExp.length +
      ' 件</span></h3>' +
      '<div class="hint">这些是耐用品或还没记日期的东西。点一下可以补上到期日。</div>' +
      '<div class="chips" style="margin-top:12px">' +
      noExp
        .slice(0, 30)
        .map(function (it) {
          return (
            '<button class="chip" data-edititem="' +
            it._id +
            '">' +
            esc(it.name) +
            '</button>'
          );
        })
        .join('') +
      '</div></div>';
  }
  return h;
}
function tile2(k, num, cap, cls) {
  return (
    '<div class="tile ' +
    (cls || '') +
    '">' +
    '<div class="tk">' +
    esc(k) +
    '</div>' +
    '<div class="tv">' +
    num +
    '<span class="u">件</span></div>' +
    '<div class="cap">' +
    esc(cap) +
    '</div>' +
    '</div>'
  );
}
function expireRow(it) {
  const d = daysLeft(it.expire);
  const badge =
    d < 0
      ? '<span class="badge b-danger">已过期 ' + Math.abs(d) + ' 天</span>'
      : d <= Number(S().freshDays || 7)
        ? '<span class="badge b-warn">还有 ' + d + ' 天</span>'
        : '<span class="badge b-note">还有 ' + d + ' 天</span>';
  const qty =
    it.track === 'state'
      ? esc(it.level || '充足')
      : Number(it.qty || 0) + esc(it.unit || '件');
  return (
    '<div class="row" style="flex-wrap:wrap">' +
    '<div class="grow" style="min-width:150px">' +
    '<div class="n">' +
    esc(it.name) +
    ' ' +
    badge +
    '</div>' +
    '<div class="m">' +
    esc(it.expire) +
    ' · 剩 ' +
    qty +
    (it.place ? ' · ' + esc(it.place) : '') +
    '</div>' +
    '</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
    '<button class="btn sm mint" data-use="' +
    it._id +
    '">' +
    icon('check', 16) +
    ' 用掉了</button>' +
    '<button class="btn sm" data-waste="' +
    it._id +
    '">' +
    icon('trash', 16) +
    ' 丢掉了</button>' +
    '<button class="btn sm ghost" data-edititem="' +
    it._id +
    '">改期</button>' +
    '</div>' +
    '</div>'
  );
}
/* ---------- 我的 ---------- */
function viewMy() {
  const a = authStore.a;
  let h = '';
  if (a.status !== 'authenticated') {
    h +=
      '<div class="card">' +
      '<h3><span class="h-l">' +
      icon('user', 18) +
      ' 登录状态</span></h3>' +
      '<div class="hint">未登录，数据仅保存在本机浏览器，换设备需手动导出/导入。</div>' +
      '<div class="modal-foot" style="margin-top:14px">' +
      '<button class="btn primary" id="loginBtn">' +
      icon('user', 18) +
      ' 登录 / 注册</button>' +
      '</div>' +
      '<div class="hint sm" style="margin-top:8px; color:var(--s-warn-ink)">' +
      '建议定期下载 JSON 备份，防止数据丢失' +
      '</div>' +
      '</div>';
    h +=
      '<div class="card">' +
      '<h3><span class="h-l">' +
      icon('download', 18) +
      ' 本地功能</span></h3>' +
      '<div class="hint">未登录时可使用以下功能：</div>' +
      '<div class="chips" style="margin-top:12px">' +
      '<button class="btn sm" data-export="wants">导出 采购需求 CSV</button>' +
      '<button class="btn sm" data-export="items">导出 库存 CSV</button>' +
      '<button class="btn sm" data-export="logs">导出 流水 CSV</button>' +
      '<button class="btn sm" data-export="all">导出 全部合并 CSV</button>' +
      '</div>' +
      '<div class="divider"></div>' +
      '<div class="chips">' +
      '<button class="btn sm primary" id="backupBtn">' +
      icon('download', 16) +
      ' 下载 JSON 备份</button>' +
      '<button class="btn sm" id="restoreBtn">导入备份还原</button>' +
      '<input type="file" id="fileInput" accept=".json,application/json" hidden>' +
      '</div>' +
      '</div>';
    h +=
      '<div class="card">' +
      '<h3><span class="h-l">' +
      icon('stock', 18) +
      ' 数据概览</span></h3>' +
      '<div class="stat-line"><span class="k">采购需求</span><span class="v">' +
      S().wants.length +
      ' 条</span></div>' +
      '<div class="stat-line"><span class="k">库存物品</span><span class="v">' +
      S().items.length +
      ' 件</span></div>' +
      '<div class="stat-line"><span class="k">出入库流水</span><span class="v">' +
      S().logs.length +
      ' 条</span></div>' +
      '</div>';
  } else {
    h +=
      '<div class="card">' +
      '<h3><span class="h-l">' +
      icon('user', 18) +
      ' 登录信息</span></h3>' +
      '<div class="stat-line"><span class="k">昵称</span><span class="v">' +
      esc(a.nickname || '匿名用户') +
      '</span></div>' +
      '<div class="stat-line"><span class="k">登录时间</span><span class="v">' +
      esc(a.loginAt ? fmtDateTime(a.loginAt) : '—') +
      '</span></div>' +
      '<div class="stat-line"><span class="k">上次同步</span><span class="v">' +
      esc(a.lastSyncAt ? fmtDateTime(a.lastSyncAt) : '尚未同步') +
      '</span></div>' +
      '<div class="modal-foot" style="margin-top:14px">' +
      '<button class="btn" id="logoutBtn">' +
      icon('logout', 18) +
      ' 退出登录</button>' +
      '</div>' +
      '</div>';
    h +=
      '<div class="card">' +
      '<h3><span class="h-l">' +
      icon('sync', 18) +
      ' 同步状态</span></h3>' +
      '<div class="stat-line"><span class="k">同步模式</span><span class="v">自动同步（保存时触发）</span></div>' +
      '<div class="stat-line"><span class="k">冲突策略</span><span class="v">时间戳优先</span></div>' +
      '<div class="chips" style="margin-top:14px">' +
      '<button class="btn sm" id="syncNowBtn">' +
      icon('sync', 16) +
      ' 立即同步</button>' +
      '</div>' +
      '</div>';
    h +=
      '<div class="card">' +
      '<h3><span class="h-l">' +
      icon('link', 18) +
      ' 跨端同步</span></h3>' +
      '<div class="stat-line"><span class="k">小程序绑定</span><span class="v">' +
      (a.open_id ? '已绑定' : '未绑定') +
      '</span></div>' +
      (a.open_id
        ? '<div class="hint sm">已绑定小程序，数据自动同步</div>'
        : '<div class="modal-foot" style="margin-top:10px"><button class="btn sm" id="bindOpenIdBtn">绑定小程序</button></div>') +
      '<div class="divider" style="margin:10px 0"></div>' +
      '<button class="btn sm" id="mergeAccountBtn">合并账号</button>' +
      '<div class="hint sm" style="margin-top:6px">若同一用户在两端有独立账号，可合并数据</div>' +
      '</div>';
    h +=
      '<div class="card">' +
      '<h3><span class="h-l">' +
      icon('download', 18) +
      ' 数据管理</span></h3>' +
      '<div class="chips">' +
      '<button class="btn sm" data-export="wants">导出 采购需求 CSV</button>' +
      '<button class="btn sm" data-export="items">导出 库存 CSV</button>' +
      '<button class="btn sm" data-export="logs">导出 流水 CSV</button>' +
      '<button class="btn sm" data-export="all">导出 全部合并 CSV</button>' +
      '</div>' +
      '<div class="divider"></div>' +
      '<div class="chips">' +
      '<button class="btn sm primary" id="backupBtn">' +
      icon('download', 16) +
      ' 下载 JSON 备份</button>' +
      '<button class="btn sm" id="restoreBtn">导入备份还原</button>' +
      '<input type="file" id="fileInput" accept=".json,application/json" hidden>' +
      '</div>' +
      '</div>';
  }
  return h;
}
/* ---------- 设置 ---------- */
function viewSettings() {
  const s = S();
  let h = '';
  h +=
    '<div class="card"><h3><span class="h-l">' +
    icon('spark', 18) +
    ' 小屋的名字</span></h3>' +
    '<label class="field"><span>名字</span>' +
    '<input id="setName" data-keep="1" type="text" value="' +
    esc(s.shopName) +
    '" placeholder="暖心小屋"></label>' +
    '<label class="field" style="margin-top:14px"><span>名字下面那句话</span>' +
    '<input id="setTagline" data-keep="1" type="text" maxlength="14" value="' +
    esc(s.tagline) +
    '" placeholder="细水长流，岁岁年年"></label>' +
    '<div class="field-note">改完自动保存。第二栏建议 12 个字以内，太长侧栏会折行；它还会作为「今日」页末尾的落款显示。</div></div>';
  h +=
    '<div class="card"><h3><span class="h-l">' +
    icon('wants', 18) +
    ' 名单设置</span></h3>' +
    '<div class="form-grid">' +
    '<label class="field wide"><span>家庭成员（用逗号分开）</span><input id="setMembers" type="text" value="' +
    esc(s.members.join('，')) +
    '"></label>' +
    '<label class="field wide"><span>物品种类（用逗号分开）</span><input id="setCats" type="text" value="' +
    esc(s.cats.join('，')) +
    '"></label>' +
    '<label class="field wide"><span>存放位置（用逗号分开）</span><input id="setPlaces" type="text" value="' +
    esc(s.places.join('，')) +
    '"></label>' +
    '<label class="field"><span>临期提醒：多少天内</span><input id="setFresh" type="number" min="1" max="60" value="' +
    esc(s.freshDays) +
    '"></label>' +
    '<label class="field"><span>关注范围：多少天内</span><input id="setSoon" type="number" min="1" max="365" value="' +
    esc(s.soonDays) +
    '"></label>' +
    '</div>' +
    '<div class="field-note">改完点下面的按钮保存。已有记录不会受影响。</div>' +
    '<div class="modal-foot" style="margin-top:14px"><button class="btn primary" id="saveSettings">' +
    icon('check', 18) +
    ' 保存设置</button></div>' +
    '</div>';
  h +=
    '<div class="card"><h3><span class="h-l">' +
    icon('cart', 18) +
    ' 导出与备份</span></h3>' +
    '<div class="chips">' +
    '<button class="btn sm" data-export="wants">导出 采购需求 CSV</button>' +
    '<button class="btn sm" data-export="items">导出 库存 CSV</button>' +
    '<button class="btn sm" data-export="logs">导出 流水 CSV</button>' +
    '<button class="btn sm" data-export="all">导出 全部合并 CSV</button>' +
    '</div>' +
    '<div class="divider"></div>' +
    '<div class="chips">' +
    '<button class="btn sm primary" id="backupBtn">' +
    icon('check', 16) +
    ' 下载 JSON 备份</button>' +
    '<button class="btn sm" id="restoreBtn">' +
    icon('undo', 16) +
    ' 导入备份还原</button>' +
    '<input type="file" id="fileInput" accept=".json,application/json" hidden>' +
    '</div>' +
    '<div class="hint" style="margin-top:14px">数据只存在这台设备的浏览器里，不上传任何服务器。换手机或换电脑时：先「下载 JSON 备份」，到新设备用「导入备份还原」。CSV 用 Excel / WPS 打开，中文不会乱码。</div>' +
    '</div>';
  h +=
    '<div class="card"><h3><span class="h-l">' +
    icon('stock', 18) +
    ' 数据概览</span></h3>' +
    '<div class="stat-line"><span class="k">采购需求</span><span class="v">' +
    s.wants.length +
    ' 条</span></div>' +
    '<div class="stat-line"><span class="k">库存物品</span><span class="v">' +
    s.items.length +
    ' 件</span></div>' +
    '<div class="stat-line"><span class="k">出入库流水</span><span class="v">' +
    s.logs.length +
    ' 条</span></div>' +
    '<div class="stat-line"><span class="k">数据占用</span><span class="v">' +
    storageSize() +
    '</span></div>' +
    '</div>';
  h +=
    '<div class="card"><h3><span class="h-l">' +
    icon('spark', 18) +
    ' 怎么用最省事</span></h3>' +
    '<div class="hint" style="line-height:1.9">' +
    '1. 想到要买什么，在「今日」页顶部一句话记下，不用填别的。<br>' +
    '2. 去超市前打开「要买什么」，按「马上要 / 这周 / 不急」分好了组。<br>' +
    '3. 买回来点圆圈勾选，填个数填个价，自动进「家里有啥」。<br>' +
    '4. 平时拿东西，在「家里有啥」点 − 减一；剩到阈值会自动冒出「该补」。<br>' +
    '5. 每周翻一次「快过期了」，该用的用掉、该扔的扔掉，顺手记一笔损耗。' +
    '</div></div>';
  h +=
    '<div class="card"><h3><span class="h-l">' +
    icon('trash', 18) +
    ' 危险操作</span></h3>' +
    '<div class="hint">清空会删掉全部记录，且无法恢复（备份文件除外）。</div>' +
    '<div class="modal-foot" style="margin-top:14px"><button class="btn" id="wipeBtn" style="color:var(--s-danger-ink)">清空全部数据</button></div></div>';
  return h;
}
function storageSize() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || '';
    const kb = raw.length / 1024;
    return kb < 1024
      ? Math.round(kb * 10) / 10 + ' KB'
      : Math.round(kb / 102.4) / 10 + ' MB';
  } catch (e) {
    return '—';
  }
}
/* ==================================================================
   6. 路由与渲染
   ================================================================== */
let lastTab = null;
function buildNav() {
  el('nav').innerHTML = MODULES.map(function (m) {
    return (
      '<button class="tab' +
      (S().tab === m.id ? ' active' : '') +
      '" data-goto="' +
      m.id +
      '">' +
      '<span class="glyph">' +
      icon(m.glyph, 20) +
      '</span><span class="label">' +
      esc(m.name) +
      '</span></button>'
    );
  }).join('');
  el('tabbar').innerHTML = MODULES.map(function (m) {
    return (
      '<button class="' +
      (S().tab === m.id ? 'active' : '') +
      '" data-goto="' +
      m.id +
      '">' +
      '<span class="glyph">' +
      icon(m.glyph, 20) +
      '</span>' +
      esc(m.name) +
      '</button>'
    );
  }).join('');
  const sf = document.querySelector('.side-foot .tab');
  if (sf) {
    sf.className = 'tab' + (S().tab === '__settings' ? ' active' : '');
    sf.querySelector('.glyph').innerHTML = icon('settings', 20);
  }
}
function render() {
  const view = el('viewEl');
  const keptTop = lastTab === S().tab ? view.scrollTop : 0;
  const active = document.activeElement;
  let keepId = null,
    selStart = null,
    selEnd = null;
  if (active && active.dataset && active.dataset.keep && active.id) {
    keepId = active.id;
    try {
      selStart = active.selectionStart;
      selEnd = active.selectionEnd;
    } catch (e) {}
  }
  buildNav();
  const tab = S().tab;
  el('brandTitle').textContent = S().shopName || '暖心小屋';
  el('brandSub').textContent = S().tagline || DEFAULTS.tagline;
  el('modalCloseBtn').innerHTML = icon('close', 20);
  const sb = el('settingsBtn');
  if (sb) {
    const onSettings = tab === '__settings';
    sb.innerHTML = icon(onSettings ? 'undo' : 'settings', 20);
    sb.dataset.goto = onSettings ? 'today' : '__settings';
    sb.classList.toggle('on', onSettings);
    sb.setAttribute('aria-label', onSettings ? '返回首页' : '设置');
  }
  if (tab === '__settings') {
    el('pageTitle').textContent = '设置 · 导出';
    el('pageSub').textContent = '数据与偏好';
    el('pageActions').innerHTML = '';
    el('viewRoot').innerHTML = viewSettings();
  } else {
    const m =
      MODULES.filter(function (x) {
        return x.id === tab;
      })[0] || MODULES[0];
    el('pageTitle').textContent = m.name;
    el('pageSub').textContent = m.sub;
    el('pageActions').innerHTML =
      m.id === 'today' || m.id === 'my'
        ? ''
        : '<button class="btn sm" data-export="' +
          exportKeyOf(m.id) +
          '">导出 CSV</button>';
    let body = '';
    if (m.id === 'today') body = viewToday();
    if (m.id === 'wants') body = viewWants();
    if (m.id === 'stock') body = viewStock();
    if (m.id === 'expire') body = viewExpire();
    if (m.id === 'my') body = viewMy();
    el('viewRoot').innerHTML = body;
  }
  view.scrollTop = keptTop;
  lastTab = tab;
  if (keepId) {
    const e2 = document.getElementById(keepId);
    if (e2) {
      e2.focus();
      try {
        if (selStart != null) e2.setSelectionRange(selStart, selEnd);
      } catch (err) {}
    }
  }
}
function exportKeyOf(id) {
  if (id === 'wants') return 'wants';
  if (id === 'logs') return 'logs';
  return 'items';
}
function goto(tab) {
  S().tab = tab;
  store.save();
  if (tab !== lastTab) el('viewEl').scrollTop = 0;
  render();
}
/* ==================================================================
   7. 弹层
   ================================================================== */
let modalSubmit = null;
function openModal(opt) {
  el('modalTitle').textContent = opt.title || '';
  el('modalSub').textContent = opt.sub || '';
  el('modalSub').style.display = opt.sub ? '' : 'none';
  el('modalBody').innerHTML = opt.body || '';
  el('modalFoot').innerHTML =
    (opt.extra || '') +
    '<button class="btn primary" type="submit" form="modalForm">' +
    esc(opt.submitText || '保存') +
    '</button>';
  modalSubmit = opt.onSubmit || null;
  el('modal').hidden = false;
  const f = document.getElementById('modalForm');
  if (f) {
    const first = f.querySelector('input,select,textarea');
    if (first)
      setTimeout(function () {
        try {
          first.focus();
        } catch (e) {}
      }, 80);
  }
}
function closeModal() {
  el('modal').hidden = true;
  modalSubmit = null;
}
function formObj(f) {
  const o = {};
  new FormData(f).forEach(function (v, k) {
    o[k] = typeof v === 'string' ? v.trim() : v;
  });
  return o;
}
/* ---- 入库弹层（从采购需求勾选进入） ---- */
function openBuyModal(wantId) {
  const w = S().wants.filter(function (x) {
    return x._id === wantId;
  })[0];
  if (!w) return;
  openModal({
    title: '买到了，入库吧',
    sub: '填几件、放哪儿，它就会进「家里有啥」。只勾选不入库也行。',
    body:
      '<form id="modalForm" class="form-grid">' +
      fText('name', '买了什么', w.name, '', 'text', true) +
      fNum('qty', '数量', w.qty, '留空 = 只记状态') +
      fText('unit', '单位', w.unit, '瓶 / 袋 / 盒') +
      fDate('expire', '到期日', '') +
      fNum('amount', '花了多少（选填）', '') +
      fSel('place', '放哪儿', S().places[0], S().places) +
      fSel('cat', '分类', w.cat || S().cats[0], S().cats) +
      fSel('owner', '谁用', w.owner || S().members[0], S().members) +
      fNum('lowAt', '剩多少提醒补货', 1) +
      '</form>' +
      '<div class="field-note">数量留空 → 这件东西以后用「充足 / 不多了 / 没了」三档来记，最省事。</div>',
    submitText: '入库并标记买到',
    extra:
      '<button type="button" class="btn" id="skipStockBtn">只标记买到</button>',
    onSubmit: function (d) {
      const qty = d.qty === '' ? null : Number(d.qty);
      const patch = { status: 'bought', doneAt: todayStr() };
      if (d.name) patch.name = d.name;
      store.updateWant(wantId, patch);
      if (qty !== null || d.expire) {
        store.addItem({
          name: d.name || w.name,
          cat: d.cat,
          place: d.place,
          owner: d.owner,
          track: qty === null ? 'state' : 'count',
          qty: qty === null ? null : qty,
          unit: d.unit || (qty === null ? '' : '件'),
          level: '充足',
          lowAt: d.lowAt === '' ? 1 : Number(d.lowAt),
          expire: d.expire || '',
          note: w.note || '',
        });
      }
      store.addLog({
        date: todayStr(),
        type: '入库',
        name: d.name || w.name,
        qty: qty === null ? '' : qty,
        unit: d.unit || '',
        amount: d.amount === '' ? 0 : Number(d.amount),
      });
      closeModal();
      render();
      toast('已入库，也记好了');
    },
  });
  const skip = el('skipStockBtn');
  if (skip)
    skip.onclick = function () {
      store.updateWant(wantId, { status: 'bought', doneAt: todayStr() });
      closeModal();
      render();
      toast('标记为买到了');
    };
}
/* ---- 新增 / 编辑物品 ---- */
function openItemModal(itemId) {
  const it = itemId ? store.getItem(itemId) : null;
  const isEdit = !!it;
  const cur = it || {
    track: 'count',
    qty: '',
    unit: '',
    lowAt: 1,
    level: '充足',
    expire: '',
    cat: S().cats[0],
    place: S().places[0],
    owner: S().members[0],
    note: '',
    name: '',
  };
  openModal({
    title: isEdit ? '修改物品' : '添加一件物品',
    sub: isEdit ? '' : '家里已经有的东西，放进来以后取用点一下就减一。',
    body:
      '<form id="modalForm" class="form-grid">' +
      fText(
        'name',
        '叫什么',
        cur.name,
        '例如：抽纸、牛奶、洗衣液',
        'text',
        true,
      ) +
      fSel('cat', '分类', cur.cat, S().cats) +
      fSel('place', '放哪儿', cur.place, S().places) +
      fSel('owner', '谁用', cur.owner, S().members) +
      '<label class="field wide"><span>怎么记这件东西</span>' +
      '<select name="track" id="trackSel">' +
      '<option value="count"' +
      (cur.track === 'count' ? ' selected' : '') +
      '>记数量（比如抽纸 3 包）</option>' +
      '<option value="state"' +
      (cur.track === 'state' ? ' selected' : '') +
      '>只记状态（充足 / 不多了 / 没了）</option>' +
      '</select></label>' +
      '<div class="wide" id="trackCount" style="display:' +
      (cur.track === 'count' ? 'block' : 'none') +
      '">' +
      '<div class="form-grid">' +
      fNum('qty', '现在有几件', cur.qty === null ? '' : cur.qty, '0') +
      fText('unit', '单位', cur.unit, '包 / 瓶 / 盒') +
      fNum('lowAt', '剩多少提醒补货', cur.lowAt, '1') +
      '</div>' +
      '</div>' +
      '<div class="wide" id="trackState" style="display:' +
      (cur.track === 'state' ? 'block' : 'none') +
      '">' +
      '<label class="field"><span>现在的状态</span><select name="level">' +
      ['充足', '不多了', '没了']
        .map(function (v) {
          return (
            '<option' +
            (cur.level === v ? ' selected' : '') +
            '>' +
            v +
            '</option>'
          );
        })
        .join('') +
      '</select></label>' +
      '</div>' +
      fDate('expire', '到期日（选填）', cur.expire) +
      fText('note', '备注', cur.note, '牌子、规格…', 'text', false, 'wide') +
      '</form>' +
      '<div class="field-note">填了到期日，才会出现在「快过期了」页里。</div>',
    submitText: isEdit ? '保存修改' : '放进来',
    onSubmit: function (d) {
      const track = d.track || 'count';
      const row = {
        name: d.name,
        cat: d.cat,
        place: d.place,
        owner: d.owner,
        track: track,
        qty: track === 'count' ? (d.qty === '' ? 0 : Number(d.qty)) : null,
        unit: d.unit || '',
        lowAt: d.lowAt === '' ? 1 : Number(d.lowAt),
        level: track === 'state' ? d.level || '充足' : '',
        expire: d.expire || '',
        note: d.note || '',
      };
      if (isEdit) {
        store.updateItem(itemId, row);
        toast('改好了');
      } else {
        store.addItem(row);
        toast('放进来啦');
      }
      closeModal();
      render();
    },
  });
  const sel = el('trackSel');
  if (sel)
    sel.onchange = function () {
      el('trackCount').style.display = sel.value === 'count' ? 'block' : 'none';
      el('trackState').style.display = sel.value === 'state' ? 'block' : 'none';
    };
}
/* ---- 丢弃弹层 ---- */
function openWasteModal(itemId) {
  const it = store.getItem(itemId);
  if (!it) return;
  openModal({
    title: '丢掉「' + it.name + '」',
    sub: '会扣掉库存并记一笔损耗，之后能在买回记录里看到这个月扔了多少。',
    body:
      '<form id="modalForm" class="form-grid">' +
      fNum('qty', '丢了几件', 1) +
      fText('unit', '单位', it.unit || '件') +
      fNum('amount', '大概值多少钱（选填）', '') +
      fText('note', '原因', '过期了 / 变质了', 'text', false, 'wide') +
      '</form>',
    submitText: '确认丢掉',
    onSubmit: function (d) {
      const n = d.qty === '' ? 1 : Number(d.qty);
      if (it.track === 'count') {
        const left = Math.max(0, Number(it.qty || 0) - n);
        store.updateItem(itemId, { qty: left });
      } else {
        store.updateItem(itemId, { level: '没了' });
      }
      store.addLog({
        date: todayStr(),
        type: '丢弃',
        name: it.name,
        qty: n,
        unit: d.unit || it.unit || '',
        amount: d.amount === '' ? 0 : Number(d.amount),
        note: d.note || '',
      });
      closeModal();
      render();
      toast('记下了，别心疼');
    },
  });
}
/* ---- 表单字段小工具 ---- */
function fText(name, label, val, ph, type, required, cls) {
  return (
    '<label class="field ' +
    (cls || '') +
    '"><span>' +
    esc(label) +
    (required ? ' *' : '') +
    '</span>' +
    '<input name="' +
    name +
    '" type="' +
    (type || 'text') +
    '" value="' +
    esc(val == null ? '' : val) +
    '" placeholder="' +
    esc(ph || '') +
    '"' +
    (required ? ' required data-label="' + esc(label) + '"' : '') +
    '></label>'
  );
}
function fNum(name, label, val, ph) {
  return (
    '<label class="field"><span>' +
    esc(label) +
    '</span>' +
    '<input name="' +
    name +
    '" type="number" step="any" inputmode="decimal" value="' +
    (val == null || val === '' ? '' : esc(val)) +
    '" placeholder="' +
    esc(ph || '') +
    '"></label>'
  );
}
function fDate(name, label, val) {
  return (
    '<label class="field"><span>' +
    esc(label) +
    '</span>' +
    '<input name="' +
    name +
    '" type="date" value="' +
    esc(val || '') +
    '"></label>'
  );
}
function fSel(name, label, val, options) {
  return (
    '<label class="field"><span>' +
    esc(label) +
    '</span><select name="' +
    name +
    '">' +
    optionList(options, val) +
    '</select></label>'
  );
}
/* ==================================================================
   8. 导出
   ================================================================== */
const csv = {
  esc: function (v) {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  },
  build: function (rows, cols) {
    const head = cols
      .map(function (c) {
        return csv.esc(c.label);
      })
      .join(',');
    const body = rows
      .map(function (r) {
        return cols
          .map(function (c) {
            return csv.esc(c.get(r));
          })
          .join(',');
      })
      .join('\r\n');
    return '\uFEFF' + head + '\r\n' + body;
  },
  download: function (filename, text, mime) {
    const blob = new Blob([text], {
      type: (mime || 'text/csv') + ';charset=utf-8;',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
    }, 1500);
  },
  COLS: {
    wants: [
      {
        label: '物品名',
        get: function (r) {
          return r.name;
        },
      },
      {
        label: '谁要的',
        get: function (r) {
          return r.owner;
        },
      },
      {
        label: '分类',
        get: function (r) {
          return r.cat;
        },
      },
      {
        label: '数量',
        get: function (r) {
          return r.qty;
        },
      },
      {
        label: '单位',
        get: function (r) {
          return r.unit;
        },
      },
      {
        label: '急不急',
        get: function (r) {
          return r.urgent;
        },
      },
      {
        label: '状态',
        get: function (r) {
          return r.status === 'bought' ? '已买到' : '待买';
        },
      },
      {
        label: '登记日',
        get: function (r) {
          return r.createdAt;
        },
      },
      {
        label: '买到日',
        get: function (r) {
          return r.doneAt;
        },
      },
      {
        label: '备注',
        get: function (r) {
          return r.note;
        },
      },
    ],
    items: [
      {
        label: '物品名',
        get: function (r) {
          return r.name;
        },
      },
      {
        label: '分类',
        get: function (r) {
          return r.cat;
        },
      },
      {
        label: '谁用',
        get: function (r) {
          return r.owner;
        },
      },
      {
        label: '记法',
        get: function (r) {
          return r.track === 'state' ? '记状态' : '记数量';
        },
      },
      {
        label: '数量',
        get: function (r) {
          return r.track === 'state' ? '' : r.qty;
        },
      },
      {
        label: '单位',
        get: function (r) {
          return r.unit;
        },
      },
      {
        label: '状态',
        get: function (r) {
          return r.track === 'state'
            ? r.level || ''
            : isLow(r)
              ? '该补'
              : '充足';
        },
      },
      {
        label: '补货阈值',
        get: function (r) {
          return r.track === 'state' ? '' : r.lowAt;
        },
      },
      {
        label: '到期日',
        get: function (r) {
          return r.expire;
        },
      },
      {
        label: '存放位置',
        get: function (r) {
          return r.place;
        },
      },
      {
        label: '备注',
        get: function (r) {
          return r.note;
        },
      },
    ],
    logs: [
      {
        label: '日期',
        get: function (r) {
          return r.date;
        },
      },
      {
        label: '类型',
        get: function (r) {
          return r.type;
        },
      },
      {
        label: '物品',
        get: function (r) {
          return r.name;
        },
      },
      {
        label: '数量',
        get: function (r) {
          return r.qty;
        },
      },
      {
        label: '单位',
        get: function (r) {
          return r.unit;
        },
      },
      {
        label: '金额',
        get: function (r) {
          return r.amount || '';
        },
      },
      {
        label: '备注',
        get: function (r) {
          return r.note;
        },
      },
    ],
  },
  names: { wants: '采购需求', items: '库存清单', logs: '出入库流水' },
  exportOne: function (key) {
    let rows = [];
    if (key === 'wants') rows = S().wants;
    if (key === 'items') rows = S().items;
    if (key === 'logs') rows = S().logs;
    if (!rows.length)
      return toast('「' + (this.names[key] || key) + '」还没有数据');
    this.download(
      (S().shopName || '工作台') +
        '-' +
        this.names[key] +
        '-' +
        stampStr() +
        '.csv',
      this.build(rows, this.COLS[key]),
    );
    toast('已导出 ' + rows.length + ' 条');
  },
  exportAll: function () {
    const all = [];
    S().wants.forEach(function (r) {
      all.push({
        m: '采购需求',
        d: r.createdAt,
        n: r.name,
        c: r.cat,
        o: r.owner,
        q: r.qty,
        u: r.unit,
        s:
          (r.status === 'bought' ? '已买到' : '待买') +
          (r.urgent ? ' · ' + r.urgent : ''),
        e: '',
        p: '',
        a: '',
        nt: r.note,
      });
    });
    S().items.forEach(function (r) {
      all.push({
        m: '库存物品',
        d: r.addedAt,
        n: r.name,
        c: r.cat,
        o: r.owner,
        q: r.track === 'state' ? '' : r.qty,
        u: r.unit,
        s: r.track === 'state' ? r.level || '' : isLow(r) ? '该补' : '充足',
        e: r.expire,
        p: r.place,
        a: '',
        nt: r.note,
      });
    });
    S().logs.forEach(function (r) {
      all.push({
        m: '出入库流水',
        d: r.date,
        n: r.name,
        c: '',
        o: '',
        q: r.qty,
        u: r.unit,
        s: r.type,
        e: '',
        p: '',
        a: r.amount || '',
        nt: r.note,
      });
    });
    if (!all.length) return toast('还没有任何数据');
    const cols = [
      {
        label: '模块',
        get: function (r) {
          return r.m;
        },
      },
      {
        label: '日期',
        get: function (r) {
          return r.d;
        },
      },
      {
        label: '名称',
        get: function (r) {
          return r.n;
        },
      },
      {
        label: '分类',
        get: function (r) {
          return r.c;
        },
      },
      {
        label: '谁',
        get: function (r) {
          return r.o;
        },
      },
      {
        label: '数量',
        get: function (r) {
          return r.q;
        },
      },
      {
        label: '单位',
        get: function (r) {
          return r.u;
        },
      },
      {
        label: '状态',
        get: function (r) {
          return r.s;
        },
      },
      {
        label: '到期日',
        get: function (r) {
          return r.e;
        },
      },
      {
        label: '存放位置',
        get: function (r) {
          return r.p;
        },
      },
      {
        label: '金额',
        get: function (r) {
          return r.a;
        },
      },
      {
        label: '备注',
        get: function (r) {
          return r.nt;
        },
      },
    ];
    this.download(
      (S().shopName || '工作台') + '-全部-' + stampStr() + '.csv',
      this.build(all, cols),
    );
    toast('已导出全部 ' + all.length + ' 条');
  },
  exportJSON: function () {
    const snap = store.exportState();
    snap.exportedAt = new Date().toISOString();
    this.download(
      (S().shopName || '工作台') + '-备份-' + stampStr() + '.json',
      JSON.stringify(snap, null, 2),
      'application/json',
    );
    toast('备份已下载');
  },
  importJSON: function (file) {
    const fr = new FileReader();
    fr.onload = function () {
      try {
        const data = JSON.parse(fr.result);
        if (!data || typeof data !== 'object') throw new Error('bad');
        if (!confirm('导入会用备份的内容覆盖当前全部数据，确定继续吗？'))
          return;
        store.importState(data);
        render();
        toast('导入成功');
      } catch (e) {
        toast('这个文件读不出来，换一个试试');
      }
    };
    fr.readAsText(file);
  },
};
/* ==================================================================
   9. 事件
   ================================================================== */
document.addEventListener('click', function (e) {
  const t = e.target;
  if (t.closest('[data-close]')) {
    closeModal();
    return;
  }
  const gotoBtn = t.closest('[data-goto]');
  if (gotoBtn) {
    goto(gotoBtn.dataset.goto);
    return;
  }
  /* 勾起「买到了」 */
  const buy = t.closest('[data-buy]');
  if (buy) {
    openBuyModal(buy.dataset.buy);
    return;
  }
  const undo = t.closest('[data-undo]');
  if (undo) {
    store.updateWant(undo.dataset.undo, { status: 'todo', doneAt: '' });
    render();
    toast('放回待买清单');
    return;
  }
  const delWant = t.closest('[data-delwant]');
  if (delWant) {
    if (confirm('删掉这条采购需求？')) {
      store.removeWant(delWant.dataset.delwant);
      render();
      toast('已删除');
    }
    return;
  }
  /* 库存加减与状态 */
  const inc = t.closest('[data-inc]');
  if (inc) {
    const it = store.getItem(inc.dataset.inc);
    if (it) {
      store.updateItem(it._id, { qty: Number(it.qty || 0) + 1 });
      render();
    }
    return;
  }
  const dec = t.closest('[data-dec]');
  if (dec) {
    const it = store.getItem(dec.dataset.dec);
    if (it) {
      const cur = Number(it.qty || 0);
      if (cur <= 0) {
        toast('已经是 0 了，加一件或直接删掉');
        return;
      }
      const patch = { qty: cur - 1 };
      if (it.track === 'state') patch.level = cur - 1 <= 0 ? '没了' : '不多了';
      store.updateItem(it._id, patch);
      store.addLog({
        date: todayStr(),
        type: '取用',
        name: it.name,
        qty: 1,
        unit: it.unit || '',
      });
      render();
    }
    return;
  }
  const lv = t.closest('[data-lv]');
  if (lv) {
    store.updateItem(lv.dataset.lv, { level: lv.dataset.val });
    render();
    return;
  }
  const editItem = t.closest('[data-edititem]');
  if (editItem) {
    openItemModal(editItem.dataset.edititem);
    return;
  }
  const delItem = t.closest('[data-delitem]');
  if (delItem) {
    const it = store.getItem(delItem.dataset.delitem);
    if (it && confirm('从库存里删掉「' + it.name + '」？历史流水会保留。')) {
      store.removeItem(it._id);
      render();
      toast('已删除');
    }
    return;
  }
  const delLog = t.closest('[data-dellog]');
  if (delLog) {
    if (confirm('删掉这条流水？')) {
      store.removeLog(delLog.dataset.dellog);
      render();
    }
    return;
  }
  /* 临期处理 */
  const use = t.closest('[data-use]');
  if (use) {
    const it = store.getItem(use.dataset.use);
    if (it) {
      if (it.track === 'count') {
        const left = Math.max(0, Number(it.qty || 0) - 1);
        store.updateItem(it._id, { qty: left });
      } else {
        store.updateItem(it._id, { level: '充足' });
      }
      store.addLog({
        date: todayStr(),
        type: '取用',
        name: it.name,
        qty: 1,
        unit: it.unit || '',
      });
      render();
      toast('用掉一件');
    }
    return;
  }
  const waste = t.closest('[data-waste]');
  if (waste) {
    openWasteModal(waste.dataset.waste);
    return;
  }
  /* 库存页控件 */
  const f = t.closest('[data-filter]');
  if (f) {
    S().ui.stockFilter = f.dataset.filter;
    store.save();
    el('stockBody').innerHTML = stockBody();
    document.querySelectorAll('.chip[data-filter]').forEach(function (c) {
      c.classList.toggle('on', c.dataset.filter === S().ui.stockFilter);
    });
    return;
  }
  if (t.closest('[data-clearfilter]')) {
    S().ui.stockFilter = 'all';
    S().ui.stockCat = '';
    S().ui.stockPlace = '';
    S().ui.stockQ = '';
    store.save();
    render();
    return;
  }
  if (t.closest('[data-newitem]')) {
    openItemModal(null);
    return;
  }
  if (t.closest('#addItemBtn')) {
    openItemModal(null);
    return;
  }
  if (t.closest('#toggleDone')) {
    S().ui.wantsDone = !S().ui.wantsDone;
    store.save();
    render();
    return;
  }
  if (t.closest('#toggleLogs')) {
    S().ui.stockSub = S().ui.stockSub === 'logs' ? 'items' : 'logs';
    store.save();
    render();
    return;
  }
  if (t.closest('#wantAddBtn')) {
    addWantFromForm();
    return;
  }
  /* 导出 */
  const ex = t.closest('[data-export]');
  if (ex) {
    const k = ex.dataset.export;
    if (k === 'all') csv.exportAll();
    else csv.exportOne(k);
    return;
  }
  if (t.closest('#backupBtn')) {
    csv.exportJSON();
    return;
  }
  if (t.closest('#restoreBtn')) {
    el('fileInput').click();
    return;
  }
  if (t.closest('#saveSettings')) {
    saveSettings();
    return;
  }
  if (t.closest('#wipeBtn')) {
    if (confirm('确定清空全部数据吗？此操作无法撤销。建议先下载 JSON 备份。')) {
      if (confirm('再确认一次：所有采购需求、库存、流水都会被删掉。')) {
        store._s = store.defaults();
        store.save();
        render();
        toast('已清空');
      }
    }
    return;
  }
  if (t.closest('#loginBtn')) {
    openLoginModal();
    return;
  }
  if (t.closest('#logoutBtn')) {
    logout();
    return;
  }
  if (t.closest('#syncNowBtn')) {
    syncNow();
    return;
  }
  if (t.closest('#bindOpenIdBtn')) {
    bindOpenId();
    return;
  }
  if (t.closest('#mergeAccountBtn')) {
    mergeAccounts();
    return;
  }
});
document.addEventListener('submit', async function (e) {
  e.preventDefault();
  const t = e.target;
  if (t.id === 'quickForm') {
    const inp = el('quickInput');
    const v = (inp.value || '').trim();
    if (!v) {
      toast('写点什么再记');
      return;
    }
    store.addWant({
      name: v,
      owner: S().members[0],
      urgent: '这周',
      qty: '',
      unit: '',
      cat: '',
      note: '',
    });
    inp.value = '';
    render();
    inp.focus();
    toast('记下了，去「要买什么」还能补充');
    return;
  }
  if (t.id === 'wantQuick') {
    addWantFromForm();
    return;
  }
  if (t.id === 'modalForm') {
    if (!modalSubmit) {
      closeModal();
      return;
    }
    const need = Array.prototype.slice
      .call(t.querySelectorAll('[required]'))
      .filter(function (i) {
        return !String(i.value || '').trim();
      });
    if (need.length) {
      toast('「' + (need[0].dataset.label || '必填项') + '」还不能空着');
      try {
        need[0].focus();
      } catch (e2) {}
      return;
    }
    const data = formObj(t);
    if (!modalSubmit) return;
    const r = modalSubmit(data);
    if (r && typeof r.then === 'function') {
      const footBtn = el('modalFoot').querySelector('.btn.primary');
      const spin =
        '<svg class="ic btn-spin" viewBox="0 0 24 24" width="16" height="16" fill="none" ' +
        'stroke="currentColor" stroke-width="2.25" stroke-linecap="round" aria-hidden="true">' +
        (ICONS.sync || '') +
        '</svg>';
      const old = footBtn ? footBtn.innerHTML : '';
      if (footBtn) {
        footBtn.disabled = true;
        footBtn.innerHTML = spin + '处理中…';
      }
      try {
        await r;
      } finally {
        if (footBtn && el('modal').hidden === false) {
          footBtn.disabled = false;
          footBtn.innerHTML = old;
        }
      }
    }
    return;
  }
});
document.addEventListener('input', function (e) {
  const t = e.target;
  if (t.id === 'stockSearch') {
    S().ui.stockQ = t.value;
    store.save();
    el('stockBody').innerHTML = stockBody();
    return;
  }
  if (t.id === 'setName') {
    S().shopName = t.value || '暖心小屋';
    store.save();
    el('brandTitle').textContent = S().shopName;
    return;
  }
  if (t.id === 'setTagline') {
    S().tagline = t.value || DEFAULTS.tagline;
    store.save();
    el('brandSub').textContent = S().tagline;
    return;
  }
});
document.addEventListener('change', function (e) {
  const t = e.target;
  if (t.id === 'fileInput') {
    if (t.files && t.files[0]) csv.importJSON(t.files[0]);
    t.value = '';
    return;
  }
  if (t.id === 'stockCat') {
    S().ui.stockCat = t.value;
    store.save();
    el('stockBody').innerHTML = stockBody();
    return;
  }
  if (t.id === 'stockPlace') {
    S().ui.stockPlace = t.value;
    store.save();
    el('stockBody').innerHTML = stockBody();
    return;
  }
  if (t.id === 'trackSel') {
    el('trackCount').style.display = t.value === 'count' ? 'block' : 'none';
    el('trackState').style.display = t.value === 'state' ? 'block' : 'none';
    return;
  }
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && !el('modal').hidden) closeModal();
});
function addWantFromForm() {
  const name = (el('wantInput').value || '').trim();
  if (!name) {
    toast('先把想买的东西写上');
    el('wantInput').focus();
    return;
  }
  store.addWant({
    name: name,
    owner: el('wantOwner').value,
    qty: el('wantQty').value === '' ? '' : Number(el('wantQty').value),
    unit: (el('wantUnit').value || '').trim(),
    urgent: el('wantUrgent').value,
    note: (el('wantNote').value || '').trim(),
    cat: '',
  });
  ['wantInput', 'wantQty', 'wantUnit', 'wantNote'].forEach(function (id) {
    el(id).value = '';
  });
  render();
  el('wantInput').focus();
  toast('加进清单了');
}
function saveSettings() {
  S().shopName = (el('setName').value || '').trim() || '暖心小屋';
  S().tagline = (el('setTagline').value || '').trim() || DEFAULTS.tagline;
  S().members = splitList(el('setMembers').value, S().members);
  S().cats = splitList(el('setCats').value, S().cats);
  S().places = splitList(el('setPlaces').value, S().places);
  const f = Number(el('setFresh').value),
    sn = Number(el('setSoon').value);
  S().freshDays = f > 0 && f <= 60 ? f : 7;
  S().soonDays = sn > 0 && sn <= 365 ? sn : 30;
  store.save();
  render();
  toast('设置保存好了');
}
function splitList(str, fallback) {
  const arr = String(str || '')
    .split(/[，,、\s]+/)
    .map(function (x) {
      return x.trim();
    })
    .filter(Boolean);
  return arr.length
    ? arr.filter(function (v, i) {
        return arr.indexOf(v) === i;
      })
    : fallback;
}
/* ==================================================================
   10. 启动
   ================================================================== */
(function init() {
  authStore.load();
  store.load();
  document.querySelectorAll('.side-foot .glyph').forEach(function (g) {
    g.innerHTML = icon('settings', 20);
  });
  if (store.storageBroken) {
    setTimeout(function () {
      toast(
        '浏览器不让本地存数据（Safari 用 file:// 打开时常见），建议用 Chrome 打开',
      );
    }, 900);
  }
  render();
  // 用本地未过期 token 恢复登录态（服务端仍逐请求验签兜底）；
  // 先拉取合并，成功后才开自动同步，防处女态在竞态窗口内被推上云端
  checkAuth().then(function (authed) {
    if (!authed) return;
    cloudSyncPull().then(function (r) {
      if (r.status === 'error' || r.status === 'busy') return;
      if (r.status === 'data' && cloudMergeRemote(r)) {
        render();
        toast('已同步云端数据');
      }
      cloudSync.enabled = true;
    });
  });
})();
