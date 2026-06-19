import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const config = window.APP_CONFIG || {};
const state = {
  filter: 'all',
  household: null,
  members: [],
  items: [],
  activeMemberId: null,
  supabase: null,
  channel: null,
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
const doneCount = document.getElementById('doneCount');
const filters = document.getElementById('filters');
const clearDoneBtn = document.getElementById('clearDoneBtn');
const itemTemplate = document.getElementById('itemTemplate');
const statusBanner = document.getElementById('statusBanner');

function setStatus(message, tone = 'info') {
  statusBanner.textContent = message;
  statusBanner.className = `status-banner is-${tone}`;
}

function hasValidConfig() {
  return Boolean(
    config.supabaseUrl &&
      config.supabaseAnonKey &&
      !config.supabaseUrl.includes('REPLACE_WITH') &&
      !config.supabaseAnonKey.includes('REPLACE_WITH')
  );
}

function getActiveMember() {
  return state.members.find((member) => member.id === state.activeMemberId) || state.members[0] || null;
}

function filteredItems() {
  if (state.filter === 'pending') return state.items.filter((item) => !item.isDone);
  if (state.filter === 'done') return state.items.filter((item) => item.isDone);
  return state.items;
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

  state.members.forEach((member) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `member-btn ${member.id === state.activeMemberId ? 'is-active' : ''}`;
    button.textContent = member.name;
    button.addEventListener('click', () => {
      state.activeMemberId = member.id;
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
  const pending = state.items.filter((item) => !item.isDone).length;
  const done = state.items.filter((item) => item.isDone).length;
  const activeMember = getActiveMember();
  pendingCount.textContent = pending;
  doneCount.textContent = done;
  listMeta.textContent = state.household
    ? `${state.items.length} productos · casa: ${state.household.name} · activo: ${activeMember ? activeMember.name : 'nadie'}`
    : 'Sin hogar cargado';
}

function renderItems() {
  itemsList.innerHTML = '';
  const items = filteredItems()
    .slice()
    .sort((a, b) => Number(a.isDone) - Number(b.isDone) || b.createdAt.localeCompare(a.createdAt));

  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No hay productos en este filtro. Añade uno arriba.';
    itemsList.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const node = itemTemplate.content.firstElementChild.cloneNode(true);
    node.classList.toggle('is-done', item.isDone);
    node.querySelector('.item-name').textContent = item.name;
    node.querySelector('.item-category').textContent = item.category;
    node.querySelector('.item-notes').textContent = item.notes || 'Sin notas';
    node.querySelector('.qty-pill').textContent = item.qty || 'Cantidad libre';
    node.querySelector('.by-pill').textContent = item.isDone
      ? `Compró: ${item.boughtByName || 'Sin registrar'}`
      : 'Pendiente';
    node.querySelector('.added-pill').textContent = `Añadió: ${item.addedByName || 'Sin registrar'}`;

    const checkbox = node.querySelector('.item-check');
    checkbox.checked = item.isDone;
    checkbox.addEventListener('change', () => toggleItem(item.id, checkbox.checked));

    node.querySelector('.delete-btn').addEventListener('click', () => deleteItem(item.id));

    itemsList.appendChild(node);
  });
}

function render() {
  renderMembers();
  renderFilters();
  renderStats();
  renderItems();
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
    .insert({
      name: config.householdName || 'Casa',
      invite_code: config.householdInviteCode,
    })
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
      household_id: state.household.id,
      display_name,
    }));

    const { data: inserted, error: insertError } = await state.supabase
      .from('members')
      .insert(seedMembers)
      .select('id, display_name')
      .order('created_at', { ascending: true });

    if (insertError) throw insertError;
    members = inserted || [];
  }

  state.members = members.map((member) => ({
    id: member.id,
    name: member.display_name,
  }));

  if (!state.activeMemberId || !state.members.some((member) => member.id === state.activeMemberId)) {
    state.activeMemberId = state.members[0]?.id || null;
  }
}

