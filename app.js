import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const config = window.APP_CONFIG || {};
const state = {
  filter: 'all',
  household: null,
  members: [],
  products: [],
  events: [],
  activeMemberId: null,
  supabase: null,
  channel: null,
  user: null,
};

const memberPicker = document.getElementById('memberPicker');
const itemForm = document.getElementById('itemForm');
const itemName = document.getElementById('itemName');
const itemQty = document.getElementById('itemQty');
const itemCategory = document.getElementById('itemCategory');
const itemNotes = document.getElementById('itemNotes');
const itemsList = document.getElementById('itemsList');
const listMeta = document.getElementById('listMeta');
const pendingCount = document.getElementById('pendingCount');
const stockCount = document.getElementById('stockCount');
const netBalance = document.getElementById('netBalance');
const filters = document.getElementById('filters');
const itemTemplate = document.getElementById('itemTemplate');
const statusBanner = document.getElementById('statusBanner');
const suggestionsList = document.getElementById('suggestionsList');
const balancesList = document.getElementById('balancesList');
const eventsList = document.getElementById('eventsList');
const scanBtn = document.getElementById('scanBtn');
const exportBtn = document.getElementById('exportBtn');
const ptrIndicator = document.getElementById('ptrIndicator');
const authSection = document.getElementById('authSection');
const authContent = document.getElementById('authContent');
const toastContainer = document.getElementById('toastContainer');
const onboardingHint = document.getElementById('onboardingHint');

let swipeCtx = null;
let ptrCtx = null;

function setStatus(message, tone = 'info') {
  statusBanner.textContent = message;
  statusBanner.className = `status-banner is-${tone}`;
}

