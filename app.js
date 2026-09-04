const pageTitles = { overview: '总览', items: '周边', inventory: '仓库', orders: '订单' };
const backdrop = document.querySelector('#modalBackdrop');
const modalTitle = document.querySelector('#modalTitle');
const modalKicker = document.querySelector('#modalKicker');
const modalCopy = document.querySelector('#modalCopy');
const modalDropzone = document.querySelector('#modalDropzone');
const modalFields = document.querySelector('#modalFields');
const modalConfirm = document.querySelector('#modalConfirm');
const toast = document.querySelector('#toast');
const toastText = document.querySelector('#toastText');
let pendingRefundRow = null;
let pendingOrderId = null;
let pendingItemId = null;
let currentModalMode = null;
let orderFilter = 'all';
let stockFilter = 'all';
let stockMemberFilter = 'all';
let platformFilter = 'all';
let cloudClient = null;
let cloudUser = null;
let cloudSyncTimer = null;
let cloudApplying = false;
let cloudSyncing = false;
let cloudSyncQueued = false;
let lastCloudUpdatedAt = null;
let cloudChannel = null;

const FAMILY_VARIANT_KEY = 'blue-ledger.family-variant';
const ITEM_PROFILE_KEY = 'blue-ledger.item-profile';
const EXTRA_ITEMS_KEY = 'blue-ledger.extra-items';
const DELETED_ITEMS_KEY = 'blue-ledger.deleted-items';
const ORDERS_KEY = 'blue-ledger.orders';
const STOCK_KEY = 'blue-ledger.stock';
const SUPABASE_URL = 'https://yjhopazkhcetzgeusjqw.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable__NiPUBbWuHKlclTKLhvL0A_PjotNQD4';
const CLOUD_TABLE = 'blue_ledger_data';
const APP_URL = 'https://cheng-qtve00.github.io/tf4-blue-ledger/';
const MERCH_ID = 'love-love-love';
const TF4_MEMBERS = ['官俊臣', '张桂源', '张函瑞', '王橹杰', '王烁然', '左奇函', '陈奕恒', '杨博文', '杨涵博', '张奕然', '聂玮辰', '陈思罕', '魏子宸', '李煜东', '陈浚铭'];
const DEFAULT_ITEM_PROFILE = {
  name: '奔跑 · LOVE LOVE LOVE',
  styleType: 'single',
  price: '79',
  limit: '1',
  memberScope: '15 位成员均有对应款式',
  members: TF4_MEMBERS,
  contents: '明信片×15、亚克力别针×1、撕拉片×2、NFC卡套×1、拍立得×1、小卡×2',
};
const ITEM_STYLE_TYPES = ['single', 'family', 'both'];
let familyVariant = loadFamilyVariant();
let itemProfile = loadStoredValue(ITEM_PROFILE_KEY, DEFAULT_ITEM_PROFILE);
let extraItems = loadStoredValue(EXTRA_ITEMS_KEY, []);
if (!Array.isArray(extraItems)) extraItems = [];
let deletedItemIds = loadStoredValue(DELETED_ITEMS_KEY, []);
if (!Array.isArray(deletedItemIds)) deletedItemIds = [];
let orders = loadStoredValue(ORDERS_KEY, []);
if (!Array.isArray(orders)) orders = [];
let storedStock = loadStoredValue(STOCK_KEY, []);
if (!Array.isArray(storedStock)) storedStock = [];
let stock = storedStock.map((item) => (
  item.status === '运输中' ? { ...item, status: '官方待发货' } : item
));

const modalModes = {
  newItem: { kicker: 'NEW MERCH', title: '添加新周边', copy: '先选择这次实际存在的款式；单人款只勾选实际有款的成员，后续下单时只会显示这些成员。', drop: true, confirm: '保存新周边' },
  addFamily: { kicker: 'ADD VARIANT', title: '添加家族款', copy: '家族款与单人款分别计价、计算库存和盈亏，不需要选择成员。', drop: false, confirm: '保存家族款' },
  newOrder: { kicker: 'ORDER', title: '新增代拍订单', copy: '选择买家、周边和成员；选择家族款时会自动带出家族款价格。', drop: false, confirm: '创建订单' },
  newStock: { kicker: 'OFFICIAL PURCHASE', title: '记录官方购买', copy: '选择周边和成员后记录囤货或自留；这一步不会创建买家订单。', drop: false, confirm: '加入仓库' },
  sellStock: { kicker: 'FROM STORAGE', title: '从仓库卖出', copy: '选择一件现货，系统会自动带出成本和库存数量。', drop: false, confirm: '创建订单' },
  refundStock: { kicker: 'CANCEL OFFICIAL ORDER', title: '退款并移除库存', copy: '只适用于官方尚未发货的商品。退款后，库存数量和垫付金额会同步扣除。', drop: false, confirm: '确认退款' },
  itemDetail: { kicker: 'MERCH DETAIL', title: '周边详情', copy: '额度分配、订单去向和仓库数量都集中在这里。', drop: false, confirm: '保存修改' },
  orderDetail: { kicker: 'ORDER DETAIL', title: '订单详情', copy: '发货、物流和收款可以在同一个页面完成。', drop: false, confirm: '保存处理' },
  syncAccount: { kicker: 'CLOUD SYNC', title: '登录并同步', copy: '主屏幕版和 Safari 的登录互不相通。发送邮件后，复制邮件里的登录链接，或复制登录成功后的页面地址，再回到这里粘贴。', drop: false, confirm: '发送登录邮件' },
};

const modalFieldTemplates = {
  newItem: '<label>周边名称<input data-item-field="name" placeholder="例如：奔跑 · LOVE LOVE LOVE" /></label><div class="style-type-block"><span>这次有哪些款式</span><input data-item-field="styleType" type="hidden" value="single" /><div class="style-type-options"><button type="button" data-style-type="single"><strong>单人款</strong><small>选择实际有款的成员</small></button><button type="button" data-style-type="family"><strong>家族款</strong><small>不区分成员</small></button><button type="button" data-style-type="both"><strong>两种都有</strong><small>价格和限购分开记</small></button></div></div><div class="field-grid"><label><span data-price-label>单人款单价</span><input data-item-field="price" inputmode="decimal" placeholder="元" /></label><label><span data-limit-label>单人款每 ID 限购</span><input data-item-field="limit" inputmode="numeric" placeholder="份数" /></label></div><div class="member-picker-block" data-member-picker-block><div class="member-picker-heading"><span>实际有单人款的成员</span><span class="member-picker-actions"><button type="button" data-members-select-all>全选</button><button type="button" data-members-clear>清空</button><small data-member-count>未选择</small></span></div><p class="member-picker-help">不默认全员。只勾选官方通知中明确有款的成员。</p><div class="member-picker" data-member-picker></div></div><label><span data-contents-label>单人款套装内容</span><input data-item-field="contents" placeholder="选填，例如：小卡、明信片" /></label><div class="family-fields" data-family-fields><div class="family-fields-title">家族款资料</div><div class="field-grid"><label>家族款单价<input data-family-field="price" inputmode="decimal" placeholder="元" /></label><label>家族款限购<input data-family-field="limit" inputmode="numeric" placeholder="份数" /></label></div><label>家族款内容<input data-family-field="contents" placeholder="选填" /></label></div>',
  addFamily: '<label>所属周边<input data-family-field="owner" readonly /></label><div class="field-grid"><label>款式类型<input value="家族款" readonly /></label><label>官方单价<input data-family-field="price" placeholder="按官方通知填写" inputmode="decimal" /></label></div><label>每 ID 限购<input data-family-field="limit" placeholder="按官方通知填写" inputmode="numeric" /></label><label>套装内容<input data-family-field="contents" placeholder="填写家族款实际包含的周边" /></label>',
  newOrder: '<label>买家昵称<input data-order-field="buyer" placeholder="填写闲鱼或微信昵称" /></label><div class="field-grid"><label>选择周边<select data-order-field="merch"></select></label><label>选择成员 / 家族款<select data-order-field="member"></select></label></div><div class="field-grid"><label>购买数量<input data-order-field="quantity" value="1" inputmode="numeric" /></label><label>官方单价<input data-order-field="cost" inputmode="decimal" readonly /></label></div><div class="field-grid"><label>方式<select data-order-field="method"><option value="垫付">垫付</option><option value="提确">提确</option></select></label><label>交易平台<select data-order-field="platform"><option value="闲鱼">闲鱼</option><option value="微信">微信</option></select></label></div><label>代拍收款<input data-order-field="revenue" placeholder="例如：99" inputmode="decimal" /></label><label>收货地址<input data-order-field="address" placeholder="闲鱼拍下后粘贴地址" /></label>',
  newStock: '<div class="field-grid"><label>选择周边<select data-stock-field="merch"></select></label><label>选择成员 / 家族款<select data-stock-field="member"></select></label></div><div class="field-grid"><label>购买数量<input data-stock-field="quantity" value="1" inputmode="numeric" /></label><label>去向<select data-stock-field="intent"><option value="囤货">囤货</option><option value="自留">自留</option></select></label></div><div class="field-grid"><label>当前状态<select data-stock-field="status"><option value="官方待发货">官方待发货</option><option value="已到家">已到家</option></select></label><label>官方单价<input data-stock-field="cost" readonly /></label></div>',
  sellStock: '<label>选择现货<select data-sale-field="stockId"></select></label><div class="field-grid"><label>买家昵称<input data-sale-field="buyer" /></label><label>卖出数量<input data-sale-field="quantity" value="1" inputmode="numeric" /></label></div><div class="field-grid"><label>成交金额<input data-sale-field="revenue" inputmode="decimal" /></label><label>实际邮费<input data-sale-field="postage" value="0" inputmode="decimal" /></label></div><div class="field-grid"><label>交易平台<select data-sale-field="platform"><option value="闲鱼">闲鱼</option><option value="微信">微信</option></select></label><label>库存成本<input data-sale-field="cost" readonly /></label></div><label>买家地址<input data-sale-field="address" placeholder="从闲鱼订单粘贴" /></label>',
  refundStock: '<label>退款商品<input value="奔跑 · LOVE LOVE LOVE 单人款" /></label><div class="field-grid"><label>退款数量<input value="1" inputmode="numeric" /></label><label>退款金额<input value="79.00" inputmode="decimal" /></label></div><label>退款原因<input value="资金安排调整" /></label>',
  itemDetail: '<label>周边名称<input data-item-field="name" /></label><div class="style-type-block"><span>这件周边有哪些款式</span><input data-item-field="styleType" type="hidden" value="single" /><div class="style-type-options"><button type="button" data-style-type="single"><strong>单人款</strong><small>选择实际有款的成员</small></button><button type="button" data-style-type="family"><strong>家族款</strong><small>不区分成员</small></button><button type="button" data-style-type="both"><strong>两种都有</strong><small>价格和限购分开记</small></button></div></div><div class="field-grid"><label><span data-price-label>单人款单价</span><input data-item-field="price" inputmode="decimal" /></label><label><span data-limit-label>单人款每 ID 限购</span><input data-item-field="limit" inputmode="numeric" /></label></div><div class="member-picker-block" data-member-picker-block><div class="member-picker-heading"><span>实际有单人款的成员</span><span class="member-picker-actions"><button type="button" data-members-select-all>全选</button><button type="button" data-members-clear>清空</button><small data-member-count></small></span></div><p class="member-picker-help">只勾选这件周边实际包含的成员。</p><div class="member-picker" data-member-picker></div></div><label><span data-contents-label>单人款套装内容</span><input data-item-field="contents" /></label><div class="family-fields" data-family-fields><div class="family-fields-title">家族款资料</div><div class="field-grid"><label>家族款单价<input data-family-field="price" inputmode="decimal" placeholder="元" /></label><label>家族款限购<input data-family-field="limit" inputmode="numeric" placeholder="份数" /></label></div><label>家族款内容<input data-family-field="contents" placeholder="选填" /></label></div>',
  orderDetail: '<label>当前处理<select data-order-detail-field="stage"><option value="待处理">待处理</option><option value="已发货">已发货</option><option value="已收款">已收款</option><option value="已完成">已完成</option></select></label><div class="field-grid"><label>物流单号<input data-order-detail-field="tracking" placeholder="闲鱼订单发货后填写" /></label><label>实际邮费<input data-order-detail-field="postage" placeholder="0.00" inputmode="decimal" /></label></div><div class="field-grid"><label>代拍收款<input data-order-detail-field="revenue" inputmode="decimal" /></label><label>收货地址<input data-order-detail-field="address" /></label></div><label>备注 <input data-order-detail-field="note" placeholder="选填" /></label>',
  syncAccount: '<label>登录邮箱<input data-sync-field="email" type="email" inputmode="email" autocapitalize="none" autocomplete="email" placeholder="填写常用邮箱" /></label><div class="sync-account-note" data-sync-message>1. 点击“发送登录邮件”<br />2. 在邮件正文里长按蓝色 Sign in 按钮，选择“复制链接地址”<br />3. 回到这里粘贴，不要复制 QQ 邮箱顶部的页面地址</div><div class="sync-link-block"><label>登录链接或登录后的地址<input data-sync-field="magicLink" type="url" inputmode="url" autocapitalize="none" autocomplete="off" placeholder="长按粘贴完整链接" /></label><button class="secondary-button sync-link-button" type="button" data-sync-link-login>使用粘贴的链接登录</button></div><button class="remove-variant-button sync-signout" type="button" data-cloud-signout hidden>退出云端账号</button>',
};