async function loadItems() {
  const { data, error } = await state.supabase
    .from('shopping_items')
    .select(
      `
        id,
        name,
        qty,
        category,
        notes,
        is_done,
        created_at,
        added_by:members!shopping_items_added_by_member_id_fkey(display_name),
        bought_by:members!shopping_items_bought_by_member_id_fkey(display_name)
      `
    )
    .eq('household_id', state.household.id)
    .order('created_at', { ascending: false });

  if (error) throw error;

  state.items = (data || []).map((item) => ({
    id: item.id,
    name: item.name,
    qty: item.qty || '',
    category: item.category || 'General',
    notes: item.notes || '',
    isDone: Boolean(item.is_done),
    createdAt: item.created_at,
    addedByName: item.added_by?.display_name || '',
    boughtByName: item.bought_by?.display_name || '',
  }));
}

async function addItem(event) {
  event.preventDefault();
  const activeMember = getActiveMember();
  const name = itemName.value.trim();
  if (!name || !activeMember) return;

  setStatus('Guardando producto…', 'info');

  const { error } = await state.supabase.from('shopping_items').insert({
    household_id: state.household.id,
    name,
    qty: itemQty.value.trim(),
    category: itemCategory.value,
    notes: itemNotes.value.trim(),
    added_by_member_id: activeMember.id,
  });

  if (error) {
    setStatus(`Error al guardar: ${error.message}`, 'error');
    return;
  }

  itemForm.reset();
  itemCategory.value = 'General';
  itemName.focus();
  setStatus('Producto añadido.', 'success');
  await loadItems();
  render();
}

async function toggleItem(itemId, checked) {
  const activeMember = getActiveMember();
  if (!activeMember) return;

  const { error } = await state.supabase
    .from('shopping_items')
    .update({
      is_done: checked,
      bought_by_member_id: checked ? activeMember.id : null,
    })
    .eq('id', itemId);

  if (error) {
    setStatus(`Error al actualizar: ${error.message}`, 'error');
    return;
  }

  setStatus(checked ? 'Marcado como comprado.' : 'Marcado como pendiente.', 'success');
  await loadItems();
  render();
}

async function deleteItem(itemId) {
  const { error } = await state.supabase.from('shopping_items').delete().eq('id', itemId);

  if (error) {
    setStatus(`Error al borrar: ${error.message}`, 'error');
    return;
  }

  setStatus('Producto eliminado.', 'success');
  await loadItems();
  render();
}

async function clearDone() {
  const { error } = await state.supabase
    .from('shopping_items')
    .delete()
    .eq('household_id', state.household.id)
    .eq('is_done', true);

  if (error) {
    setStatus(`Error al limpiar: ${error.message}`, 'error');
    return;
  }

  setStatus('Comprados eliminados.', 'success');
  await loadItems();
  render();
}

function setupRealtime() {
  if (state.channel) {
    state.supabase.removeChannel(state.channel);
  }

  state.channel = state.supabase
    .channel(`shopping-items-${state.household.id}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'shopping_items',
        filter: `household_id=eq.${state.household.id}`,
      },
      async () => {
        await loadItems();
        render();
      }
    )
    .subscribe();
}

function bindEvents() {
  filters.addEventListener('click', (event) => {
    const button = event.target.closest('.filter');
    if (!button) return;
    state.filter = button.dataset.filter;
    render();
  });

  itemForm.addEventListener('submit', (event) => {
    addItem(event).catch((error) => setStatus(`Error al guardar: ${error.message}`, 'error'));
  });

  clearDoneBtn.addEventListener('click', () => {
    clearDone().catch((error) => setStatus(`Error al limpiar: ${error.message}`, 'error'));
  });
}

function renderConfigHelp() {
  memberPicker.innerHTML = '';
  itemsList.innerHTML = '';
  listMeta.textContent = 'Falta conectar Supabase';
  pendingCount.textContent = '—';
  doneCount.textContent = '—';

  const empty = document.createElement('div');
  empty.className = 'empty-state';
  empty.innerHTML = 'Rellena <strong>config.js</strong> con tu <strong>Supabase URL</strong> y tu <strong>anon key</strong> pública.';
  itemsList.appendChild(empty);

  setStatus('Configura Supabase en config.js para salir del modo demo sin base de datos.', 'warning');
}

async function bootstrap() {
  bindEvents();

  if (!hasValidConfig()) {
    renderConfigHelp();
    return;
  }

  try {
    setStatus('Conectando con Supabase…', 'info');
    state.supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
    await ensureHousehold();
    await ensureMembers();
    await loadItems();
    setupRealtime();
    render();
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