function showToast(message, tone = 'info', duration = 3000) {
  const toast = document.createElement('div');
  toast.className = `toast is-${tone}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('is-exiting');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function hasValidConfig() {
  return Boolean(
    config.supabaseUrl &&
      config.supabaseAnonKey &&
      !config.supabaseUrl.includes('REPLACE_WITH') &&
      !config.supabaseAnonKey.includes('REPLACE_WITH')
  );
}

function formatCurrencyFromCents(cents) {
  if (cents == null || Number.isNaN(Number(cents))) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(cents) / 100);
}

function formatDate(value) {
  if (!value) return 'sin fecha';
  return new Date(value).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
}

function differenceInDays(a, b) {
  const ms = Math.abs(new Date(a).getTime() - new Date(b).getTime());
  return ms / (1000 * 60 * 60 * 24);
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function getActiveMember() {
  return state.members.find((member) => member.id === state.activeMemberId) || state.members[0] || null;
}

function getMemberName(memberId) {
  return state.members.find((member) => member.id === memberId)?.name || 'Sin registrar';
}

function getProductEvents(productId) {
  return state.events
    .filter((event) => event.productId === productId)
    .slice()
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function parsePriceToCents(raw) {
  if (!raw) return null;
  const normalized = raw.replace(',', '.').replace(/[^\d.]/g, '');
  const amount = Number.parseFloat(normalized);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

function filteredProducts() {
  const visible = state.products.filter((product) => {
    if (state.filter === 'needed') return product.isNeeded && !product.isArchived;
    if (state.filter === 'stock') return !product.isNeeded && !product.isArchived;
    if (state.filter === 'archived') return product.isArchived;
    return !product.isArchived;
  });

  return visible.sort((a, b) => {
    if (a.isArchived !== b.isArchived) return Number(a.isArchived) - Number(b.isArchived);
    if (a.isNeeded !== b.isNeeded) return Number(b.isNeeded) - Number(a.isNeeded);
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });
}

function getConsumptionMetrics(product) {
  const events = getProductEvents(product.id);
  const consumed = events.filter((event) => event.type === 'consumed');
  const intervals = [];

  for (let i = 1; i < consumed.length; i += 1) {
    intervals.push(differenceInDays(consumed[i].createdAt, consumed[i - 1].createdAt));
  }

  if (!intervals.length && consumed.length === 1 && product.lastBoughtAt) {
    intervals.push(differenceInDays(consumed[0].createdAt, product.lastBoughtAt));
  }

  const avgDays = intervals.length ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length : null;
  const referenceDate = product.lastConsumedAt || product.lastBoughtAt || product.createdAt;
  const daysSinceReference = referenceDate ? differenceInDays(new Date().toISOString(), referenceDate) : null;

  let suggestion = 'Sin datos todavía';
  let urgency = 0;

  if (product.isNeeded) {
    suggestion = 'Hace falta reponerlo';
    urgency = 3;
  } else if (avgDays && daysSinceReference != null) {
    if (daysSinceReference >= avgDays * 0.8) {
      suggestion = `Suele durar ~${round1(avgDays)} días · toca comprar pronto`;
      urgency = 2;
    } else {
      suggestion = `Suele durar ~${round1(avgDays)} días`;
      urgency = 1;
    }
  } else if (!product.isNeeded) {
    suggestion = 'Aún no hay historial suficiente';
  }

  return { avgDays, daysSinceReference, suggestion, urgency };
}

function computeBalances() {
  const balances = Object.fromEntries(state.members.map((member) => [member.id, 0]));
  const purchaseEvents = state.events.filter((event) => event.type === 'bought' && event.amountCents > 0 && event.memberId);

  purchaseEvents.forEach((event) => {
    const share = event.amountCents / Math.max(state.members.length, 1);
    state.members.forEach((member) => {
      balances[member.id] -= share;
    });
    balances[event.memberId] += event.amountCents;
  });

  return state.members.map((member) => ({
    id: member.id,
    name: member.name,
    cents: Math.round(balances[member.id] || 0),
  }));
}

function computeSettlements() {
  const balances = computeBalances();
  const debtors = balances.filter(b => b.cents < 0).map(b => ({ ...b, cents: Math.abs(b.cents) }));
  const creditors = balances.filter(b => b.cents > 0).map(b => ({ ...b }));
  const settlements = [];

  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].cents, creditors[j].cents);
    if (amount > 0) {
      settlements.push({
        from: debtors[i].name,
        to: creditors[j].name,
        cents: amount,
      });
    }
    debtors[i].cents -= amount;
    creditors[j].cents -= amount;
    if (debtors[i].cents === 0) i++;
    if (creditors[j].cents === 0) j++;
  }
  return settlements;
}

function getPriceHistory(productId) {
  return state.events
    .filter((event) => event.productId === productId && event.type === 'bought' && event.amountCents > 0)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map((event) => ({ date: event.createdAt, price: event.amountCents / 100, member: event.memberName }));
}

function generateShareText() {
  const needed = state.products.filter((p) => p.isNeeded && !p.isArchived);
  const stock = state.products.filter((p) => !p.isNeeded && !p.isArchived);
  const lines = ['🛒 LISTA DE LA COMPRA', `📅 ${new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}`, ''];
  if (needed.length) {
    lines.push('🔴 POR COMPRAR:');
    needed.forEach((p) => lines.push(`  • ${p.name}${p.qtyLabel ? ` (${p.qtyLabel})` : ''}${p.notes ? ` — ${p.notes}` : ''}`));
    lines.push('');
  }
  if (stock.length) {
    lines.push('✅ EN CASA:');
    stock.forEach((p) => lines.push(`  • ${p.name}${p.qtyLabel ? ` (${p.qtyLabel})` : ''}`));
    lines.push('');
  }
  const balances = computeBalances();
  if (balances.length) {
    lines.push('💰 BALANCE:');
    balances.forEach((b) => {
      const label = b.cents >= 0 ? 'ha adelantado' : 'debe';
      lines.push(`  • ${b.name}: ${label} ${formatCurrencyFromCents(Math.abs(b.cents))}`);
    });
  }
  return lines.join('\n');
}

async function shareList() {
  const text = generateShareText();
  if (navigator.share) {
    try { await navigator.share({ title: 'Lista de la compra', text }); } catch { showToast('Compartir cancelado', 'warning', 2000); }
  } else {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Lista copiada al portapapeles', 'success');
    } catch {
      showToast('No se pudo copiar', 'error');
    }
  }
}

function persistActiveMember(id) {
  try { localStorage.setItem('compra-casa:activeMember', id); } catch {}
}
function restoreActiveMember() {
  try { return localStorage.getItem('compra-casa:activeMember'); } catch { return null; }
}

function renderMembers() {
  memberPicker.innerHTML = '';
  if (!state.members.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Todavía no hay miembros en este hogar.';
    memberPicker.appendChild(empty);
    return;
  }
  const hasSavedMember = restoreActiveMember() && state.members.some(m => m.id === restoreActiveMember());
  if (onboardingHint) {
    onboardingHint.hidden = hasSavedMember || state.members.length === 0;
  }
  state.members.forEach((member) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `member-btn ${member.id === state.activeMemberId ? 'is-active' : ''}`;
    button.textContent = member.name;
    button.addEventListener('click', () => {
      state.activeMemberId = member.id;
      persistActiveMember(member.id);
      if (onboardingHint) onboardingHint.hidden = true;
      render();
    });
    memberPicker.appendChild(button);
  });
}

function renderFilters() {
  [...filters.querySelectorAll('.filter')].forEach((button) => {
    button.classList.toggle('is-active', button.dataset.filter === state.filter);
  });
}

function renderStats() {
  const pending = state.products.filter((product) => product.isNeeded && !product.isArchived).length;
  const stock = state.products.filter((product) => !product.isNeeded && !product.isArchived).length;
  const balances = computeBalances();
  const activeBalance = balances.find((entry) => entry.id === state.activeMemberId);
  const activeMember = getActiveMember();
  pendingCount.textContent = pending;
  stockCount.textContent = stock;
  netBalance.textContent = activeBalance ? formatCurrencyFromCents(activeBalance.cents) : '0 €';
  listMeta.textContent = state.household
    ? `${state.products.filter((product) => !product.isArchived).length} productos · casa: ${state.household.name} · activo: ${activeMember ? activeMember.name : 'nadie'}`
    : 'Sin hogar cargado';
}

function renderSuggestions() {
  suggestionsList.innerHTML = '';
  const cards = state.products
    .filter((product) => !product.isArchived)
    .map((product) => ({ product, metrics: getConsumptionMetrics(product) }))
    .sort((a, b) => b.metrics.urgency - a.metrics.urgency || a.product.name.localeCompare(b.product.name))
    .slice(0, 6);
  if (!cards.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Añade productos y ve marcando compras/gastos para aprender ritmos.';
    suggestionsList.appendChild(empty);
    return;
  }
  cards.forEach(({ product, metrics }) => {
    const card = document.createElement('article');
    card.className = 'mini-card';
    const priceHistory = getPriceHistory(product.id);
    const priceTrend = priceHistory.length >= 2
      ? (priceHistory[priceHistory.length - 1].price - priceHistory[0].price).toFixed(2)
      : null;
    card.innerHTML = `
      <strong>${product.name}</strong>
      <span>${metrics.suggestion}</span>
      <small>Último precio: ${formatCurrencyFromCents(product.lastPriceCents)}${priceTrend ? ` · tendencia: ${Number(priceTrend) >= 0 ? '+' : ''}${priceTrend} €` : ''}</small>
    `;
    suggestionsList.appendChild(card);
  });
}

function renderBalances() {
  balancesList.innerHTML = '';
  const balances = computeBalances().sort((a, b) => b.cents - a.cents);
  const settlements = computeSettlements();

  if (!balances.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Sin miembros ni gastos todavía.';
    balancesList.appendChild(empty);
    return;
  }

  balances.forEach((entry) => {
    const card = document.createElement('article');
    card.className = `mini-card ${entry.cents >= 0 ? 'positive' : 'negative'}`;
    const label = entry.cents >= 0 ? 'ha adelantado' : 'debe';
    card.innerHTML = `
      <strong>${entry.name}</strong>
      <span>${label}</span>
      <small>${formatCurrencyFromCents(Math.abs(entry.cents))}</small>
    `;
    balancesList.appendChild(card);
  });

  if (settlements.length) {
    const heading = document.createElement('p');
    heading.className = 'section-hint';
    heading.style.margin = '0.75rem 0 0.4rem';
    heading.textContent = 'Para saldar cuentas:';
    balancesList.appendChild(heading);

    settlements.forEach((s) => {
      const card = document.createElement('article');
      card.className = 'mini-card settlement';
      card.innerHTML = `
        <strong>${s.from}</strong>
        <span>→ ${s.to}</span>
        <small>${formatCurrencyFromCents(s.cents)}</small>
      `;
      balancesList.appendChild(card);
    });
  }
}

function renderEvents() {
  eventsList.innerHTML = '';
  const latest = state.events.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 8);
  if (!latest.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Aquí saldrán compras y consumos recientes.';
    eventsList.appendChild(empty);
    return;
  }
  latest.forEach((event) => {
    const card = document.createElement('article');
    card.className = 'mini-card';
    const amount = event.amountCents ? ` · ${formatCurrencyFromCents(event.amountCents)}` : '';
    card.innerHTML = `
      <strong>${event.productName}</strong>
      <span>${event.label} · ${event.memberName} · ${formatDate(event.createdAt)}${amount}</span>
      <small>${event.notes || 'sin notas'}</small>
    `;
    eventsList.appendChild(card);
  });
}

function renderAuth() {
  if (!state.supabase) return;
  authContent.innerHTML = '';
  if (state.user) {
    authSection.hidden = false;
    const div = document.createElement('div');
    div.className = 'auth-user';
    div.innerHTML = `
      <span class="auth-user-email">${state.user.email}</span>
      <button type="button" class="ghost-btn" id="logoutBtn">Cerrar sesión</button>
    `;
    authContent.appendChild(div);
    div.querySelector('#logoutBtn')?.addEventListener('click', async () => {
      await state.supabase.auth.signOut();
      state.user = null;
      render();
    });
  } else if (config.supabaseAnonKey && !config.supabaseAnonKey.includes('REPLACE_WITH')) {
    authSection.hidden = false;
    const form = document.createElement('form');
    form.className = 'auth-form';
    form.innerHTML = `
      <input type="email" id="authEmail" placeholder="tu@email.com" required />
      <button type="submit" class="primary-btn">Enviar enlace mágico</button>
    `;
    authContent.appendChild(form);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = form.querySelector('#authEmail').value;
      const { error } = await state.supabase.auth.signInWithOtp({ email });
      if (error) {
        showToast(`Error: ${error.message}`, 'error');
      } else {
        showToast('Enlace mágico enviado a tu correo', 'success');
        form.innerHTML = '<p style="color:var(--muted);font-size:0.9rem">Revisa tu bandeja de entrada.</p>';
      }
    });
  } else {
    authSection.hidden = true;
  }
}

function renderProducts() {
  itemsList.innerHTML = '';
  const products = filteredProducts();
  if (!products.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No hay productos en este filtro.';
    itemsList.appendChild(empty);
    return;
  }
  products.forEach((product) => {
    const metrics = getConsumptionMetrics(product);
    const node = itemTemplate.content.firstElementChild.cloneNode(true);
    node.classList.toggle('is-done', !product.isNeeded && !product.isArchived);
    node.querySelector('.item-name').textContent = product.name;
    node.querySelector('.item-category').textContent = product.category;
    node.querySelector('.item-notes').textContent = product.notes || 'Sin notas';
    node.querySelector('.qty-pill').textContent = product.qtyLabel || 'Cantidad libre';
    node.querySelector('.price-pill').textContent = `Último precio: ${formatCurrencyFromCents(product.lastPriceCents)}`;
    node.querySelector('.by-pill').textContent = product.isNeeded
      ? `Último gasto: ${product.lastConsumedByName || '—'}`
      : `Última compra: ${product.lastBoughtByName || '—'}`;
    node.querySelector('.item-suggestion').textContent = metrics.suggestion;

    const statePill = node.querySelector('.state-pill');
    statePill.textContent = product.isArchived ? 'Archivado' : product.isNeeded ? 'Comprar' : 'En casa';
    statePill.className = `state-pill ${product.isArchived ? 'archived' : product.isNeeded ? 'needed' : 'stocked'}`;

    const actionBtn = node.querySelector('.action-btn');
    const archiveBtn = node.querySelector('.archive-btn');

    if (product.isArchived) {
      actionBtn.textContent = 'Reactivar';
      actionBtn.addEventListener('click', () => unarchiveProduct(product.id));
      archiveBtn.textContent = 'Oculto';
      archiveBtn.disabled = true;
    } else if (product.isNeeded) {
      actionBtn.textContent = 'Comprar ahora';
      actionBtn.addEventListener('click', () => buyProduct(product));
      archiveBtn.textContent = 'Archivar';
      archiveBtn.addEventListener('click', () => archiveProduct(product.id));
    } else {
      actionBtn.textContent = 'Se ha gastado';
      actionBtn.addEventListener('click', () => consumeProduct(product));
      archiveBtn.textContent = 'Archivar';
      archiveBtn.addEventListener('click', () => archiveProduct(product.id));
    }

    node.dataset.productId = product.id;
    itemsList.appendChild(node);
  });
}

function render() {
  renderMembers();
  renderFilters();
  renderStats();
  renderSuggestions();
  renderBalances();
  renderEvents();
  renderProducts();
  renderAuth();
}

async function ensureHousehold() {
  const { data: existing, error: fetchError } = await state.supabase
    .from('households')
    .select('id, name, invite_code')
    .eq('invite_code', config.householdInviteCode)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (existing) {
    state.household = existing;
    return;
  }
  const { data: inserted, error: insertError } = await state.supabase
    .from('households')
    .insert({ name: config.householdName || 'Casa', invite_code: config.householdInviteCode })
    .select('id, name, invite_code')
    .single();
  if (insertError) throw insertError;
  state.household = inserted;
}

async function ensureMembers() {
  const { data, error } = await state.supabase
    .from('members')
    .select('id, display_name')
    .eq('household_id', state.household.id)
    .order('created_at', { ascending: true });
  if (error) throw error;
  let members = data || [];
  if (!members.length) {
    const seedMembers = (config.defaultMembers || ['Roberto', 'Hermano 1', 'Hermano 2']).map((display_name) => ({
      household_id: state.household.id, display_name,
    }));
    const { data: inserted, error: insertError } = await state.supabase.from('members').insert(seedMembers).select('id, display_name');
    if (insertError) throw insertError;
    members = inserted || [];
  }
  state.members = members.map((member) => ({ id: member.id, name: member.display_name }));
  const saved = restoreActiveMember();
  if (saved && state.members.some(m => m.id === saved)) {
    state.activeMemberId = saved;
  } else {
    state.activeMemberId = state.members[0]?.id || null;
  }
}

async function loadProducts() {
  const { data, error } = await state.supabase
    .from('shopping_products')
    .select(`
      id, name, qty_label, category, notes, is_needed, is_archived,
      last_price_cents, created_at, updated_at, last_bought_at, last_consumed_at,
      last_bought_by:members!shopping_products_last_bought_by_member_id_fkey(display_name),
      last_consumed_by:members!shopping_products_last_consumed_by_member_id_fkey(display_name)
    `)
    .eq('household_id', state.household.id)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  state.products = (data || []).map((product) => ({
    id: product.id,
    name: product.name,
    qtyLabel: product.qty_label || '',
    category: product.category || 'General',
    notes: product.notes || '',
    isNeeded: Boolean(product.is_needed),
    isArchived: Boolean(product.is_archived),
    lastPriceCents: product.last_price_cents,
    createdAt: product.created_at,
    updatedAt: product.updated_at,
    lastBoughtAt: product.last_bought_at,
    lastConsumedAt: product.last_consumed_at,
    lastBoughtByName: product.last_bought_by?.display_name || '',
    lastConsumedByName: product.last_consumed_by?.display_name || '',
  }));
}

function eventLabel(type) {
  return { created: 'creado', bought: 'comprado', consumed: 'gastado', needed: 'marcado como pendiente', archived: 'archivado', unarchived: 'reactivado' }[type] || type;
}

async function loadEvents() {
  const { data, error } = await state.supabase
    .from('shopping_events')
    .select(`
      id, product_id, member_id, event_type, amount_cents, notes, created_at,
      product:shopping_products!shopping_events_product_id_fkey(name),
      member:members!shopping_events_member_id_fkey(display_name)
    `)
    .eq('household_id', state.household.id)
    .order('created_at', { ascending: false })
    .limit(400);
  if (error) throw error;
  state.events = (data || []).map((event) => ({
    id: event.id,
    productId: event.product_id,
    memberId: event.member_id,
    type: event.event_type,
    amountCents: event.amount_cents,
    notes: event.notes || '',
    createdAt: event.created_at,
    productName: event.product?.name || 'Producto',
    memberName: event.member?.display_name || 'Sin registrar',
    label: eventLabel(event.event_type),
  }));
}

async function refreshAll() {
  await ensureMembers();
  await Promise.all([loadProducts(), loadEvents()]);
  render();
}

async function addItem(event) {
  event.preventDefault();
  const activeMember = getActiveMember();
  const name = itemName.value.trim();
  if (!name || !activeMember) return;
  setStatus('Creando producto…', 'info');
  const { data: inserted, error } = await state.supabase
    .from('shopping_products')
    .insert({
      household_id: state.household.id, name, qty_label: itemQty.value.trim(),
      category: itemCategory.value, notes: itemNotes.value.trim(),
      is_needed: true, created_by_member_id: activeMember.id,
    })
    .select('id, name')
    .single();
  if (error) { setStatus(`Error al guardar: ${error.message}`, 'error'); return; }
  await state.supabase.from('shopping_events').insert({
    household_id: state.household.id, product_id: inserted.id,
    member_id: activeMember.id, event_type: 'created', notes: 'Producto creado',
  });
  itemForm.reset();
  itemCategory.value = 'General';
  itemName.focus();
  await refreshAll();
  showToast(`${name} añadido a la lista`, 'success');
}

async function buyProduct(product) {
  const activeMember = getActiveMember();
  if (!activeMember) return;
  const rawPrice = window.prompt(`¿Cuánto costó ${product.name}?`, product.lastPriceCents ? String(product.lastPriceCents / 100) : '');
  if (rawPrice === null) return;
  const amountCents = parsePriceToCents(rawPrice);
  if (amountCents == null) { setStatus('Precio inválido. Usa por ejemplo 2,35', 'warning'); return; }
  const note = window.prompt('¿Alguna nota de compra? (opcional)', '') ?? '';
  const { error } = await state.supabase.from('shopping_products').update({
    is_needed: false, last_price_cents: amountCents,
    last_bought_by_member_id: activeMember.id, last_bought_at: new Date().toISOString(),
  }).eq('id', product.id);
  if (error) { setStatus(`Error al marcar compra: ${error.message}`, 'error'); return; }
  await state.supabase.from('shopping_events').insert({
    household_id: state.household.id, product_id: product.id,
    member_id: activeMember.id, event_type: 'bought',
    amount_cents: amountCents, notes: note,
  });
  await refreshAll();
  showToast(`${product.name} comprado · ${formatCurrencyFromCents(amountCents)}`, 'success');
}

async function consumeProduct(product) {
  const activeMember = getActiveMember();
  if (!activeMember) return;
  const note = window.prompt(`¿Se ha gastado ${product.name}? Nota opcional`, '') ?? '';
  const { error } = await state.supabase.from('shopping_products').update({
    is_needed: true, last_consumed_by_member_id: activeMember.id,
    last_consumed_at: new Date().toISOString(),
  }).eq('id', product.id);
  if (error) { setStatus(`Error al marcar consumo: ${error.message}`, 'error'); return; }
  await state.supabase.from('shopping_events').insert({
    household_id: state.household.id, product_id: product.id,
    member_id: activeMember.id, event_type: 'consumed', notes: note,
  });
  await refreshAll();
  showToast(`${product.name} gastado · vuelve a la lista de compra`, 'success');
}

async function archiveProduct(productId) {
  const activeMember = getActiveMember();
  const { error } = await state.supabase.from('shopping_products').update({ is_archived: true }).eq('id', productId);
  if (error) { setStatus(`Error al archivar: ${error.message}`, 'error'); return; }
  await state.supabase.from('shopping_events').insert({
    household_id: state.household.id, product_id: productId,
    member_id: activeMember?.id || null, event_type: 'archived',
  });
  await refreshAll();
  showToast('Producto archivado', 'success');
}

async function unarchiveProduct(productId) {
  const activeMember = getActiveMember();
  const { error } = await state.supabase.from('shopping_products').update({ is_archived: false }).eq('id', productId);
  if (error) { setStatus(`Error al reactivar: ${error.message}`, 'error'); return; }
  await state.supabase.from('shopping_events').insert({
    household_id: state.household.id, product_id: productId,
    member_id: activeMember?.id || null, event_type: 'unarchived',
  });
  await refreshAll();
  showToast('Producto reactivado', 'success');
}

function setupRealtime() {
  if (state.channel) state.supabase.removeChannel(state.channel);
  state.channel = state.supabase
    .channel(`shopping-stock-${state.household.id}`)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'shopping_products',
      filter: `household_id=eq.${state.household.id}`,
    }, async () => { await refreshAll(); })
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'shopping_events',
      filter: `household_id=eq.${state.household.id}`,
    }, async () => { await refreshAll(); })
    .subscribe();
}

function setupSwipe() {
  itemsList.addEventListener('touchstart', (e) => {
    const card = e.target.closest('.item-card');
    if (!card || card.closest('.item-actions')) return;
    const touch = e.changedTouches[0];
    swipeCtx = { card, startX: touch.clientX, startY: touch.clientY, currentX: 0, moved: false };
  }, { passive: true });

  itemsList.addEventListener('touchmove', (e) => {
    if (!swipeCtx) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - swipeCtx.startX;
    const dy = touch.clientY - swipeCtx.startY;
    if (!swipeCtx.moved && Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
    swipeCtx.moved = true;
    if (Math.abs(dx) < Math.abs(dy)) return;
    e.preventDefault();
    swipeCtx.currentX = dx;
    const clamped = Math.max(-150, Math.min(150, dx));
    swipeCtx.card.style.transform = `translateX(${clamped}px)`;
    swipeCtx.card.classList.add('is-swiping');
    const productId = swipeCtx.card.dataset.productId;
    if (!productId) return;
    const product = state.products.find((p) => p.id === productId);
    if (!product) return;
    const bgBuy = swipeCtx.card.querySelector('.bg-buy');
    const bgArchive = swipeCtx.card.querySelector('.bg-archive');
    if (bgBuy && bgArchive) {
      if (clamped < -30 && product.isNeeded && !product.isArchived) {
        bgBuy.style.opacity = Math.min(1, Math.abs(clamped) / 120);
        bgArchive.style.opacity = 0;
      } else if (clamped > 30 && !product.isArchived) {
        bgArchive.style.opacity = Math.min(1, clamped / 120);
        bgBuy.style.opacity = 0;
      } else {
        bgBuy.style.opacity = 0;
        bgArchive.style.opacity = 0;
      }
    }
  }, { passive: false });

  itemsList.addEventListener('touchend', (e) => {
    if (!swipeCtx || !swipeCtx.moved) { swipeCtx = null; return; }
    const card = swipeCtx.card;
    const dx = swipeCtx.currentX;
    const productId = card.dataset.productId;
    const product = state.products.find((p) => p.id === productId);
    card.classList.remove('is-swiping');
    card.style.transform = '';

    const bgBuy = card.querySelector('.bg-buy');
    const bgArchive = card.querySelector('.bg-archive');
    if (bgBuy) bgBuy.style.opacity = 0;
    if (bgArchive) bgArchive.style.opacity = 0;

    if (product && dx < -80 && product.isNeeded && !product.isArchived) {
      buyProduct(product);
    } else if (product && dx < -80 && !product.isNeeded && !product.isArchived) {
      consumeProduct(product);
    } else if (product && dx > 80 && !product.isArchived) {
      archiveProduct(product.id);
    }

    swipeCtx = null;
  }, { passive: true });
}

function setupPullToRefresh() {
  const shell = document.querySelector('.app-shell');
  let startY = 0;
  let pulling = false;

  shell.addEventListener('touchstart', (e) => {
    if (window.scrollY > 0) return;
    startY = e.changedTouches[0].clientY;
    pulling = true;
    ptrCtx = { startY };
  }, { passive: true });

  shell.addEventListener('touchmove', (e) => {
    if (!pulling || window.scrollY > 0) return;
    const dy = e.changedTouches[0].clientY - startY;
    if (dy < 0) { ptrIndicator.hidden = true; return; }
    if (dy > 30) {
      ptrIndicator.hidden = false;
      ptrIndicator.style.opacity = Math.min(1, (dy - 30) / 100);
    }
  }, { passive: true });

  shell.addEventListener('touchend', async (e) => {
    if (!pulling) return;
    pulling = false;
    const dy = e.changedTouches[0].clientY - startY;
    ptrIndicator.hidden = true;
    ptrIndicator.style.opacity = 1;
    if (dy > 120 && hasValidConfig() && state.supabase) {
      ptrIndicator.hidden = false;
      ptrIndicator.querySelector('.ptr-text').textContent = 'Actualizando…';
      await refreshAll();
      ptrIndicator.querySelector('.ptr-text').textContent = 'Actualizado';
      showToast('Datos actualizados', 'success');
      setTimeout(() => { ptrIndicator.hidden = true; }, 800);
    }
    ptrCtx = null;
  }, { passive: true });
}

async function setupBarcodeScanning() {
  if (!('BarcodeDetector' in window)) {
    scanBtn.title = 'Escanear no disponible en este navegador';
    return;
  }
  scanBtn.hidden = false;
  scanBtn.addEventListener('click', async () => {
    if (scanBtn.classList.contains('is-scanning')) return;
    try {
      const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'codabar', 'itf', 'qr_code'] });
      scanBtn.classList.add('is-scanning');
      showToast('Enfoca un código de barras con la cámara', 'info', 4000);
      const barcodes = await detector.detect(videoElement());
      scanBtn.classList.remove('is-scanning');
      if (barcodes.length > 0) {
        itemName.value = barcodes[0].rawValue;
        showToast(`Código: ${barcodes[0].rawValue}`, 'success', 2000);
      } else {
        showToast('No se detectó ningún código', 'warning', 2000);
      }
    } catch (err) {
      scanBtn.classList.remove('is-scanning');
      if (err.name === 'NotAllowedError' || err.name === 'NotFoundError') {
        itemName.focus();
        itemName.select();
        showToast('Escribe el nombre del producto manualmente', 'warning', 2000);
      } else {
        showToast(`Error: ${err.message}`, 'error');
      }
    }
  });
}

function videoElement() {
  let vid = document.getElementById('barcodeVideo');
  if (!vid) {
    vid = document.createElement('video');
    vid.id = 'barcodeVideo';
    vid.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.appendChild(vid);
  }
  return vid;
}

function setupAuthListener() {
  if (!state.supabase) return;
  state.supabase.auth.onAuthStateChange((event, session) => {
    state.user = session?.user || null;
    render();
  });
}

async function checkSession() {
  if (!state.supabase) return;
  const { data: { session } } = await state.supabase.auth.getSession();
  state.user = session?.user || null;
}

function bindEvents() {
  filters.addEventListener('click', (event) => {
    const button = event.target.closest('.filter');
    if (!button) return;
    state.filter = button.dataset.filter;
    renderProducts();
    renderFilters();
  });

  itemForm.addEventListener('submit', (event) => {
    addItem(event).catch((error) => setStatus(`Error al guardar: ${error.message}`, 'error'));
  });

  exportBtn.addEventListener('click', shareList);

  const suggestionHintBtn = document.getElementById('suggestionHintBtn');
  const suggestionHint = document.getElementById('suggestionHint');
  if (suggestionHintBtn && suggestionHint) {
    suggestionHintBtn.addEventListener('click', () => {
      suggestionHint.hidden = !suggestionHint.hidden;
    });
  }
}

function renderConfigHelp() {
  memberPicker.innerHTML = '';
  itemsList.innerHTML = '';
  suggestionsList.innerHTML = '';
  balancesList.innerHTML = '';
  eventsList.innerHTML = '';
  listMeta.textContent = 'Falta conectar Supabase';
  pendingCount.textContent = '—';
  stockCount.textContent = '—';
  netBalance.textContent = '—';
  const empty = document.createElement('div');
  empty.className = 'empty-state';
  empty.innerHTML = 'Rellena <strong>config.js</strong> con tu <strong>Supabase URL</strong> y tu <strong>anon key</strong> pública. Luego ejecuta <strong>supabase/schema.sql</strong>.';
  itemsList.appendChild(empty);
  setStatus('Configura Supabase en config.js para activar stock, historial y balances reales.', 'warning');
}

let deferredInstallPrompt = null;
const installBanner = document.getElementById('installBanner');
const installBtn = document.getElementById('installBtn');
const installDismiss = document.getElementById('installDismiss');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const dismissed = localStorage.getItem('compra-casa:installDismissed');
  if (!dismissed && installBanner) {
    installBanner.hidden = false;
  }
});

if (installBtn) {
  installBtn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') showToast('App instalada 🎉', 'success');
    deferredInstallPrompt = null;
    installBanner.hidden = true;
  });
}

if (installDismiss) {
  installDismiss.addEventListener('click', () => {
    installBanner.hidden = true;
    try { localStorage.setItem('compra-casa:installDismissed', '1'); } catch {}
  });
}

window.addEventListener('appinstalled', () => {
  installBanner.hidden = true;
  deferredInstallPrompt = null;
});

async function bootstrap() {
  bindEvents();

  if (!hasValidConfig()) {
    renderConfigHelp();
    return;
  }

  try {
    setStatus('Conectando con Supabase…', 'info');
    state.supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
    await checkSession();
    setupAuthListener();
    await ensureHousehold();
    await refreshAll();
    setupRealtime();
    setupSwipe();
    setupPullToRefresh();
    setupBarcodeScanning();
    setStatus(`Conectado a ${state.household.name}.`, 'success');
  } catch (error) {
    console.error(error);
    setStatus(`Error de conexión: ${error.message}`, 'error');
    renderConfigHelp();
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

bootstrap();