function switchPage(page) {
  document.querySelectorAll('.page-section').forEach((section) => section.classList.toggle('active', section.id === `${page}Page`));
  document.querySelectorAll('[data-page]').forEach((item) => item.classList.toggle('active', item.dataset.page === page));
  document.querySelector('#pageTitle').textContent = pageTitles[page];
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function loadStoredValue(key, fallback) {
  try {
    const saved = JSON.parse(window.localStorage.getItem(key));
    return saved ?? fallback;
  } catch {
    return fallback;
  }
}

function loadFamilyVariant() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(FAMILY_VARIANT_KEY));
    return saved && saved.price && saved.limit ? saved : null;
  } catch {
    return null;
  }
}

function formatPrice(value) {
  return Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

function formatMoney(value) {
  return Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function persist(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
  queueCloudSync();
}

function cloudPayload() {
  return {
    version: 2,
    itemProfile,
    familyVariant,
    extraItems,
    deletedItemIds,
    orders,
    stock,
  };
}

function setSyncStatus(state, detail = '') {
  const labels = {
    local: '登录以同步',
    syncing: '正在同步',
    synced: '云端已同步',
    error: '同步失败',
  };
  document.querySelectorAll('#syncPill, #profileSync').forEach((element) => {
    element.dataset.syncState = state;
    element.innerHTML = `<i></i> ${labels[state] || labels.local}`;
    element.title = detail || (state === 'synced' ? `已登录：${cloudUser?.email || ''}` : '登录后可在手机和电脑间同步');
  });
}

function saveCloudPayloadLocally(payload) {
  window.localStorage.setItem(ITEM_PROFILE_KEY, JSON.stringify(payload.itemProfile));
  if (payload.familyVariant) window.localStorage.setItem(FAMILY_VARIANT_KEY, JSON.stringify(payload.familyVariant));
  else window.localStorage.removeItem(FAMILY_VARIANT_KEY);
  window.localStorage.setItem(EXTRA_ITEMS_KEY, JSON.stringify(payload.extraItems));
  window.localStorage.setItem(DELETED_ITEMS_KEY, JSON.stringify(payload.deletedItemIds || []));
  window.localStorage.setItem(ORDERS_KEY, JSON.stringify(payload.orders));
  window.localStorage.setItem(STOCK_KEY, JSON.stringify(payload.stock));
}

function applyCloudPayload(payload) {
  if (!payload || typeof payload !== 'object') return;
  cloudApplying = true;
  itemProfile = payload.itemProfile && typeof payload.itemProfile === 'object' ? payload.itemProfile : itemProfile;
  familyVariant = payload.familyVariant && typeof payload.familyVariant === 'object' ? payload.familyVariant : null;
  extraItems = Array.isArray(payload.extraItems) ? payload.extraItems : [];
  deletedItemIds = Array.isArray(payload.deletedItemIds) ? payload.deletedItemIds : deletedItemIds;
  orders = Array.isArray(payload.orders) ? payload.orders : [];
  stock = Array.isArray(payload.stock) ? payload.stock.map((item) => (
    item.status === '运输中' ? { ...item, status: '官方待发货' } : item
  )) : [];
  saveCloudPayloadLocally(cloudPayload());
  cloudApplying = false;
  renderItemProfile();
  populateStockMemberFilter();
  renderOrders();
  renderDashboard();
  renderStock();
}

function queueCloudSync() {
  if (!cloudClient || !cloudUser || cloudApplying) return;
  window.clearTimeout(cloudSyncTimer);
  setSyncStatus('syncing');
  cloudSyncTimer = window.setTimeout(() => syncToCloud(), 650);
}

async function syncToCloud() {
  if (!cloudClient || !cloudUser || cloudApplying) return false;
  if (cloudSyncing) {
    cloudSyncQueued = true;
    return false;
  }
  cloudSyncing = true;
  setSyncStatus('syncing');
  const updatedAt = new Date().toISOString();
  const { error } = await cloudClient.from(CLOUD_TABLE).upsert({
    user_id: cloudUser.id,
    payload: cloudPayload(),
    updated_at: updatedAt,
  }, { onConflict: 'user_id' });
  cloudSyncing = false;
  if (error) {
    console.error('Cloud sync failed', error);
    setSyncStatus('error', error.message);
    return false;
  }
  lastCloudUpdatedAt = updatedAt;
  setSyncStatus('synced');
  if (cloudSyncQueued) {
    cloudSyncQueued = false;
    queueCloudSync();
  }
  return true;
}

async function loadCloudLedger({ quiet = false } = {}) {
  if (!cloudClient || !cloudUser || cloudSyncing) return;
  const { data, error } = await cloudClient
    .from(CLOUD_TABLE)
    .select('payload, updated_at')
    .eq('user_id', cloudUser.id)
    .maybeSingle();
  if (error) {
    console.error('Cloud load failed', error);
    setSyncStatus('error', error.message);
    return;
  }
  if (!data) {
    const uploaded = await syncToCloud();
    if (uploaded && !quiet) showToast('本机记录已上传到云端');
    return;
  }
  if (data.updated_at !== lastCloudUpdatedAt) {
    lastCloudUpdatedAt = data.updated_at;
    applyCloudPayload(data.payload);
    if (!quiet) showToast('已载入云端记录');
  }
  setSyncStatus('synced');
}

async function connectCloudUser(user, options = {}) {
  cloudUser = user;
  setSyncStatus('syncing');
  await loadCloudLedger(options);
  subscribeToCloudChanges();
}

function subscribeToCloudChanges() {
  if (!cloudClient || !cloudUser) return;
  if (cloudChannel) cloudClient.removeChannel(cloudChannel);
  cloudChannel = cloudClient
    .channel(`blue-ledger-${cloudUser.id}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: CLOUD_TABLE,
      filter: `user_id=eq.${cloudUser.id}`,
    }, (change) => {
      const next = change.new;
      if (!next?.payload || next.updated_at === lastCloudUpdatedAt || cloudSyncing) return;
      lastCloudUpdatedAt = next.updated_at;
      applyCloudPayload(next.payload);
      showToast('已收到另一台设备的更新');
    })
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        // The periodic pull remains available when realtime is disabled on the project.
        console.warn('Cloud realtime unavailable', status);
      }
    });
}

async function initCloudSync() {
  if (!window.supabase?.createClient) {
    setSyncStatus('error', '同步服务未能载入，请检查网络后刷新');
    return;
  }
  cloudClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const { data, error } = await cloudClient.auth.getSession();
  if (error) {
    setSyncStatus('error', error.message);
  } else if (data.session?.user) {
    await connectCloudUser(data.session.user);
  } else {
    setSyncStatus('local');
  }
  cloudClient.auth.onAuthStateChange((event, session) => {
    window.setTimeout(async () => {
      if (session?.user) {
        const isNewLogin = cloudUser?.id !== session.user.id;
        await connectCloudUser(session.user, { quiet: !isNewLogin });
      } else {
        if (cloudChannel) cloudClient?.removeChannel(cloudChannel);
        cloudChannel = null;
        cloudUser = null;
        lastCloudUpdatedAt = null;
        setSyncStatus('local');
      }
    }, 0);
  });
  window.setInterval(() => {
    if (cloudUser && document.visibilityState === 'visible') loadCloudLedger({ quiet: true });
  }, 20000);
  document.addEventListener('visibilitychange', () => {
    if (cloudUser && document.visibilityState === 'visible') loadCloudLedger({ quiet: true });
  });
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function updateCount(name, value) {
  document.querySelectorAll(`[data-count="${name}"]`).forEach((element) => { element.textContent = value; });
}

function allItems() {
  return [{ id: MERCH_ID, ...itemProfile, familyVariant }, ...extraItems]
    .filter((item) => !deletedItemIds.includes(item.id));
}

function itemStyleType(item) {
  return item.styleType || (item.familyVariant ? 'both' : 'single');
}

function itemHasSingle(item) {
  return itemStyleType(item) !== 'family';
}

function itemHasFamily(item) {
  return itemStyleType(item) !== 'single' && Boolean(item.familyVariant);
}

function getItemById(itemId = MERCH_ID) {
  return allItems().find((item) => item.id === itemId) || null;
}

function itemMembers(item) {
  if (!itemHasSingle(item)) return [];
  if (Array.isArray(item.members)) return item.members.filter((member) => TF4_MEMBERS.includes(member));
  return item.id === MERCH_ID ? TF4_MEMBERS : [];
}

function memberScopeLabel(members) {
  if (!members.length) return '未选择成员';
  if (members.length === TF4_MEMBERS.length) return '15 位成员均有对应款式';
  return `${members.length} 位成员有对应款式`;
}

function persistExtraItems() {
  persist(EXTRA_ITEMS_KEY, extraItems);
}

function persistDeletedItems() {
  persist(DELETED_ITEMS_KEY, deletedItemIds);
}

function renderItemProfile() {
  const items = allItems();
  const cards = document.querySelector('#itemCards');
  document.querySelector('#itemAllCount').textContent = items.length;
  document.querySelectorAll('[data-open-modal="newOrder"], [data-open-modal="newStock"]').forEach((button) => {
    button.disabled = items.length === 0;
  });
  if (!items.length) {
    cards.innerHTML = '<div class="empty-state page-empty"><span>▣</span><strong>还没有周边</strong><small>点击“添加新周边”录入第一件</small></div>';
    document.querySelector('.recent-list .item-row').hidden = true;
    return;
  }
  cards.innerHTML = items.map((item) => {
    const styleType = itemStyleType(item);
    const hasSingle = itemHasSingle(item);
    const hasFamily = itemHasFamily(item);
    const sold = orders.filter((order) => order.merchId === item.id).reduce((sum, order) => sum + order.quantity, 0);
    const stored = stock.filter((entry) => entry.merchId === item.id && entry.intent === '囤货').reduce((sum, entry) => sum + entry.quantity, 0);
    const self = stock.filter((entry) => entry.merchId === item.id && entry.intent === '自留').reduce((sum, entry) => sum + entry.quantity, 0);
    const recorded = sold + stored + self;
    const members = itemMembers(item);
    const quota = styleType === 'family'
      ? Math.max(1, Number(item.familyVariant?.limit || item.limit || 1))
      : Math.max(1, members.length * Number(item.limit || 1));
    const soldWidth = Math.min(100, sold / quota * 100);
    const stockWidth = Math.min(100 - soldWidth, stored / quota * 100);
    const selfWidth = Math.min(100 - soldWidth - stockWidth, self / quota * 100);
    const family = item.familyVariant;
    const visual = item.id === MERCH_ID
      ? `<img src="love-love-love-cover.png" alt="${escapeHtml(item.name)}商品详情" />`
      : `<span aria-hidden="true">${escapeHtml(item.name.slice(0, 1))}</span>`;
    const familyMarkup = hasFamily
      ? `<button class="variant-option family-recorded" type="button" data-family-item="${item.id}"><span>家族款 · 已录入</span><strong>¥${formatPrice(family.price)}<small>/套</small></strong><small>每 ID 限购 ${escapeHtml(family.limit)} 份</small></button>`
      : `<button class="variant-option add-variant" type="button" data-family-item="${item.id}"><span>＋ 添加</span><strong>家族款</strong><small>可单独填写价格和限购</small></button>`;
    const singleMarkup = hasSingle ? `<button class="variant-option active" type="button"><span>单人款 · 共 ${members.length} 款</span><strong>¥${formatPrice(item.price)}<small>/套</small></strong><small>${escapeHtml(memberScopeLabel(members))} · 每 ID 每款限购 ${escapeHtml(item.limit)} 份</small></button>` : '';
    const memberLine = hasSingle
      ? `<div class="member-line"><span class="member-mini">${members.length}</span><span>单人款 · 可选成员</span><span class="member-status" title="${escapeHtml(members.join('、'))}">${escapeHtml(members.slice(0, 4).join('、'))}${members.length > 4 ? ' 等' : ''}</span></div>`
      : '<div class="member-line"><span class="member-mini purple-mini">家</span><span>家族款 · 不区分成员</span><span class="member-status">下单时直接选择家族款</span></div>';
    const contents = hasSingle ? item.contents : family?.contents;
    return `<article class="full-item-card"><div class="large-item-visual ${item.id === MERCH_ID ? 'product-visual' : 'letter-thumb'}">${visual}</div><div class="full-item-body"><div class="full-item-top"><div><p class="eyebrow">TF 家族 · 已录入 ${hasFamily && hasSingle ? 2 : 1} 个款式</p><h2>${escapeHtml(item.name)}</h2></div><button class="more-button" type="button" data-edit-item="${item.id}" aria-label="编辑周边" title="编辑周边">⋯</button></div><div class="variant-switch">${singleMarkup}${familyMarkup}</div><div class="allocation-bar"><span class="alloc-sold" style="width:${soldWidth}%"></span><span class="alloc-stock" style="width:${stockWidth}%"></span><span class="alloc-self" style="width:${selfWidth}%"></span></div><div class="allocation-legend"><span><i class="legend-dot sold"></i>已出售 ${sold}</span><span><i class="legend-dot stock"></i>囤货 ${stored}</span><span><i class="legend-dot self"></i>自留 ${self}</span><strong>已记录 ${recorded} 份</strong></div>${memberLine}<div class="kit-contents"><span>${hasSingle ? '单人款' : '家族款'}套装内含</span><strong>${escapeHtml(contents || '待补充')}</strong></div></div></article>`;
  }).join('');

  const recent = items[0];
  const recentHasSingle = itemHasSingle(recent);
  const recentRow = document.querySelector('.recent-list .item-row');
  recentRow.hidden = false;
  recentRow.dataset.openItem = recent.id;
  document.querySelector('#recentItemName').textContent = recent.name;
  document.querySelector('#recentItemMeta').textContent = recentHasSingle ? `单人款共 ${itemMembers(recent).length} 款` : '家族款';
  const prices = [recentHasSingle ? Number(recent.price) : Number(recent.familyVariant?.price), recent.familyVariant ? Number(recent.familyVariant.price) : Number(recent.price)].filter(Number.isFinite);
  document.querySelector('#recentItemPrice').innerHTML = `¥${formatPrice(Math.min(...prices))}<span>${recent.familyVariant ? '起' : '/套'}</span>`;
}

function populateItemForm(profile = null) {
  const values = profile || { ...DEFAULT_ITEM_PROFILE, name: '', price: '', limit: '', contents: '', members: [] };
  Object.entries(values).forEach(([field, value]) => {
    const input = modalFields.querySelector(`[data-item-field="${field}"]`);
    if (input) input.value = value;
  });
  const family = values.familyVariant;
  if (family) {
    Object.entries(family).forEach(([field, value]) => {
      const input = modalFields.querySelector(`[data-family-field="${field}"]`);
      if (input) input.value = value;
    });
  }
  renderMemberPicker(Array.isArray(values.members) ? values.members : (profile ? itemMembers(profile) : []));
  syncItemStyleFields();
  if (profile) modalFields.insertAdjacentHTML('beforeend', '<button class="remove-variant-button" type="button" data-remove-item>删除这个周边</button>');
}

function renderMemberPicker(selectedMembers) {
  const picker = modalFields.querySelector('[data-member-picker]');
  if (!picker) return;
  const selected = new Set(selectedMembers);
  picker.innerHTML = TF4_MEMBERS.map((member) => `<button type="button" class="member-choice ${selected.has(member) ? 'selected' : ''}" aria-pressed="${selected.has(member) ? 'true' : 'false'}" data-member-choice="${escapeHtml(member)}">${escapeHtml(member)}</button>`).join('');
  updateMemberPickerCount();
}

function updateMemberPickerCount() {
  const count = modalFields.querySelectorAll('[data-member-choice].selected').length;
  const counter = modalFields.querySelector('[data-member-count]');
  if (counter) counter.textContent = count ? `已选 ${count} 人` : '未选择';
}

function syncItemStyleFields() {
  const selector = modalFields.querySelector('[data-item-field="styleType"]');
  const familyFields = modalFields.querySelector('[data-family-fields]');
  const memberBlock = modalFields.querySelector('[data-member-picker-block]');
  if (!selector || !familyFields) return;
  if (!ITEM_STYLE_TYPES.includes(selector.value)) {
    const selectedButton = modalFields.querySelector('[data-style-type].selected');
    selector.value = selectedButton?.dataset.styleType || 'single';
    selector.setAttribute('value', selector.value);
  }
  familyFields.classList.toggle('is-hidden', selector.value !== 'both');
  memberBlock?.classList.toggle('is-hidden', selector.value === 'family');
  modalFields.querySelectorAll('[data-style-type]').forEach((button) => {
    button.classList.toggle('selected', button.dataset.styleType === selector.value);
    button.setAttribute('aria-pressed', button.dataset.styleType === selector.value ? 'true' : 'false');
  });
  const isFamilyOnly = selector.value === 'family';
  const labels = [
    ['[data-price-label]', '单价'],
    ['[data-limit-label]', '每 ID 限购'],
    ['[data-contents-label]', '套装内容'],
  ];
  labels.forEach(([query, suffix]) => {
    const label = modalFields.querySelector(query);
    if (label) label.textContent = `${isFamilyOnly ? '家族款' : '单人款'}${suffix}`;
  });
}

function readItemProfile() {
  const readItemField = (field) => modalFields.querySelector(`[data-item-field="${field}"]`)?.value.trim() || '';
  const profile = Object.fromEntries(['name', 'styleType', 'price', 'limit', 'contents'].map((field) => [field, readItemField(field)]));
  const styleType = ITEM_STYLE_TYPES.includes(profile.styleType)
    ? profile.styleType
    : modalFields.querySelector('[data-style-type].selected')?.dataset.styleType || 'single';
  profile.styleType = styleType;
  const price = Number(profile.price);
  const limit = Number(profile.limit);
  if (!profile.name || !Number.isFinite(price) || price <= 0 || !Number.isInteger(limit) || limit <= 0) {
    showToast('请检查商品名称、价格和限购数量');
    return null;
  }
  const members = [...modalFields.querySelectorAll('[data-member-choice].selected')].map((button) => button.dataset.memberChoice);
  if (styleType !== 'family' && !members.length) {
    showToast('请勾选实际有单人款的成员');
    return null;
  }
  profile.members = members;
  profile.memberScope = styleType === 'family' ? 'TF 家族，不区分成员' : memberScopeLabel(members);
  let familyVariant = null;
  if (styleType === 'family') {
    familyVariant = { price: profile.price, limit: profile.limit, contents: profile.contents };
    profile.memberScope = 'TF 家族，不区分成员';
  }
  if (styleType === 'both') {
    const familyPrice = modalFields.querySelector('[data-family-field="price"]').value.trim();
    const familyLimit = modalFields.querySelector('[data-family-field="limit"]').value.trim();
    if (!Number.isFinite(Number(familyPrice)) || Number(familyPrice) <= 0 || !Number.isInteger(Number(familyLimit)) || Number(familyLimit) <= 0) {
      showToast('请填写正确的家族款价格和限购数量');
      return null;
    }
    familyVariant = {
      price: familyPrice,
      limit: familyLimit,
      contents: modalFields.querySelector('[data-family-field="contents"]').value.trim(),
    };
  }
  return { ...profile, styleType, price: profile.price, limit: profile.limit, familyVariant };
}

function saveNewItem() {
  const profile = readItemProfile();
  if (!profile) return false;
  extraItems.push({ id: `merch-${Date.now()}`, ...profile });
  persistExtraItems();
  renderItemProfile();
  return true;
}

function saveItemProfile() {
  const profile = readItemProfile();
  if (!profile) return false;
  if (pendingItemId === MERCH_ID) {
    itemProfile = profile;
    familyVariant = profile.familyVariant;
    persist(ITEM_PROFILE_KEY, itemProfile);
    if (familyVariant) persist(FAMILY_VARIANT_KEY, familyVariant);
    else window.localStorage.removeItem(FAMILY_VARIANT_KEY);
  } else {
    const item = extraItems.find((entry) => entry.id === pendingItemId);
    if (!item) return false;
    Object.assign(item, profile);
    persistExtraItems();
  }
  orders.forEach((order) => { if (order.merchId === pendingItemId) order.merchName = profile.name; });
  stock.forEach((entry) => { if (entry.merchId === pendingItemId) entry.merchName = profile.name; });
  persist(ORDERS_KEY, orders);
  persist(STOCK_KEY, stock);
  renderItemProfile();
  renderOrders();
  renderStock();
  return true;
}

function populateFamilyForm() {
  const item = getItemById(pendingItemId);
  if (!item) {
    showToast('周边已不存在，请重新打开');
    closeModal();
    return;
  }
  modalFields.querySelector('[data-family-field="owner"]').value = item.name;
  if (!item.familyVariant) return;
  Object.entries(item.familyVariant).forEach(([field, value]) => {
    const input = modalFields.querySelector(`[data-family-field="${field}"]`);
    if (input) input.value = value;
  });
  if (itemStyleType(item) !== 'family') {
    modalFields.insertAdjacentHTML('beforeend', '<button class="remove-variant-button" type="button" data-remove-family>删除家族款</button>');
  }
}

function saveFamilyVariant() {
  const priceInput = modalFields.querySelector('[data-family-field="price"]');
  const limitInput = modalFields.querySelector('[data-family-field="limit"]');
  const price = Number(priceInput.value);
  const limit = Number(limitInput.value);
  if (!Number.isFinite(price) || price <= 0) {
    priceInput.focus();
    showToast('请填写正确的家族款价格');
    return false;
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    limitInput.focus();
    showToast('请填写正确的限购数量');
    return false;
  }
  const item = getItemById(pendingItemId);
  if (!item) {
    showToast('周边已不存在，请重新打开');
    return false;
  }
  const nextFamilyVariant = {
    price: priceInput.value.trim(),
    limit: limitInput.value.trim(),
    contents: modalFields.querySelector('[data-family-field="contents"]').value.trim(),
  };
  if (item.id === MERCH_ID) {
    familyVariant = nextFamilyVariant;
    itemProfile.styleType = itemStyleType(itemProfile) === 'single' ? 'both' : itemStyleType(itemProfile);
    persist(FAMILY_VARIANT_KEY, familyVariant);
    persist(ITEM_PROFILE_KEY, itemProfile);
  } else {
    const extraItem = extraItems.find((entry) => entry.id === item.id);
    extraItem.familyVariant = nextFamilyVariant;
    extraItem.styleType = extraItem.styleType === 'family' ? 'family' : 'both';
    persistExtraItems();
  }
  renderItemProfile();
  renderStock();
  return true;
}

function noticeTextToFields(rawText) {
  const text = rawText.replace(/\r/g, '\n').replace(/[ \t]+/g, ' ').replace(/[|｜]/g, ' ').replace(/\n{2,}/g, '\n').trim();
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const titleMatch = text.match(/[《「]([^》」]{2,60})[》」]/);
  const nameLine = lines.find((line) => /(LOVE|周边|单人款|家族款)/i.test(line) && !/购买须知|官方售卖渠道|商品以内|收货地址/.test(line));
  const name = titleMatch?.[1]?.trim() || nameLine?.replace(/^本次.*?家族[：:]/, '').replace(/[，,].*$/, '').trim();
  const singlePriceMatch = text.match(/(?:单人款|售价|售卖价|价格)[^\d¥￥]{0,30}[¥￥]?\s*(\d+(?:\.\d+)?)/i);
  const anyPriceMatch = text.match(/[¥￥]\s*(\d+(?:\.\d+)?)|(?:售价|售卖价|价格)[^\d]{0,20}(\d+(?:\.\d+)?)/i);
  const familyPriceMatch = text.match(/家族款[^\d]{0,30}(?:售价|售卖价|价格)?[^\d¥￥]{0,12}[¥￥]?\s*(\d+(?:\.\d+)?)/i);
  const limitMatch = text.match(/(?:每个\s*ID|每\s*ID|限购)[^\d]{0,18}(\d+)\s*(?:份|套|个)?/i);
  const familyLimitMatch = text.match(/家族款[^\d]{0,40}(?:每个\s*ID|每\s*ID|限购)?[^\d]{0,12}(\d+)\s*(?:份|套|个)?/i);
  const contentLine = lines.find((line) => /(明信片|亚克力|撕拉|NFC|拍立得|小卡|徽章|钥匙扣)/i.test(line));
  const hasSingle = /单人款/.test(text);
  const hasFamily = /家族款/.test(text);
  const members = TF4_MEMBERS.filter((member) => text.includes(member));
  return {
    name,
    styleType: hasSingle && hasFamily ? 'both' : hasFamily ? 'family' : 'single',
    price: singlePriceMatch?.[1] || anyPriceMatch?.[1] || anyPriceMatch?.[2] || '',
    familyPrice: familyPriceMatch?.[1] || '',
    limit: limitMatch?.[1] || '',
    familyLimit: familyLimitMatch?.[1] || '',
    contents: contentLine || '',
    members,
  };
}

function applyNoticeFields(parsed) {
  const setItemField = (field, value) => {
    const input = modalFields.querySelector(`[data-item-field="${field}"]`);
    if (input && value) input.value = value;
  };
  setItemField('name', parsed.name);
  setItemField('styleType', parsed.styleType);
  setItemField('price', parsed.price);
  setItemField('limit', parsed.limit);
  setItemField('contents', parsed.contents);
  if (parsed.members?.length) renderMemberPicker(parsed.members);
  syncItemStyleFields();
  if (parsed.styleType === 'both') {
    const familyFields = {
      price: parsed.familyPrice,
      limit: parsed.familyLimit,
    };
    Object.entries(familyFields).forEach(([field, value]) => {
      const input = modalFields.querySelector(`[data-family-field="${field}"]`);
      if (input && value) input.value = value;
    });
  }
}

async function prepareNoticeImage(file) {
  const bitmap = await createImageBitmap(file);
  const maxDimension = 2200;
  const scale = Math.min(1.7, maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.filter = 'grayscale(1) contrast(1.65) brightness(1.08)';
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

async function recognizeNoticeFiles(files) {
  const fileName = document.querySelector('#dropzoneFileName');
  const imageFiles = [...files].filter((file) => file.type.startsWith('image/'));
  if (!imageFiles.length) {
    showToast('请选择通知截图');
    return;
  }
  fileName.classList.add('ocr-progress');
  fileName.textContent = `正在加载中文识别组件（首次可能需要半分钟）…`;
  let worker;
  let timedOut = false;
  let timeoutId;
  try {
    if (!window.Tesseract?.createWorker) throw new Error('OCR 服务未载入');
    const assetUrl = (path) => new URL(path, new URL('./', window.location.href)).href;
    const workerPromise = window.Tesseract.createWorker('chi_sim+eng', 1, {
      workerPath: assetUrl('worker.min.js'),
      corePath: assetUrl('tesseract-core-simd-lstm.wasm.js'),
      langPath: assetUrl('tessdata'),
      logger: (message) => {
        if (message.status === 'recognizing text') {
          const current = Math.min(imageFiles.length, Math.max(1, Math.ceil((message.progress || 0) * imageFiles.length)));
          fileName.textContent = `正在识别第 ${current} / ${imageFiles.length} 张截图…`;
        }
      },
    });
    workerPromise.then((lateWorker) => { if (timedOut) lateWorker.terminate(); }).catch(() => {});
    worker = await Promise.race([
      workerPromise,
      new Promise((_, reject) => { timeoutId = window.setTimeout(() => {
        timedOut = true;
        reject(new Error('OCR model load timed out'));
      }, 35000); }),
    ]);
    window.clearTimeout(timeoutId);
    if (worker.setParameters) {
      await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
    }
    const results = [];
    for (const file of imageFiles) {
      const result = await worker.recognize(await prepareNoticeImage(file));
      results.push(result.data.text || '');
    }
    const parsed = noticeTextToFields(results.join('\n'));
    const recognizedFields = [parsed.name, parsed.price, parsed.limit, parsed.familyPrice, parsed.familyLimit, parsed.contents].filter(Boolean).length + (parsed.members?.length || 0);
    applyNoticeFields(parsed);
    fileName.classList.remove('ocr-progress');
    if (recognizedFields) {
      fileName.textContent = `已选择 ${imageFiles.length} 张截图，识别到的内容已预填，可继续修改`;
      showToast(`已识别并预填 ${recognizedFields} 项内容`);
    } else {
      fileName.textContent = `已选择 ${imageFiles.length} 张截图，但没有识别出可填内容`;
      showToast('图片已上传，但文字太小或不清晰，请换一张更清楚的截图');
    }
  } catch (error) {
    console.error('Notice OCR failed', error);
    fileName.classList.remove('ocr-progress');
    fileName.textContent = `已选择 ${imageFiles.length} 张截图，识别未完成，可重选图片再试`;
    showToast(timedOut ? '中文识别组件加载超时，请检查网络后重试' : '识别暂时失败，请保持网络后重试');
  } finally {
    window.clearTimeout(timeoutId);
    if (worker) await worker.terminate();
  }
}

function getVariantOptions(merchId = MERCH_ID) {
  const item = getItemById(merchId);
  if (!item) return [];
  const options = [];
  if (itemHasSingle(item)) options.push({ value: 'single', label: `单人款 · ¥${formatPrice(item.price)}`, cost: Number(item.price) });
  if (itemHasFamily(item)) options.push({ value: 'family', label: `家族款 · ¥${formatPrice(item.familyVariant.price)}`, cost: Number(item.familyVariant.price) });
  return options;
}

function getMerchOptions() {
  return allItems().map((item) => ({ value: item.id, label: item.name }));
}

function memberOptionsMarkup(merchId = MERCH_ID) {
  const item = getItemById(merchId);
  if (!item) return '<option value="">请先添加周边</option>';
  const members = itemMembers(item).map((member) => `<option value="${escapeHtml(member)}">${escapeHtml(member)}</option>`).join('');
  const family = itemHasFamily(item) ? '<option value="family">家族款（TF 家族）</option>' : '';
  return `<option value="">请选择成员或家族款</option>${members}${family}`;
}

function populateStockMemberFilter() {
  const filter = document.querySelector('#stockMemberFilter');
  if (!filter) return;
  const members = TF4_MEMBERS.map((member) => `<option value="${escapeHtml(member)}">${escapeHtml(member)}</option>`).join('');
  filter.innerHTML = `<option value="all">按成员：全部</option>${members}<option value="family">家族款</option>`;
  filter.value = stockMemberFilter;
}

function merchOptionsMarkup() {
  return getMerchOptions().map((merch) => `<option value="${merch.value}">${escapeHtml(merch.label)}</option>`).join('');
}

function selectedVariant(member, merchId = MERCH_ID) {
  const value = member === 'family' ? 'family' : 'single';
  return getVariantOptions(merchId).find((option) => option.value === value) || getVariantOptions(merchId)[0] || { value: 'single', label: '', cost: 0 };
}

function populateOrderForm() {
  modalFields.querySelector('[data-order-field="merch"]').innerHTML = merchOptionsMarkup();
  syncOrderMerchFields();
}

function syncOrderMerchFields() {
  const merchId = readField('[data-order-field="merch"]');
  modalFields.querySelector('[data-order-field="member"]').innerHTML = memberOptionsMarkup(merchId);
  syncOrderVariantFields();
}

function syncOrderVariantFields() {
  const variant = selectedVariant(readField('[data-order-field="member"]'), readField('[data-order-field="merch"]'));
  modalFields.querySelector('[data-order-field="cost"]').value = formatPrice(variant.cost);
}

function populateStockForm() {
  modalFields.querySelector('[data-stock-field="merch"]').innerHTML = merchOptionsMarkup();
  syncStockMerchFields();
}

function syncStockMerchFields() {
  const merchId = readField('[data-stock-field="merch"]');
  modalFields.querySelector('[data-stock-field="member"]').innerHTML = memberOptionsMarkup(merchId);
  syncStockVariantFields();
}

function syncStockVariantFields() {
  const variant = selectedVariant(readField('[data-stock-field="member"]'), readField('[data-stock-field="merch"]'));
  modalFields.querySelector('[data-stock-field="cost"]').value = formatPrice(variant.cost);
}

function saveStock() {
  const merchId = readField('[data-stock-field="merch"]');
  const selectedMember = readField('[data-stock-field="member"]');
  const merch = getMerchOptions().find((option) => option.value === merchId);
  if (!merch) {
    showToast('请先添加周边');
    return false;
  }
  const variantInfo = selectedVariant(selectedMember, merchId);
  const variant = variantInfo.value;
  const quantity = Number(readField('[data-stock-field="quantity"]'));
  if (!merchId || !selectedMember || !Number.isInteger(quantity) || quantity <= 0) {
    showToast('请选择周边、成员或家族款，并填写正确数量');
    return false;
  }
  stock.unshift({ id: `stock-${Date.now()}`, merchId, merchName: merch.label, variant, variantLabel: variantInfo.label, member: variant === 'family' ? '' : selectedMember, quantity, intent: readField('[data-stock-field="intent"]'), status: readField('[data-stock-field="status"]'), unitCost: variantInfo.cost });
  persist(STOCK_KEY, stock);
  renderItemProfile();
  renderStock();
  return true;
}

function renderStock() {
  const list = document.querySelector('#stockList');
  const home = stock.filter((item) => item.status === '已到家').reduce((sum, item) => sum + item.quantity, 0);
  const pending = stock.filter((item) => item.status !== '已到家').reduce((sum, item) => sum + item.quantity, 0);
  const total = home + pending;
  const cost = stock.reduce((sum, item) => sum + item.unitCost * item.quantity, 0);
  updateCount('inventory', total);
  document.querySelector('#stockHomeCount').textContent = home;
  document.querySelector('#stockPendingCount').textContent = pending;
  document.querySelector('#stockAllCount').textContent = total;
  document.querySelector('#stockHomeTabCount').textContent = home;
  document.querySelector('#stockPendingTabCount').textContent = pending;
  document.querySelector('#stockCost').textContent = `¥${formatMoney(cost)}`;
  document.querySelectorAll('[data-sell-stock-button]').forEach((button) => { button.disabled = home === 0; });
  document.querySelector('#overviewStockCount').textContent = total;
  document.querySelector('#overviewStockCost').textContent = `库存成本 ¥${formatMoney(cost)}`;
  if (!stock.length) {
    list.innerHTML = '<div class="empty-state page-empty"><span>▤</span><strong>仓库还是空的</strong><small>点击“记录官方购买”添加自留或囤货</small></div>';
    return;
  }
  const visibleStock = stock.filter((item) => {
    const matchesStatus = stockFilter === 'all'
      || (stockFilter === 'home' && item.status === '已到家')
      || (stockFilter === 'pending' && item.status === '官方待发货');
    const matchesMember = stockMemberFilter === 'all'
      || (stockMemberFilter === 'family' ? item.variant === 'family' : item.member === stockMemberFilter);
    return matchesStatus && matchesMember;
  });
  if (!visibleStock.length) {
    list.innerHTML = '<div class="empty-state page-empty"><span>▤</span><strong>当前筛选下还没有库存</strong><small>更换成员或库存状态查看</small></div>';
    return;
  }
  list.innerHTML = visibleStock.map((item) => {
    const actions = item.status === '已到家'
      ? `<button class="stock-action refund-action" data-stock-remove="${item.id}">移除</button>`
      : `<button class="stock-action" data-stock-arrived="${item.id}">已到家</button><button class="stock-action refund-action" data-stock-remove="${item.id}">退款</button>`;
    return `<article class="stock-row" data-stock-id="${item.id}"><div class="stock-thumb product-thumb"><img src="love-love-love-cover.png" alt="${escapeHtml(item.merchName || itemProfile.name)}" /></div><div class="stock-main"><div class="stock-heading"><strong>${escapeHtml(item.merchName || itemProfile.name)} · ${escapeHtml(item.variantLabel)}</strong><span class="stock-state ${item.status === '已到家' ? 'in-home' : 'on-way'}">${escapeHtml(item.status)}</span></div><div class="stock-sub">${item.member ? `${escapeHtml(item.member)} · ` : ''}${escapeHtml(item.intent)}</div><div class="stock-foot"><span>${item.quantity} 套 <em>× ¥${formatPrice(item.unitCost)}</em></span><span class="stock-cost">成本 ¥${formatMoney(item.unitCost * item.quantity)}</span></div></div><div class="stock-row-actions">${actions}</div></article>`;
  }).join('');
}

function populateSaleForm() {
  const homeStock = stock.filter((item) => item.status === '已到家' && item.quantity > 0);
  const select = modalFields.querySelector('[data-sale-field="stockId"]');
  select.innerHTML = homeStock.map((item) => `<option value="${item.id}">${escapeHtml(item.variantLabel)}${item.member ? ` · ${escapeHtml(item.member)}` : ''} · 可售 ${item.quantity}</option>`).join('');
  modalFields.querySelector('[data-sale-field="platform"]').closest('.field-grid').insertAdjacentHTML('beforebegin', '<div class="field-grid"><label>方式<select data-sale-field="method"><option value="垫付">垫付</option><option value="提确">提确</option></select></label><span></span></div>');
  syncSaleCost();
}

function syncSaleCost() {
  const item = stock.find((entry) => entry.id === modalFields.querySelector('[data-sale-field="stockId"]').value);
  modalFields.querySelector('[data-sale-field="cost"]').value = item ? formatPrice(item.unitCost) : '';
}

function saveStockSale() {
  const item = stock.find((entry) => entry.id === readField('[data-sale-field="stockId"]'));
  const quantity = Number(readField('[data-sale-field="quantity"]'));
  const buyer = readField('[data-sale-field="buyer"]');
  const revenue = Number(readField('[data-sale-field="revenue"]'));
  const postage = Number(readField('[data-sale-field="postage"]') || 0);
  const address = readField('[data-sale-field="address"]');
  const method = readField('[data-sale-field="method"]');
  if (!item || !buyer || !address || !Number.isInteger(quantity) || quantity <= 0 || quantity > item.quantity || !Number.isFinite(revenue) || revenue < 0 || !Number.isFinite(postage) || postage < 0) {
    showToast('请检查买家、数量、金额和地址');
    return false;
  }
  orders.unshift({ id: `order-${Date.now()}`, source: 'stock', buyer, merchId: item.merchId || MERCH_ID, merchName: item.merchName || itemProfile.name, variant: item.variant, variantLabel: item.variantLabel, quantity, member: item.member, method, platform: readField('[data-sale-field="platform"]'), cost: item.unitCost * quantity, revenue, address, stage: method === '提确' ? '已收款' : '待处理', tracking: '', postage: String(postage), note: '从仓库卖出' });
  item.quantity -= quantity;
  stock = stock.filter((entry) => entry.quantity > 0);
  persist(ORDERS_KEY, orders);
  persist(STOCK_KEY, stock);
  renderItemProfile();
  renderOrders();
  renderDashboard();
  renderStock();
  return true;
}

function readField(selector) {
  return modalFields.querySelector(selector).value.trim();
}

function saveOrder() {
  const merchId = readField('[data-order-field="merch"]');
  const selectedMember = readField('[data-order-field="member"]');
  const merch = getMerchOptions().find((option) => option.value === merchId);
  if (!merch) {
    showToast('请先添加周边');
    return false;
  }
  const variantInfo = selectedVariant(selectedMember, merchId);
  const variant = variantInfo.value;
  const quantity = Number(readField('[data-order-field="quantity"]'));
  const buyer = readField('[data-order-field="buyer"]');
  const address = readField('[data-order-field="address"]');
  if (!buyer || !merchId || !selectedMember || !Number.isInteger(quantity) || quantity <= 0 || !address) {
    showToast('请填写买家、周边、成员或家族款、数量和收货地址');
    return false;
  }
  const revenue = Number(readField('[data-order-field="revenue"]'));
  if (!Number.isFinite(revenue) || revenue < 0) {
    showToast('请填写正确的代拍收款金额');
    return false;
  }
  orders.unshift({
    id: `order-${Date.now()}`,
    source: 'proxy',
    buyer,
    merchId,
    merchName: merch.label,
    variant,
    variantLabel: variantInfo.label,
    quantity,
    member: variant === 'family' ? '' : selectedMember,
    method: readField('[data-order-field="method"]'),
    platform: readField('[data-order-field="platform"]'),
    cost: variantInfo.cost * quantity,
    revenue,
    address,
    stage: readField('[data-order-field="method"]') === '提确' ? '已收款' : '待处理',
    tracking: '',
    postage: '0',
    note: '',
  });
  persist(ORDERS_KEY, orders);
  renderItemProfile();
  renderOrders();
  renderDashboard();
  return true;
}

function renderOrders() {
  const list = document.querySelector('#orderList');
  const pending = orders.filter((order) => order.stage !== '已完成').length;
  const completed = orders.length - pending;
  updateCount('orders', orders.length);
  document.querySelector('#ordersAllCount').textContent = orders.length;
  document.querySelector('#ordersPendingCount').textContent = pending;
  document.querySelector('#ordersDoneCount').textContent = completed;
  document.querySelector('#mobileOrderCount').textContent = orders.length;
  const visibleOrders = orders.filter((order) => (orderFilter === 'all' || (orderFilter === 'completed' ? order.stage === '已完成' : order.stage !== '已完成')) && (platformFilter === 'all' || order.platform === platformFilter));
  if (!orders.length) {
    list.innerHTML = '<div class="empty-state page-empty"><span>◫</span><strong>还没有订单</strong><small>有人找你代拍时，从上方直接创建订单</small></div>';
    return;
  }
  if (!visibleOrders.length) {
    list.innerHTML = '<div class="empty-state page-empty"><span>◫</span><strong>这个分类还没有订单</strong><small>切换其他分类查看</small></div>';
    return;
  }
  list.innerHTML = visibleOrders.map((order) => {
    const initials = escapeHtml(order.buyer.slice(0, 1));
    const statusClass = order.stage === '已完成' ? 'green-status' : order.method === '垫付' ? 'orange-status' : 'blue-status';
    const action = order.stage === '已完成' ? '查看详情' : order.method === '垫付' ? '填写发货' : '确认收款';
    const moneyLabel = order.stage === '已完成' ? '实际利润' : '代拍收款';
    const profit = order.revenue - order.cost - Number(order.postage || 0);
    const money = order.stage === '已完成' ? `${profit >= 0 ? '+' : ''}¥${formatPrice(profit)}` : `¥${formatPrice(order.revenue)}`;
    return `<article class="order-card ${order.stage === '已完成' ? 'done-order' : ''}" data-order-id="${order.id}"><div class="order-top"><div class="order-person"><span class="buyer-avatar">${initials}</span><div><strong>${escapeHtml(order.buyer)}</strong><small>${escapeHtml(order.platform)} · ${escapeHtml(order.method)}</small></div></div><span class="order-status ${statusClass}">${escapeHtml(order.stage)}</span></div><div class="order-detail"><div><span>周边</span><strong>${escapeHtml(order.merchName || itemProfile.name)}</strong></div><div><span>款式 / 数量</span><strong>${escapeHtml(order.variantLabel)}${order.member ? ` · ${escapeHtml(order.member)}` : ''} × ${order.quantity}</strong></div><div><span>方式</span><strong>${escapeHtml(order.method)}</strong></div><div class="order-money"><span>${moneyLabel}</span><strong class="${order.stage === '已完成' ? 'green-text' : ''}">${money}</strong></div></div><div class="order-actions"><button class="outline-button" data-open-order-id="${order.id}">查看详情</button>${order.stage !== '已完成' ? `<button class="action-button ${order.method === '提确' ? 'blue-action' : ''}" data-open-order-id="${order.id}">${action} <span>→</span></button>` : ''}</div></article>`;
  }).join('');
}

function renderDashboard() {
  const advance = orders.filter((order) => order.source !== 'stock' && order.method === '垫付' && !['已收款', '已完成'].includes(order.stage)).reduce((sum, order) => sum + order.cost, 0);
  const receivable = orders.filter((order) => order.method === '垫付' && !['已收款', '已完成'].includes(order.stage)).reduce((sum, order) => sum + order.revenue, 0);
  const profit = orders.filter((order) => order.stage === '已完成').reduce((sum, order) => sum + order.revenue - order.cost - Number(order.postage || 0), 0);
  document.querySelector('#advanceValue').textContent = `¥${formatMoney(advance)}`;
  document.querySelector('#receivableValue').textContent = `¥${formatMoney(receivable)}`;
  document.querySelector('#profitValue').textContent = `¥${formatMoney(profit)}`;
  document.querySelector('#advanceFoot').textContent = advance ? '等待买家回款' : '暂无垫付订单';
  document.querySelector('#receivableFoot').textContent = receivable ? '订单待完成' : '暂无待到账款项';
  document.querySelector('#profitFoot').textContent = profit ? '已完成订单累计' : '暂无已完成订单';
  const recordedQuantity = orders.reduce((sum, order) => sum + order.quantity, 0);
  document.querySelector('#quotaRecorded').textContent = `${recordedQuantity} 份`;
  document.querySelector('.meter-fill').style.width = `${Math.min(100, recordedQuantity / 15 * 100)}%`;
  const pendingOrders = orders.filter((order) => order.stage !== '已完成');
  document.querySelector('#attentionCount').textContent = pendingOrders.length;
  document.querySelector('#attentionList').innerHTML = pendingOrders.length ? `<div class="attention-list">${pendingOrders.slice(0, 3).map((order) => `<button class="attention-row" data-attention-order="${order.id}"><span class="attention-icon ${order.method === '垫付' ? 'orange' : 'blue'}">${order.method === '垫付' ? '↗' : '¥'}</span><span class="attention-copy"><strong>${order.stage === '待处理' ? '处理代拍订单' : escapeHtml(order.stage)}</strong><small>${escapeHtml(order.merchName || itemProfile.name)} · ${escapeHtml(order.buyer)}</small></span><span class="row-arrow">→</span></button>`).join('')}</div>` : '<div class="empty-state compact-empty"><span>✓</span><strong>现在没有待办</strong><small>订单发生变化后会出现在这里</small></div>';
}

function saveOrderDetail() {
  const order = orders.find((item) => item.id === pendingOrderId);
  if (!order) return false;
  const postage = Number(readField('[data-order-detail-field="postage"]') || 0);
  if (!Number.isFinite(postage) || postage < 0) {
    showToast('请填写正确的实际邮费');
    return false;
  }
  order.stage = readField('[data-order-detail-field="stage"]');
  order.tracking = readField('[data-order-detail-field="tracking"]');
  order.postage = String(postage);
  const revenue = Number(readField('[data-order-detail-field="revenue"]'));
  if (!Number.isFinite(revenue) || revenue < 0) {
    showToast('请填写正确的代拍收款金额');
    return false;
  }
  order.revenue = revenue;
  order.address = readField('[data-order-detail-field="address"]');
  order.note = readField('[data-order-detail-field="note"]');
  persist(ORDERS_KEY, orders);
  renderOrders();
  renderDashboard();
  return true;
}

function populateOrderDetail(order) {
  modalFields.querySelector('[data-order-detail-field="stage"]').value = order.stage;
  modalFields.querySelector('[data-order-detail-field="tracking"]').value = order.tracking;
  modalFields.querySelector('[data-order-detail-field="postage"]').value = order.postage;
  modalFields.querySelector('[data-order-detail-field="revenue"]').value = order.revenue;
  modalFields.querySelector('[data-order-detail-field="address"]').value = order.address;
  modalFields.querySelector('[data-order-detail-field="note"]').value = order.note;
  modalFields.insertAdjacentHTML('beforeend', '<button class="remove-variant-button" type="button" data-remove-order>删除这笔订单</button>');
}

function openModal(mode = 'newItem') {
  const config = modalModes[mode] || modalModes.newItem;
  currentModalMode = mode;
  modalKicker.textContent = config.kicker;
  modalTitle.textContent = mode === 'addFamily' && getItemById(pendingItemId)?.familyVariant ? '编辑家族款' : config.title;
  modalCopy.textContent = config.copy;
  modalDropzone.style.display = config.drop ? 'grid' : 'none';
  modalFields.innerHTML = modalFieldTemplates[mode] || '';
  if (mode === 'newItem') populateItemForm();
  if (mode === 'itemDetail') populateItemForm(getItemById(pendingItemId));
  if (mode === 'newOrder') populateOrderForm();
  if (mode === 'newStock') populateStockForm();
  if (mode === 'sellStock') populateSaleForm();
  if (mode === 'addFamily') populateFamilyForm();
  if (mode === 'syncAccount') populateSyncAccountForm();
  modalFields.style.display = modalFieldTemplates[mode] ? 'grid' : 'none';
  if (mode !== 'syncAccount' || !cloudUser) modalConfirm.innerHTML = `${config.confirm} <span>→</span>`;
  backdrop.classList.add('open');
  backdrop.setAttribute('aria-hidden', 'false');
}

function populateSyncAccountForm() {
  const emailInput = modalFields.querySelector('[data-sync-field="email"]');
  const message = modalFields.querySelector('[data-sync-message]');
  const signout = modalFields.querySelector('[data-cloud-signout]');
  if (cloudUser) {
    modalTitle.textContent = '云端同步已开启';
    modalCopy.textContent = '周边、仓库和订单会自动上传；另一台设备使用同一邮箱登录即可同步。';
    emailInput.value = cloudUser.email || '';
    emailInput.readOnly = true;
    message.textContent = '当前账号已连接。页面打开、切回前台和每次修改后都会自动同步；也可以点击下方立即同步。';
    modalFields.querySelector('[data-sync-field="magicLink"]').closest('.sync-link-block').hidden = true;
    signout.hidden = false;
    modalConfirm.innerHTML = '立即同步 <span>→</span>';
  }
}

async function sendSyncLink(email) {
  modalConfirm.disabled = true;
  modalConfirm.textContent = '正在发送…';
  const { error } = await cloudClient.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: APP_URL },
  });
  modalConfirm.disabled = false;
  if (error) {
    modalConfirm.innerHTML = '发送登录邮件 <span>→</span>';
    showToast(`发送失败：${error.message}`);
    return false;
  }
  modalFields.querySelector('[data-sync-message]').innerHTML = '邮件已发送。<strong>请长按邮件正文里的蓝色 Sign in 按钮</strong>，选择“复制链接地址”，不要复制 QQ 邮箱顶部的页面地址。';
  modalConfirm.innerHTML = '重新发送登录邮件 <span>→</span>';
  showToast('登录邮件已发送，请复制邮件里的链接');
  return true;
}

async function loginWithCopiedLink(rawLink) {
  const normalized = String(rawLink || '').trim().replace(/&amp;/gi, '&');
  const candidates = normalized.match(/https?:\/\/[^\s<>"']+/gi) || [];
  const links = [];
  const seenLinks = new Set();
  const addCandidate = (candidate) => {
    const cleaned = candidate.replace(/[),.;!?]+$/, '');
    if (seenLinks.has(cleaned)) return;
    seenLinks.add(cleaned);
    let parsed;
    try { parsed = new URL(cleaned); } catch { return; }
    links.push(parsed);
    parsed.searchParams.forEach((value) => {
      if (/^https?:\/\//i.test(value)) addCandidate(value);
    });
  };
  candidates.forEach(addCandidate);
  const projectHost = new URL(SUPABASE_URL).hostname;
  const appHost = new URL(APP_URL).hostname;
  const link = links.find((candidate) => candidate.hostname === projectHost || candidate.hostname === appHost);
  if (!link) {
    const isMailPage = links.some((candidate) => /(^|\.)mail\.qq\.com$/i.test(candidate.hostname));
    showToast(isMailPage
      ? '这是 QQ 邮箱页面地址，请长按邮件正文里的 Sign in 按钮复制链接地址'
      : '没有找到蓝账本登录地址，请复制 Sign in 按钮的完整链接');
    return false;
  }
  const button = modalFields.querySelector('[data-sync-link-login]');
  button.disabled = true;
  button.textContent = '正在登录…';
  let data;
  let error;
  if (link.hostname === appHost && link.hash.includes('access_token=')) {
    const sessionParams = new URLSearchParams(link.hash.slice(1));
    const accessToken = sessionParams.get('access_token');
    const refreshToken = sessionParams.get('refresh_token');
    if (!accessToken || !refreshToken) {
      button.disabled = false;
      button.textContent = '使用粘贴的链接登录';
      showToast('登录地址不完整，请重新复制');
      return false;
    }
    ({ data, error } = await cloudClient.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    }));
  } else if (link.hostname === projectHost && link.pathname.replace(/\/$/, '') === '/auth/v1/verify') {
    const tokenHash = link.searchParams.get('token_hash') || link.searchParams.get('token');
    const type = link.searchParams.get('type') || 'magiclink';
    if (!tokenHash || !['magiclink', 'email'].includes(type)) {
      button.disabled = false;
      button.textContent = '使用粘贴的链接登录';
      showToast('登录链接不完整，请重新发送邮件');
      return false;
    }
    ({ data, error } = await cloudClient.auth.verifyOtp({
      token_hash: tokenHash,
      type: type === 'magiclink' ? 'email' : type,
    }));
  } else {
    button.disabled = false;
    button.textContent = '使用粘贴的链接登录';
    showToast('请粘贴邮件里的 Sign in 链接，或登录成功后的蓝账本地址');
    return false;
  }
  button.disabled = false;
  button.textContent = '使用粘贴的链接登录';
  if (error || !data?.session?.user) {
    showToast('链接已使用或已过期，请重新发送');
    return false;
  }
  await connectCloudUser(data.session.user);
  closeModal();
  showToast('主屏幕版已登录并开始同步');
  return true;
}

function closeModal() {
  backdrop.classList.remove('open');
  backdrop.setAttribute('aria-hidden', 'true');
  pendingRefundRow = null;
  pendingOrderId = null;
  pendingItemId = null;
  currentModalMode = null;
}

function showToast(message) {
  toastText.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 2600);
}

document.querySelectorAll('[data-page]').forEach((button) => button.addEventListener('click', () => switchPage(button.dataset.page)));
document.querySelectorAll('[data-page-jump]').forEach((button) => button.addEventListener('click', () => switchPage(button.dataset.pageJump)));
document.querySelectorAll('[data-open-modal]').forEach((button) => button.addEventListener('click', (event) => {
  event.stopPropagation();
  openModal(button.dataset.openModal);
}));
document.querySelectorAll('[data-refund-stock]').forEach((button) => button.addEventListener('click', () => {
  pendingRefundRow = document.querySelector(`[data-stock-row="${button.dataset.refundStock}"]`);
  openModal('refundStock');
}));
document.querySelectorAll('[data-open-item]').forEach((button) => button.addEventListener('click', () => {
  pendingItemId = button.dataset.openItem || MERCH_ID;
  openModal('itemDetail');
}));

document.querySelector('#itemCards').addEventListener('click', (event) => {
  const editButton = event.target.closest('[data-edit-item]');
  const familyButton = event.target.closest('[data-family-item]');
  if (editButton) {
    event.preventDefault();
    event.stopPropagation();
    pendingItemId = editButton.dataset.editItem;
    openModal('itemDetail');
    return;
  }
  if (familyButton) {
    event.preventDefault();
    event.stopPropagation();
    pendingItemId = familyButton.dataset.familyItem;
    openModal('addFamily');
    return;
  }
});

document.querySelector('#orderList').addEventListener('click', (event) => {
  const button = event.target.closest('[data-open-order-id]');
  if (!button) return;
  const order = orders.find((item) => item.id === button.dataset.openOrderId);
  if (!order) return;
  pendingOrderId = order.id;
  openModal('orderDetail');
  modalTitle.textContent = `${order.buyer}的订单`;
  populateOrderDetail(order);
});

document.querySelector('#attentionList').addEventListener('click', (event) => {
  const button = event.target.closest('[data-attention-order]');
  if (!button) return;
  const order = orders.find((item) => item.id === button.dataset.attentionOrder);
  if (!order) return;
  pendingOrderId = order.id;
  openModal('orderDetail');
  modalTitle.textContent = `${order.buyer}的订单`;
  populateOrderDetail(order);
});

document.querySelector('#searchToggle').addEventListener('click', () => {
  const wrap = document.querySelector('#searchWrap');
  wrap.classList.toggle('open');
  if (wrap.classList.contains('open')) document.querySelector('#searchInput').focus();
});
document.querySelector('#searchInput').addEventListener('input', (event) => {
  const query = event.target.value.trim().toLowerCase();
  document.querySelectorAll('.item-row, .full-item-card, .stock-row, .order-card').forEach((row) => {
    row.style.display = !query || row.textContent.toLowerCase().includes(query) ? '' : 'none';
  });
});
modalFields.addEventListener('change', (event) => {
  if (event.target.matches('[data-item-field="styleType"]')) syncItemStyleFields();
  if (event.target.matches('[data-order-field="merch"]')) syncOrderMerchFields();
  if (event.target.matches('[data-order-field="member"]')) syncOrderVariantFields();
  if (event.target.matches('[data-stock-field="merch"]')) syncStockMerchFields();
  if (event.target.matches('[data-stock-field="member"]')) syncStockVariantFields();
  if (event.target.matches('[data-sale-field="stockId"]')) syncSaleCost();
});

document.querySelector('#stockList').addEventListener('click', (event) => {
  const arrived = event.target.closest('[data-stock-arrived]');
  const remove = event.target.closest('[data-stock-remove]');
  if (arrived) {
    const item = stock.find((entry) => entry.id === arrived.dataset.stockArrived);
    if (item) item.status = '已到家';
    persist(STOCK_KEY, stock);
    renderItemProfile();
    renderStock();
    showToast('已标记到家');
  }
  if (remove) {
    stock = stock.filter((entry) => entry.id !== remove.dataset.stockRemove);
    persist(STOCK_KEY, stock);
    renderItemProfile();
    renderStock();
    showToast('库存记录已移除');
  }
});
document.querySelector('#modalClose').addEventListener('click', closeModal);
document.querySelector('#modalCancel').addEventListener('click', closeModal);
modalFields.addEventListener('click', (event) => {
  const styleTypeButton = event.target.closest('[data-style-type]');
  if (styleTypeButton) {
    const styleTypeInput = modalFields.querySelector('[data-item-field="styleType"]');
    if (styleTypeInput) {
      styleTypeInput.value = styleTypeButton.dataset.styleType;
      styleTypeInput.setAttribute('value', styleTypeButton.dataset.styleType);
    }
    syncItemStyleFields();
    return;
  }
  if (event.target.closest('[data-members-select-all]')) {
    modalFields.querySelectorAll('[data-member-choice]').forEach((button) => {
      button.classList.add('selected');
      button.setAttribute('aria-pressed', 'true');
    });
    updateMemberPickerCount();
    return;
  }
  if (event.target.closest('[data-members-clear]')) {
    modalFields.querySelectorAll('[data-member-choice]').forEach((button) => {
      button.classList.remove('selected');
      button.setAttribute('aria-pressed', 'false');
    });
    updateMemberPickerCount();
    return;
  }
  const memberChoice = event.target.closest('[data-member-choice]');
  if (memberChoice) {
    memberChoice.classList.toggle('selected');
    memberChoice.setAttribute('aria-pressed', memberChoice.classList.contains('selected') ? 'true' : 'false');
    updateMemberPickerCount();
    return;
  }
  if (event.target.closest('[data-cloud-signout]')) {
    if (cloudClient) cloudClient.auth.signOut();
    cloudUser = null;
    lastCloudUpdatedAt = null;
    setSyncStatus('local');
    closeModal();
    showToast('已退出云端账号，本机记录仍会保留');
    return;
  }
  if (event.target.closest('[data-sync-link-login]')) {
    const link = modalFields.querySelector('[data-sync-field="magicLink"]')?.value || '';
    loginWithCopiedLink(link);
    return;
  }
  const removeItemButton = event.target.closest('[data-remove-item]');
  if (removeItemButton) {
    event.preventDefault();
    event.stopPropagation();
    const confirmed = window.confirm('确定删除这个周边吗？已有订单和库存会保留，只删除周边资料。');
    if (!confirmed) {
      return;
    }
    const itemId = pendingItemId;
    if (itemId === MERCH_ID) {
      deletedItemIds = [...new Set([...deletedItemIds, MERCH_ID])];
      persistDeletedItems();
    } else {
      extraItems = extraItems.filter((item) => item.id !== itemId);
      persistExtraItems();
    }
    renderItemProfile();
    closeModal();
    showToast('周边已删除，已有订单和库存仍保留');
    return;
  }
  if (event.target.closest('[data-remove-family]')) {
    if (pendingItemId === MERCH_ID) {
      familyVariant = null;
      itemProfile.styleType = 'single';
      window.localStorage.removeItem(FAMILY_VARIANT_KEY);
      persist(ITEM_PROFILE_KEY, itemProfile);
    } else {
      const item = extraItems.find((entry) => entry.id === pendingItemId);
      if (item) {
        item.familyVariant = null;
        item.styleType = 'single';
      }
      persistExtraItems();
    }
    renderItemProfile();
    closeModal();
    showToast('家族款已删除');
    return;
  }
  if (event.target.closest('[data-remove-order]')) {
    orders = orders.filter((order) => order.id !== pendingOrderId);
    persist(ORDERS_KEY, orders);
    renderItemProfile();
    renderOrders();
    renderDashboard();
    closeModal();
    showToast('订单已删除');
  }
});
backdrop.addEventListener('click', (event) => { if (event.target === backdrop) closeModal(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });
modalConfirm.addEventListener('click', async () => {
  if (pendingRefundRow) {
    pendingRefundRow.remove();
    pendingRefundRow = null;
    closeModal();
    showToast('已退款，库存和垫付金额已移除');
    return;
  }
  if (currentModalMode === 'addFamily') {
    if (!saveFamilyVariant()) return;
    closeModal();
    showToast('家族款已保存并更新到周边');
    return;
  }
  if (currentModalMode === 'newItem') {
    if (!saveNewItem()) return;
    closeModal();
    showToast('新周边已添加');
    return;
  }
  if (currentModalMode === 'itemDetail') {
    if (!saveItemProfile()) return;
    closeModal();
    showToast('周边资料已更新');
    return;
  }
  if (currentModalMode === 'newOrder') {
    if (!saveOrder()) return;
    closeModal();
    showToast('代拍订单已创建');
    return;
  }
  if (currentModalMode === 'newStock') {
    if (!saveStock()) return;
    closeModal();
    showToast('官方购买已加入仓库');
    return;
  }
  if (currentModalMode === 'sellStock') {
    if (!saveStockSale()) return;
    closeModal();
    showToast('现货已扣减并创建订单');
    return;
  }
  if (currentModalMode === 'orderDetail') {
    if (!saveOrderDetail()) return;
    closeModal();
    showToast('订单处理记录已保存');
    return;
  }
  if (currentModalMode === 'syncAccount') {
    if (!cloudClient) {
      showToast('同步服务未载入，请联网后刷新页面');
      return;
    }
    if (cloudUser) {
      const synced = await syncToCloud();
      if (synced) {
        closeModal();
        showToast('云端同步已完成');
      }
      return;
    }
    const emailInput = modalFields.querySelector('[data-sync-field="email"]');
    const email = emailInput.value.trim();
    if (!email || !email.includes('@')) {
      emailInput.focus();
      showToast('请填写正确的邮箱');
      return;
    }
    await sendSyncLink(email);
    return;
  }
  closeModal();
  showToast('已保存，相关库存和账目会自动更新');
});
document.querySelector('.drop-action').addEventListener('click', () => document.querySelector('#noticeFile').click());
document.querySelector('#noticeFile').addEventListener('change', (event) => {
  if (event.target.files.length) recognizeNoticeFiles(event.target.files);
  event.target.value = '';
});

document.querySelectorAll('.segment').forEach((button) => button.addEventListener('click', () => {
  button.parentElement.querySelectorAll('.segment').forEach((item) => item.classList.remove('active'));
  button.classList.add('active');
}));
document.querySelectorAll('[data-order-filter]').forEach((button) => button.addEventListener('click', () => {
  orderFilter = button.dataset.orderFilter;
  renderOrders();
}));

document.querySelectorAll('[data-stock-filter]').forEach((button) => button.addEventListener('click', () => {
  stockFilter = button.dataset.stockFilter;
  button.parentElement.querySelectorAll('.segment').forEach((item) => item.classList.remove('active'));
  button.classList.add('active');
  renderStock();
}));

document.querySelector('#stockMemberFilter')?.addEventListener('change', (event) => {
  stockMemberFilter = event.target.value;
  renderStock();
});

document.querySelector('#syncPill')?.addEventListener('click', () => openModal('syncAccount'));
document.querySelector('.settings-button')?.addEventListener('click', () => showToast('设置功能将在正式版本接入'));
document.querySelector('.avatar-button')?.addEventListener('click', () => openModal('syncAccount'));
document.querySelector('#orderPlatformFilter')?.addEventListener('click', () => {
  platformFilter = platformFilter === 'all' ? '闲鱼' : platformFilter === '闲鱼' ? '微信' : 'all';
  document.querySelector('#orderPlatformFilter').innerHTML = `平台：${platformFilter === 'all' ? '全部' : platformFilter} <span>⌄</span>`;
  renderOrders();
  showToast(`已切换到${platformFilter === 'all' ? '全部平台' : platformFilter}`);
});
document.querySelectorAll('.filter-button').forEach((button) => {
  if (button.id !== 'orderPlatformFilter') button.addEventListener('click', () => showToast('成员筛选将在正式版本接入'));
});
renderItemProfile();
populateStockMemberFilter();
renderOrders();
renderDashboard();
renderStock();
initCloudSync();
