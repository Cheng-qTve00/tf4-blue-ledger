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
let currentModalMode = null;
let orderFilter = 'all';
let stockFilter = 'all';
let stockMemberFilter = 'all';
let platformFilter = 'all';

const FAMILY_VARIANT_KEY = 'blue-ledger.family-variant';
const ITEM_PROFILE_KEY = 'blue-ledger.item-profile';
const ORDERS_KEY = 'blue-ledger.orders';
const STOCK_KEY = 'blue-ledger.stock';
const MERCH_ID = 'love-love-love';
const TF4_MEMBERS = ['官俊臣', '张桂源', '张函瑞', '王橹杰', '王烁然', '左奇函', '陈奕恒', '杨博文', '杨涵博', '张奕然', '聂玮辰', '陈思罕', '魏子宸', '李煜东', '陈浚铭'];
const DEFAULT_ITEM_PROFILE = {
  name: '奔跑 · LOVE LOVE LOVE',
  price: '79',
  limit: '1',
  status: '官方现货',
  memberScope: '15 位成员均有对应款式',
  contents: '明信片×15、亚克力别针×1、撕拉片×2、NFC卡套×1、拍立得×1、小卡×2',
};
let familyVariant = loadFamilyVariant();
let itemProfile = loadStoredValue(ITEM_PROFILE_KEY, DEFAULT_ITEM_PROFILE);
let orders = loadStoredValue(ORDERS_KEY, []);
let stock = loadStoredValue(STOCK_KEY, []).map((item) => (
  item.status === '运输中' ? { ...item, status: '官方待发货' } : item
));

const modalModes = {
  newItem: { kicker: 'MERCH PROFILE', title: '编辑商品资料', copy: '当前原型只接入这一批真实周边，修改后会同步更新商品卡和订单选项。', drop: true, confirm: '保存商品资料' },
  addFamily: { kicker: 'ADD VARIANT', title: '添加家族款', copy: '家族款与单人款分别计价、计算库存和盈亏，不需要选择成员。', drop: false, confirm: '保存家族款' },
  newOrder: { kicker: 'ORDER', title: '新增代拍订单', copy: '选择买家、周边和成员；选择家族款时会自动带出家族款价格。', drop: false, confirm: '创建订单' },
  newStock: { kicker: 'OFFICIAL PURCHASE', title: '记录官方购买', copy: '选择周边和成员后记录囤货或自留；这一步不会创建买家订单。', drop: false, confirm: '加入仓库' },
  sellStock: { kicker: 'FROM STORAGE', title: '从仓库卖出', copy: '选择一件现货，系统会自动带出成本和库存数量。', drop: false, confirm: '创建订单' },
  refundStock: { kicker: 'CANCEL OFFICIAL ORDER', title: '退款并移除库存', copy: '只适用于官方尚未发货的商品。退款后，库存数量和垫付金额会同步扣除。', drop: false, confirm: '确认退款' },
  itemDetail: { kicker: 'MERCH DETAIL', title: '周边详情', copy: '额度分配、订单去向和仓库数量都集中在这里。', drop: false, confirm: '保存修改' },
  orderDetail: { kicker: 'ORDER DETAIL', title: '订单详情', copy: '发货、物流和收款可以在同一个页面完成。', drop: false, confirm: '保存处理' },
};

const modalFieldTemplates = {
  newItem: '<label>周边名称<input data-item-field="name" /></label><div class="field-grid"><label>款式类型<input value="单人款 · 共15款" readonly /></label><label>官方单价<input data-item-field="price" inputmode="decimal" /></label></div><div class="field-grid"><label>每 ID 每款限购<input data-item-field="limit" inputmode="numeric" /></label><label>发货状态<input data-item-field="status" /></label></div><label>成员范围<input data-item-field="memberScope" /></label><label>套装内容<input data-item-field="contents" /></label>',
  addFamily: '<label>所属周边<input value="奔跑 · LOVE LOVE LOVE" readonly /></label><div class="field-grid"><label>款式类型<input value="家族款" readonly /></label><label>官方单价<input data-family-field="price" placeholder="按官方通知填写" inputmode="decimal" /></label></div><div class="field-grid"><label>每 ID 限购<input data-family-field="limit" placeholder="按官方通知填写" inputmode="numeric" /></label><label>发货状态<input data-family-field="status" placeholder="例如：现货" /></label></div><label>套装内容<input data-family-field="contents" placeholder="填写家族款实际包含的周边" /></label>',
  newOrder: '<label>买家昵称<input data-order-field="buyer" placeholder="填写闲鱼或微信昵称" /></label><div class="field-grid"><label>选择周边<select data-order-field="merch"></select></label><label>选择成员 / 家族款<select data-order-field="member"></select></label></div><div class="field-grid"><label>购买数量<input data-order-field="quantity" value="1" inputmode="numeric" /></label><label>官方单价<input data-order-field="cost" inputmode="decimal" readonly /></label></div><div class="field-grid"><label>方式<select data-order-field="method"><option value="垫付">垫付</option><option value="提确">提确</option></select></label><label>交易平台<select data-order-field="platform"><option value="闲鱼">闲鱼</option><option value="微信">微信</option></select></label></div><label>代拍收款<input data-order-field="revenue" placeholder="例如：99" inputmode="decimal" /></label><label>收货地址<input data-order-field="address" placeholder="闲鱼拍下后粘贴地址" /></label>',
  newStock: '<div class="field-grid"><label>选择周边<select data-stock-field="merch"></select></label><label>选择成员 / 家族款<select data-stock-field="member"></select></label></div><div class="field-grid"><label>购买数量<input data-stock-field="quantity" value="1" inputmode="numeric" /></label><label>去向<select data-stock-field="intent"><option value="囤货">囤货</option><option value="自留">自留</option></select></label></div><div class="field-grid"><label>当前状态<select data-stock-field="status"><option value="官方待发货">官方待发货</option><option value="已到家">已到家</option></select></label><label>官方单价<input data-stock-field="cost" readonly /></label></div>',
  sellStock: '<label>选择现货<select data-sale-field="stockId"></select></label><div class="field-grid"><label>买家昵称<input data-sale-field="buyer" /></label><label>卖出数量<input data-sale-field="quantity" value="1" inputmode="numeric" /></label></div><div class="field-grid"><label>成交金额<input data-sale-field="revenue" inputmode="decimal" /></label><label>实际邮费<input data-sale-field="postage" value="0" inputmode="decimal" /></label></div><div class="field-grid"><label>交易平台<select data-sale-field="platform"><option value="闲鱼">闲鱼</option><option value="微信">微信</option></select></label><label>库存成本<input data-sale-field="cost" readonly /></label></div><label>买家地址<input data-sale-field="address" placeholder="从闲鱼订单粘贴" /></label>',
  refundStock: '<label>退款商品<input value="奔跑 · LOVE LOVE LOVE 单人款" /></label><div class="field-grid"><label>退款数量<input value="1" inputmode="numeric" /></label><label>退款金额<input value="79.00" inputmode="decimal" /></label></div><label>退款原因<input value="资金安排调整" /></label>',
  itemDetail: '<label>周边名称<input data-item-field="name" /></label><div class="field-grid"><label>当前款式<input value="单人款 · 共15款" readonly /></label><label>官方单价<input data-item-field="price" inputmode="decimal" /></label></div><div class="field-grid"><label>每 ID 每款限购<input data-item-field="limit" inputmode="numeric" /></label><label>成员范围<input data-item-field="memberScope" /></label></div><label>发货状态<input data-item-field="status" /></label><label>单人款套装内容<input data-item-field="contents" /></label>',
  orderDetail: '<label>当前处理<select data-order-detail-field="stage"><option value="待处理">待处理</option><option value="已发货">已发货</option><option value="已收款">已收款</option><option value="已完成">已完成</option></select></label><div class="field-grid"><label>物流单号<input data-order-detail-field="tracking" placeholder="闲鱼订单发货后填写" /></label><label>实际邮费<input data-order-detail-field="postage" placeholder="0.00" inputmode="decimal" /></label></div><div class="field-grid"><label>代拍收款<input data-order-detail-field="revenue" inputmode="decimal" /></label><label>收货地址<input data-order-detail-field="address" /></label></div><label>备注 <input data-order-detail-field="note" placeholder="选填" /></label>',
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
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function updateCount(name, value) {
  document.querySelectorAll(`[data-count="${name}"]`).forEach((element) => { element.textContent = value; });
}

function renderItemProfile() {
  document.querySelector('#itemName').textContent = itemProfile.name;
  document.querySelector('#recentItemName').textContent = itemProfile.name;
  document.querySelector('#itemStatus').textContent = itemProfile.status;
  document.querySelector('#singleVariantPrice').innerHTML = `¥${formatPrice(itemProfile.price)}<small>/套</small>`;
  document.querySelector('#recentItemPrice').innerHTML = `¥${formatPrice(itemProfile.price)}<span>/套</span>`;
  document.querySelector('#singleVariantMeta').textContent = `${itemProfile.memberScope.replace('位成员均有对应款式', '名成员')} · 每 ID 每款限购 ${itemProfile.limit} 份`;
  document.querySelector('#singleKitContents').textContent = itemProfile.contents;
  document.querySelector('#recentItemMeta').textContent = `单人款共 15 款 · ${itemProfile.status}`;
}

function populateItemForm() {
  Object.entries(itemProfile).forEach(([field, value]) => {
    const input = modalFields.querySelector(`[data-item-field="${field}"]`);
    if (input) input.value = value;
  });
}

function saveItemProfile() {
  const profile = Object.fromEntries(Object.keys(DEFAULT_ITEM_PROFILE).map((field) => [field, modalFields.querySelector(`[data-item-field="${field}"]`).value.trim()]));
  const price = Number(profile.price);
  const limit = Number(profile.limit);
  if (!profile.name || !Number.isFinite(price) || price <= 0 || !Number.isInteger(limit) || limit <= 0) {
    showToast('请检查商品名称、价格和限购数量');
    return false;
  }
  itemProfile = { ...profile, price: profile.price, limit: profile.limit };
  persist(ITEM_PROFILE_KEY, itemProfile);
  renderItemProfile();
  renderFamilyVariant();
  renderOrders();
  renderStock();
  return true;
}

function populateFamilyForm() {
  if (!familyVariant) return;
  Object.entries(familyVariant).forEach(([field, value]) => {
    const input = modalFields.querySelector(`[data-family-field="${field}"]`);
    if (input) input.value = value;
  });
  modalFields.insertAdjacentHTML('beforeend', '<button class="remove-variant-button" type="button" data-remove-family>删除家族款</button>');
}

function renderFamilyVariant() {
  const button = document.querySelector('#familyVariantButton');
  if (!familyVariant) {
    button.classList.add('add-variant');
    button.classList.remove('family-recorded');
    button.innerHTML = '<span>＋ 添加</span><strong>家族款</strong><small>价格单独记录</small>';
    document.querySelector('#variantCountLabel').textContent = 'TF 家族 · 已录入 1 个款式';
    document.querySelector('#recentItemMeta').textContent = `单人款共 15 款 · ${itemProfile.status}`;
    document.querySelector('#recentItemPrice').innerHTML = `¥${formatPrice(itemProfile.price)}<span>/套</span>`;
    return;
  }
  const price = formatPrice(familyVariant.price);
  button.classList.remove('add-variant');
  button.classList.add('family-recorded');
  button.innerHTML = `<span>家族款 · 已录入</span><strong>¥${price}<small>/套</small></strong><small>每 ID 限购 ${familyVariant.limit} 份 · ${escapeHtml(familyVariant.status || '状态待补')}</small>`;
  document.querySelector('#variantCountLabel').textContent = 'TF 家族 · 已录入 2 个款式';
  document.querySelector('#recentItemMeta').textContent = '已录入单人款与家族款 · 官方现货';
  const startingPrice = Math.min(Number(itemProfile.price), Number(familyVariant.price));
  document.querySelector('#recentItemPrice').innerHTML = `¥${formatPrice(startingPrice)}<span>起</span>`;
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
  familyVariant = {
    price: priceInput.value.trim(),
    limit: limitInput.value.trim(),
    status: modalFields.querySelector('[data-family-field="status"]').value.trim(),
    contents: modalFields.querySelector('[data-family-field="contents"]').value.trim(),
  };
  window.localStorage.setItem(FAMILY_VARIANT_KEY, JSON.stringify(familyVariant));
  renderFamilyVariant();
  renderStock();
  return true;
}

function getVariantOptions() {
  const options = [{ value: 'single', label: `单人款 · ¥${formatPrice(itemProfile.price)}`, cost: Number(itemProfile.price) }];
  if (familyVariant) options.push({ value: 'family', label: `家族款 · ¥${formatPrice(familyVariant.price)}`, cost: Number(familyVariant.price) });
  return options;
}

function getMerchOptions() {
  return [{ value: MERCH_ID, label: itemProfile.name }];
}

function memberOptionsMarkup() {
  const members = TF4_MEMBERS.map((member) => `<option value="${escapeHtml(member)}">${escapeHtml(member)}</option>`).join('');
  const family = familyVariant
    ? '<option value="family">家族款（TF 家族）</option>'
    : '<option value="family" disabled>家族款（请先录入价格）</option>';
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

function selectedVariant(member) {
  const value = member === 'family' ? 'family' : 'single';
  return getVariantOptions().find((option) => option.value === value) || getVariantOptions()[0];
}

function populateOrderForm() {
  modalFields.querySelector('[data-order-field="merch"]').innerHTML = merchOptionsMarkup();
  modalFields.querySelector('[data-order-field="member"]').innerHTML = memberOptionsMarkup();
  syncOrderVariantFields();
}

function syncOrderVariantFields() {
  const variant = selectedVariant(readField('[data-order-field="member"]'));
  modalFields.querySelector('[data-order-field="cost"]').value = formatPrice(variant.cost);
}

function populateStockForm() {
  modalFields.querySelector('[data-stock-field="merch"]').innerHTML = merchOptionsMarkup();
  modalFields.querySelector('[data-stock-field="member"]').innerHTML = memberOptionsMarkup();
  syncStockVariantFields();
}

function syncStockVariantFields() {
  const variant = selectedVariant(readField('[data-stock-field="member"]'));
  modalFields.querySelector('[data-stock-field="cost"]').value = formatPrice(variant.cost);
}

function saveStock() {
  const merchId = readField('[data-stock-field="merch"]');
  const selectedMember = readField('[data-stock-field="member"]');
  const variantInfo = selectedVariant(selectedMember);
  const variant = variantInfo.value;
  const quantity = Number(readField('[data-stock-field="quantity"]'));
  if (!merchId || !selectedMember || !Number.isInteger(quantity) || quantity <= 0) {
    showToast('请选择周边、成员或家族款，并填写正确数量');
    return false;
  }
  const merch = getMerchOptions().find((option) => option.value === merchId) || getMerchOptions()[0];
  stock.unshift({ id: `stock-${Date.now()}`, merchId, merchName: merch.label, variant, variantLabel: variantInfo.label, member: variant === 'family' ? '' : selectedMember, quantity, intent: readField('[data-stock-field="intent"]'), status: readField('[data-stock-field="status"]'), unitCost: variantInfo.cost });
  persist(STOCK_KEY, stock);
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
  const variantInfo = selectedVariant(selectedMember);
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
  const merch = getMerchOptions().find((option) => option.value === merchId) || getMerchOptions()[0];
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
  document.querySelector('#itemSoldCount').textContent = recordedQuantity;
  document.querySelector('#itemRecordedCount').textContent = `已记录 ${recordedQuantity} 份`;
  document.querySelector('#allocationSold').style.width = `${Math.min(100, recordedQuantity / 15 * 100)}%`;
  const pendingOrders = orders.filter((order) => order.stage !== '已完成');
  document.querySelector('#attentionCount').textContent = pendingOrders.length;
  document.querySelector('#attentionList').innerHTML = pendingOrders.length ? `<div class="attention-list">${pendingOrders.slice(0, 3).map((order) => `<button class="attention-row" data-attention-order="${order.id}"><span class="attention-icon ${order.method === '垫付' ? 'orange' : 'blue'}">${order.method === '垫付' ? '↗' : '¥'}</span><span class="attention-copy"><strong>${order.stage === '待处理' ? '处理代拍订单' : escapeHtml(order.stage)}</strong><small>${escapeHtml(itemProfile.name)} · ${escapeHtml(order.buyer)}</small></span><span class="row-arrow">→</span></button>`).join('')}</div>` : '<div class="empty-state compact-empty"><span>✓</span><strong>现在没有待办</strong><small>订单发生变化后会出现在这里</small></div>';
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
  modalTitle.textContent = mode === 'addFamily' && familyVariant ? '编辑家族款' : config.title;
  modalCopy.textContent = config.copy;
  modalDropzone.style.display = config.drop ? 'grid' : 'none';
  modalFields.innerHTML = modalFieldTemplates[mode] || '';
  if (mode === 'newItem' || mode === 'itemDetail') populateItemForm();
  if (mode === 'newOrder') populateOrderForm();
  if (mode === 'newStock') populateStockForm();
  if (mode === 'sellStock') populateSaleForm();
  if (mode === 'addFamily') populateFamilyForm();
  modalFields.style.display = modalFieldTemplates[mode] ? 'grid' : 'none';
  modalConfirm.innerHTML = `${config.confirm} <span>→</span>`;
  backdrop.classList.add('open');
  backdrop.setAttribute('aria-hidden', 'false');
}

function closeModal() {
  backdrop.classList.remove('open');
  backdrop.setAttribute('aria-hidden', 'true');
  pendingRefundRow = null;
  pendingOrderId = null;
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
  openModal('itemDetail');
}));

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
  if (event.target.matches('[data-order-field="member"]')) syncOrderVariantFields();
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
    renderStock();
    showToast('已标记到家');
  }
  if (remove) {
    stock = stock.filter((entry) => entry.id !== remove.dataset.stockRemove);
    persist(STOCK_KEY, stock);
    renderStock();
    showToast('库存记录已移除');
  }
});
document.querySelector('#modalClose').addEventListener('click', closeModal);
document.querySelector('#modalCancel').addEventListener('click', closeModal);
modalFields.addEventListener('click', (event) => {
  if (event.target.closest('[data-remove-family]')) {
    familyVariant = null;
    window.localStorage.removeItem(FAMILY_VARIANT_KEY);
    renderFamilyVariant();
    closeModal();
    showToast('家族款已删除');
    return;
  }
  if (event.target.closest('[data-remove-order]')) {
    orders = orders.filter((order) => order.id !== pendingOrderId);
    persist(ORDERS_KEY, orders);
    renderOrders();
    renderDashboard();
    closeModal();
    showToast('订单已删除');
  }
});
backdrop.addEventListener('click', (event) => { if (event.target === backdrop) closeModal(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });
modalConfirm.addEventListener('click', () => {
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
  if (currentModalMode === 'newItem' || currentModalMode === 'itemDetail') {
    if (!saveItemProfile()) return;
    closeModal();
    showToast('商品资料已保存并更新');
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
  closeModal();
  showToast('已保存，相关库存和账目会自动更新');
});
document.querySelector('.drop-action').addEventListener('click', () => document.querySelector('#noticeFile').click());
document.querySelector('#noticeFile').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file) {
    document.querySelector('#dropzoneFileName').textContent = file.name;
    showToast('截图已导入，当前原型只记录文件名');
  }
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

document.querySelector('#syncPill')?.addEventListener('click', () => showToast('原型数据已保存在当前浏览器'));
document.querySelector('.settings-button')?.addEventListener('click', () => showToast('设置功能将在正式版本接入'));
document.querySelector('.avatar-button')?.addEventListener('click', () => showToast('当前为个人预览空间'));
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
renderFamilyVariant();
populateStockMemberFilter();
renderOrders();
renderDashboard();
renderStock();
