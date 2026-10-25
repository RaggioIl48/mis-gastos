import * as cloud from './cloud.js';
import {
  addMonths, canDeleteCategory, CATEGORY_ICONS, cleanShoppingText, comparisonKey, createInitialData, dateKey,
  dayTitle, dayTotal, doneItems, firstDayOfMonth, formatCOP, groupByDay, householdIdFromSearch, householdMonth,
  initials, inviteLink, isFilterActive, isLikelyDuplicate, isValidDayKey, makeBackup, matchesFilter, monthKeyOf,
  monthTitle, parseData, parseErrorMessage, parseThousands, pendingItems, pendingText, SCOPES, scopeLabel,
  shoppingPreview, shortDate, sortExpenses, thousandsInput, toCSV, total, usageText, validateCategoryName,
} from './logic.js';
import { readPreference, requestPersistence, writePreference } from './store.js';

// ---------- Utilidades ----------

const $ = (selector, root = document) => root.querySelector(selector);

const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);

const ICONS = {
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
  right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
  chevron: '<svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
  filter: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>',
  cart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6.2"/><circle cx="9.5" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/></svg>',
};

const firstName = (name) => String(name ?? '').trim().split(/\s+/)[0] || 'Yo';

// ---------- Estado ----------

const today = () => dateKey();

function emptyState() {
  return {
    phase: 'loading', // loading | setup | signin | app
    user: null,
    profile: null,
    household: null,
    // data.expenses son los gastos de esta persona: sus personales y los familiares que registró.
    data: { categories: [], expenses: [] },
    personal: [],
    family: [], // gastos familiares de todo el hogar
    shopping: [],
    loaded: { categories: false, expenses: false },
    synced: { categories: false, expenses: false },
    authError: '',
  };
}

const state = {
  ...emptyState(),
  tab: 'inicio',
  month: monthKeyOf(today()),
  familyMonth: monthKeyOf(today()),
  filter: { categoryId: null, byDate: false, from: firstDayOfMonth(today()), to: today() },
};

const uid = () => state.user?.uid;
const myName = () => state.profile?.name ?? firstName(state.user?.displayName);
const householdId = () => state.household?.id ?? null;
const owner = () => ({ uid: uid(), name: myName(), householdId: householdId() });
const myFamilyExpenses = () => state.data.expenses.filter((expense) => expense.scope === SCOPES.family);

function mergeMyExpenses() {
  state.data.expenses = [
    ...state.personal.map((expense) => ({ ...expense, scope: SCOPES.personal })),
    ...state.family.filter((expense) => expense.createdBy === uid()).map((expense) => ({ ...expense, scope: SCOPES.family })),
  ];
}

function sortedCategories() {
  return [...state.data.categories].sort((a, b) => a.order - b.order);
}

function categoryById(id) {
  return state.data.categories.find((category) => category.id === id) ?? null;
}

function usageCounts() {
  const counts = new Map();
  for (const expense of state.data.expenses) {
    counts.set(expense.categoryId, (counts.get(expense.categoryId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Envía un cambio a la nube. El cambio se ve al instante (y sin Internet queda en cola);
 * solo se avisa si la nube lo rechaza.
 */
function persist(promise) {
  requestPersistence();
  promise.catch((error) => {
    console.error(error);
    toast(error?.code === 'permission-denied' ? 'No tienes permiso para ese cambio.' : 'No se pudo guardar en la nube. Inténtalo de nuevo.');
  });
}

// ---------- Componentes ----------

function expenseRow(expense, { showDate }) {
  const category = categoryById(expense.categoryId);
  const categoryName = category?.name ?? 'Sin categoría';
  const title = expense.note || categoryName;
  const subtitle = [expense.note ? categoryName : null, showDate ? shortDate(expense.date) : null]
    .filter(Boolean)
    .join(' · ');
  const isFamily = expense.scope === SCOPES.family;
  return `
    <li>
      <button class="row-button" type="button" data-action="edit-expense" data-id="${escapeHTML(expense.id)}">
        <span class="row-icon" aria-hidden="true">${escapeHTML(category?.icon ?? '❔')}</span>
        <span class="row-texts">
          <span class="row-title">${escapeHTML(title)}</span>
          ${subtitle || isFamily ? `<span class="row-subtitle">${isFamily ? '<span class="tag">Familia</span>' : ''}${escapeHTML(subtitle)}</span>` : ''}
        </span>
        <span class="row-amount">${formatCOP(expense.amount)}</span>
      </button>
    </li>`;
}

function emptyBox(title, message) {
  return `<div class="empty"><strong>${escapeHTML(title)}</strong><p>${escapeHTML(message)}</p></div>`;
}

function monthNav(monthKey, scope) {
  const isCurrent = monthKey === monthKeyOf(today());
  return `
    <div class="month-nav">
      <button class="icon-button" type="button" data-action="month-prev" data-scope="${scope}" aria-label="Mes anterior">${ICONS.left}</button>
      <button class="month-title" type="button" data-action="month-current" data-scope="${scope}" ${isCurrent ? 'aria-disabled="true"' : 'aria-label="Volver al mes actual"'}>${escapeHTML(monthTitle(monthKey))}</button>
      <button class="icon-button" type="button" data-action="month-next" data-scope="${scope}" aria-label="Mes siguiente" ${isCurrent ? 'disabled' : ''}>${ICONS.right}</button>
    </div>`;
}

// ---------- Pantallas sin sesión ----------

function loadingView() {
  return '<div class="center-screen"><div class="spinner" aria-hidden="true"></div><p>Cargando…</p></div>';
}

function setupView() {
  return `
    <div class="center-screen">
      <h1>Falta configurar</h1>
      <p>Esta versión necesita los datos del proyecto de Firebase en <code>firebase-config.js</code>.</p>
    </div>`;
}

function signInView() {
  const invited = Boolean(readPreference('invitacion'));
  return `
    <section class="center-screen auth">
      <img class="auth-icon" src="icons/icon-192.png" alt="" width="88" height="88">
      <h1>Mis Gastos</h1>
      <p>Registra tus gastos y comparte con tu hogar solo los que marques como <strong>Familia</strong>. Tus gastos personales los ves únicamente tú.</p>
      ${invited ? '<p class="auth-note">Te invitaron a un hogar. Inicia sesión para unirte.</p>' : ''}
      <button class="primary-button google" type="button" data-action="sign-in">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" stroke="none" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z"/><path fill="currentColor" stroke="none" opacity=".8" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z"/><path fill="currentColor" stroke="none" opacity=".6" d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9z"/><path fill="currentColor" stroke="none" opacity=".9" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.5L6.4 10C7.2 7.8 9.4 6 12 6z"/></svg>
        <span>Continuar con Google</span>
      </button>
      <p class="form-error" role="alert">${escapeHTML(state.authError)}</p>
    </section>`;
}

// ---------- Pestañas ----------

function shoppingBanner() {
  const pending = pendingItems(state.shopping);
  if (!pending.length) return '';
  return `
    <button class="banner" type="button" data-action="go-tab" data-tab="lista">
      <span class="banner-icon" aria-hidden="true">${ICONS.cart}</span>
      <span class="row-texts">
        <span class="row-title">${escapeHTML(pendingText(pending.length))}</span>
        <span class="row-subtitle">${escapeHTML(shoppingPreview(state.shopping))}</span>
      </span>
      ${ICONS.chevron}
    </button>`;
}

function homeView() {
  const now = today();
  const isCurrent = state.month === monthKeyOf(now);
  const expenses = sortExpenses(state.data.expenses);
  const monthItems = expenses.filter((expense) => monthKeyOf(expense.date) === state.month);

  return `
    <header class="title-bar"><h1>Mis Gastos</h1></header>
    ${shoppingBanner()}
    <section class="card summary" aria-label="Resumen">
      ${monthNav(state.month, 'home')}
      <p class="summary-label">Total del mes</p>
      <p class="summary-total">${formatCOP(total(monthItems))}</p>
      <div class="summary-row"><span>Hoy</span><strong>${formatCOP(dayTotal(expenses, now))}</strong></div>
      <div class="summary-row"><span>Movimientos del mes</span><strong>${monthItems.length}</strong></div>
    </section>
    <h2 class="section-title">${isCurrent ? 'Últimos movimientos' : 'Movimientos del mes'}</h2>
    ${monthItems.length
      ? `<ul class="list">${monthItems.map((e) => expenseRow(e, { showDate: true })).join('')}</ul>`
      : emptyBox('Sin gastos', isCurrent ? 'Aún no has registrado gastos este mes.' : 'No hay gastos registrados en este mes.')}
    <div class="add-bar">
      <button class="add-button" type="button" data-action="add-expense">${ICONS.plus}<span>Añadir gasto</span></button>
    </div>`;
}

function filterDescription(filter) {
  const parts = [];
  if (filter.categoryId) parts.push(categoryById(filter.categoryId)?.name ?? 'Categoría');
  if (filter.byDate) {
    const [from, to] = [filter.from, filter.to].filter(Boolean).sort();
    parts.push(!to || from === to ? shortDate(from) : `${shortDate(from)} – ${shortDate(to)}`);
  }
  return parts.join(' · ');
}

function historyView() {
  const filter = state.filter;
  const active = isFilterActive(filter);
  const items = sortExpenses(state.data.expenses).filter((expense) => matchesFilter(expense, filter));

  const groups = groupByDay(items).map((group) => `
    <h2 class="section-title"><span>${escapeHTML(dayTitle(group.day))}</span><span>${formatCOP(total(group.items))}</span></h2>
    <ul class="list">${group.items.map((e) => expenseRow(e, { showDate: false })).join('')}</ul>`).join('');

  let empty = '';
  if (!items.length) {
    empty = active
      ? emptyBox('Sin resultados', 'Ningún gasto coincide con los filtros.')
      : emptyBox('Sin gastos', 'Los gastos que registres aparecerán aquí.');
  }

  return `
    <header class="title-bar">
      <h1>Historial</h1>
      <div class="title-actions">
        <button class="icon-button" type="button" data-action="export-csv" aria-label="Exportar CSV" ${items.length ? '' : 'disabled'}>${ICONS.share}</button>
        <button class="icon-button ${active ? 'active' : ''}" type="button" data-action="open-filters" aria-label="Filtrar">${ICONS.filter}</button>
        <button class="icon-button" type="button" data-action="add-expense" aria-label="Añadir gasto">${ICONS.plus}</button>
      </div>
    </header>
    ${active ? `
      <div class="filter-summary">
        <span>${escapeHTML(filterDescription(filter))}</span>
        <button class="link" type="button" data-action="clear-filters">Quitar</button>
      </div>` : ''}
    ${items.length ? `
      <section class="card summary" aria-label="Total">
        <div class="summary-row first"><span>${active ? 'Total filtrado' : 'Total registrado'}</span><strong>${formatCOP(total(items))}</strong></div>
        <div class="summary-row"><span>Gastos</span><strong>${items.length}</strong></div>
      </section>` : ''}
    ${groups}${empty}`;
}

function shoppingRow(item) {
  const by = item.createdBy === uid() ? 'ti' : (item.createdByName || 'alguien del hogar');
  return `
    <li class="item-row ${item.done ? 'done' : ''}">
      <button class="check" type="button" data-action="toggle-item" data-id="${escapeHTML(item.id)}"
        role="checkbox" aria-checked="${item.done}" aria-label="${item.done ? 'Desmarcar' : 'Marcar como comprado'}: ${escapeHTML(item.text)}">${item.done ? ICONS.check : ''}</button>
      <span class="row-texts">
        <span class="row-title">${escapeHTML(item.text)}</span>
        <span class="row-subtitle">${item.done ? 'Comprado' : `Añadido por ${escapeHTML(by)}`}</span>
      </span>
      <button class="icon-button subtle" type="button" data-action="delete-item" data-id="${escapeHTML(item.id)}" aria-label="Eliminar ${escapeHTML(item.text)}">${ICONS.trash}</button>
    </li>`;
}

function badgeSupported() {
  return 'setAppBadge' in navigator && 'Notification' in window;
}

function listView() {
  const pending = pendingItems(state.shopping);
  const done = doneItems(state.shopping);
  const offerBadge = badgeSupported() && Notification.permission === 'default' && isStandalone();

  return `
    <header class="title-bar"><h1>Lista</h1></header>
    <form class="add-item card" data-form="add-item" autocomplete="off">
      <label class="visually-hidden" for="new-item">Algo que falta</label>
      <input id="new-item" maxlength="80" placeholder="Añadir algo que falta…" enterkeyhint="done">
      <button class="icon-button" type="submit" aria-label="Añadir a la lista">${ICONS.plus}</button>
    </form>
    ${pending.length
      ? `<h2 class="section-title">${escapeHTML(pendingText(pending.length))}</h2><ul class="list">${pending.map(shoppingRow).join('')}</ul>`
      : `<div class="group">${emptyBox('Nada pendiente', 'Lo que añadas aquí lo verán todas las personas del hogar.')}</div>`}
    ${done.length ? `
      <h2 class="section-title"><span>Comprado</span><button class="link small" type="button" data-action="clear-done">Borrar comprados</button></h2>
      <ul class="list">${done.map(shoppingRow).join('')}</ul>` : ''}
    ${offerBadge ? `
      <button class="banner subtle" type="button" data-action="enable-badge">
        <span class="banner-icon" aria-hidden="true">🔔</span>
        <span class="row-texts"><span class="row-title">Mostrar pendientes en el icono</span><span class="row-subtitle">Verás el número de cosas por comprar sobre el icono de la app</span></span>
      </button>` : ''}
    <p class="section-note">La lista es compartida con tu hogar. Al abrir la app, Inicio te recuerda lo que falta.</p>`;
}

function familyView() {
  const household = state.household;
  if (!household) return `<header class="title-bar"><h1>Familia</h1></header>${loadingView()}`;
  const members = household.members.map((id) => ({ id, name: household.names?.[id] ?? 'Miembro' }));
  const nameOf = (id, fallback) => household.names?.[id] ?? fallback ?? 'Miembro';
  const month = householdMonth(state.family, state.familyMonth, members.map(({ id, name }) => ({ uid: id, name })));
  const myIcons = new Map(state.data.categories.map((c) => [comparisonKey(c.name), c.icon]));
  const memberRows = month.byMember.map((member) => `
    <div class="summary-row member-total">
      <span><span class="avatar small" aria-hidden="true">${escapeHTML(initials(member.name))}</span>${escapeHTML(member.uid === uid() ? `${member.name} (tú)` : member.name)}</span>
      <strong>${formatCOP(member.total)}</strong>
    </div>`).join('');

  const rows = month.byCategory.map((entry) => `
    <li class="share-row">
      <span class="row-icon" aria-hidden="true">${escapeHTML(myIcons.get(comparisonKey(entry.name)) ?? entry.icon ?? '🏷️')}</span>
      <span class="row-texts">
        <span class="share-line"><span class="row-title">${escapeHTML(entry.name)}</span><span class="row-amount">${formatCOP(entry.total)}</span></span>
        <span class="share-bar" aria-hidden="true"><span style="width:${Math.max(2, Math.round(entry.share * 100))}%"></span></span>
      </span>
    </li>`).join('');

  // Detalle de los gastos familiares: lo ve todo el hogar; solo quien lo registró lo puede editar.
  const detail = month.items.map((expense) => {
    const mine = expense.createdBy === uid();
    const who = mine ? 'Tú' : nameOf(expense.createdBy, expense.createdByName);
    const title = expense.note || expense.categoryName || 'Sin categoría';
    const subtitle = [who, expense.note ? expense.categoryName : null, shortDate(expense.date)].filter(Boolean).join(' · ');
    const inner = `
        <span class="row-icon" aria-hidden="true">${escapeHTML(expense.categoryIcon ?? '🏷️')}</span>
        <span class="row-texts">
          <span class="row-title">${escapeHTML(title)}</span>
          <span class="row-subtitle">${escapeHTML(subtitle)}</span>
        </span>
        <span class="row-amount">${formatCOP(expense.amount)}</span>`;
    return mine
      ? `<li><button class="row-button" type="button" data-action="edit-expense" data-id="${escapeHTML(expense.id)}">${inner}</button></li>`
      : `<li><div class="row-button static">${inner}</div></li>`;
  }).join('');

  return `
    <header class="title-bar"><h1>Familia</h1></header>
    <section class="card summary" aria-label="Total del hogar">
      ${monthNav(state.familyMonth, 'family')}
      <p class="summary-label">Total del hogar</p>
      <p class="summary-total">${formatCOP(month.total)}</p>
      ${memberRows}
      <div class="summary-row"><span>Movimientos</span><strong>${month.count}</strong></div>
    </section>
    ${rows ? `
      <h2 class="section-title">Por categoría</h2>
      <ul class="list">${rows}</ul>
      <h2 class="section-title">Gastos familiares</h2>
      <ul class="list">${detail}</ul>`
      : `<div class="group">${emptyBox('Sin gastos familiares', 'Al guardar un gasto, elige «Familia» para que aparezca aquí.')}</div>`}
    <h2 class="section-title">Hogar</h2>
    <div class="card members">
      <div class="avatars">${members.map((m) => `<span class="avatar" title="${escapeHTML(m.name)}">${escapeHTML(initials(m.name))}</span><span class="avatar-name">${escapeHTML(m.id === uid() ? `${m.name} (tú)` : m.name)}</span>`).join('')}</div>
      <button class="primary-button" type="button" data-action="invite">${ICONS.share}<span>Invitar a alguien</span></button>
    </div>
    <p class="section-note">Aquí solo aparecen los gastos marcados como «Familia». Los gastos personales los ve únicamente quien los registró.</p>`;
}

function categoriesView() {
  const counts = usageCounts();
  const categories = sortedCategories();
  const rows = categories.map((category) => `
    <li>
      <button class="row-button" type="button" data-action="edit-category" data-id="${escapeHTML(category.id)}">
        <span class="row-icon" aria-hidden="true">${escapeHTML(category.icon)}</span>
        <span class="row-texts"><span class="row-title">${escapeHTML(category.name)}</span></span>
        <span class="row-detail">${usageText(counts.get(category.id) ?? 0)}</span>
        ${ICONS.chevron}
      </button>
    </li>`).join('');

  return `
    <button class="back-button" type="button" data-action="go-tab" data-tab="ajustes">${ICONS.left}<span>Ajustes</span></button>
    <header class="title-bar">
      <h1>Categorías</h1>
      <div class="title-actions">
        <button class="icon-button" type="button" data-action="add-category" aria-label="Nueva categoría">${ICONS.plus}</button>
      </div>
    </header>
    ${categories.length
      ? `<ul class="list">${rows}</ul>
         <p class="section-note">Toca una categoría para cambiar su nombre o icono. Solo se pueden eliminar las que no tienen gastos; las demás se conservan en el historial.</p>`
      : emptyBox('Sin categorías', 'Crea una categoría para empezar a registrar gastos.')}`;
}

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
}

function settingsView() {
  const count = state.data.expenses.length;
  const members = state.household
    ? state.household.members.map((id) => state.household.names?.[id] ?? 'Miembro').join(', ')
    : '…';
  return `
    <header class="title-bar"><h1>Ajustes</h1></header>
    ${isStandalone() ? '' : `
      <h2 class="section-title">Instalar en el iPhone</h2>
      <div class="card"><p class="settings-text">En Safari toca <strong>Compartir</strong> y luego <strong>Añadir a pantalla de inicio</strong>.</p></div>`}

    <h2 class="section-title">Cuenta</h2>
    <ul class="list">
      <li><button class="row-button" type="button" data-action="edit-name"><span class="row-texts"><span class="row-title">${escapeHTML(myName())}</span><span class="row-subtitle">${escapeHTML(state.user?.email ?? '')}</span></span><span class="row-detail">Cambiar nombre</span>${ICONS.chevron}</button></li>
      <li><button class="row-button" type="button" data-action="go-tab" data-tab="categorias"><span class="row-texts"><span class="row-title">Categorías</span></span><span class="row-detail">${state.data.categories.length}</span>${ICONS.chevron}</button></li>
    </ul>

    <h2 class="section-title">Hogar</h2>
    <ul class="list">
      <li><div class="row-button static"><span class="row-texts"><span class="row-title">Miembros</span><span class="row-subtitle">${escapeHTML(members)}</span></span></div></li>
      <li><button class="row-button" type="button" data-action="invite"><span class="row-texts"><span class="row-title">Invitar a alguien</span><span class="row-subtitle">Envía un enlace para unirse a tu hogar</span></span>${ICONS.chevron}</button></li>
      ${(state.household?.members.length ?? 0) > 1 ? '<li><button class="row-button danger" type="button" data-action="leave-household"><span class="row-texts"><span class="row-title">Salir del hogar</span></span></button></li>' : ''}
    </ul>

    <h2 class="section-title">Compartir la app</h2>
    <ul class="list">
      <li><button class="row-button" type="button" data-action="recommend-app"><span class="row-texts"><span class="row-title">Recomendar a un amigo</span><span class="row-subtitle">Cada persona tiene su propia cuenta y su propio hogar</span></span>${ICONS.chevron}</button></li>
      <li><a class="row-button" href="https://github.com/RaggioIl48/mis-gastos/releases/latest/download/mis-gastos.apk" rel="noopener"><span class="row-texts"><span class="row-title">App para Android (.apk)</span><span class="row-subtitle">Descárgala e instálala en un teléfono Android</span></span>${ICONS.chevron}</a></li>
    </ul>

    <h2 class="section-title">Copia de seguridad</h2>
    <ul class="list">
      <li><button class="row-button" type="button" data-action="export-backup"><span class="row-texts"><span class="row-title">Exportar copia</span><span class="row-subtitle">Guarda un archivo con tus gastos y categorías</span></span>${ICONS.chevron}</button></li>
      <li><button class="row-button" type="button" data-action="import-backup"><span class="row-texts"><span class="row-title">Importar copia</span><span class="row-subtitle">Reemplaza tus datos por los de un archivo</span></span>${ICONS.chevron}</button></li>
      <li><button class="row-button" type="button" data-action="export-all-csv" ${count ? '' : 'disabled'}><span class="row-texts"><span class="row-title">Exportar todo a CSV</span><span class="row-subtitle">Para abrir en Excel o Numbers</span></span>${ICONS.chevron}</button></li>
    </ul>
    <input id="backup-file" class="visually-hidden" type="file" accept=".json,application/json" tabindex="-1" aria-hidden="true">
    <p class="section-note">Tus gastos personales solo los ves tú. Con tu hogar se comparten únicamente los gastos que marques como «Familia» y la lista de compras.</p>

    <ul class="list group">
      <li><button class="row-button danger" type="button" data-action="sign-out"><span class="row-texts"><span class="row-title">Cerrar sesión</span></span></button></li>
    </ul>`;
}

const VIEWS = {
  inicio: homeView, historial: historyView, lista: listView, familia: familyView, ajustes: settingsView, categorias: categoriesView,
};
const TAB_OF_VIEW = { categorias: 'ajustes' };

/** Vuelve a dibujar la pantalla sin perder lo que se esté escribiendo en ella. */
function render() {
  const view = $('#view');
  const active = document.activeElement;
  const keep = active?.id && view.contains(active) && 'value' in active
    ? { id: active.id, value: active.value, start: active.selectionStart, end: active.selectionEnd }
    : null;

  let html;
  if (state.phase === 'loading') html = loadingView();
  else if (state.phase === 'setup') html = setupView();
  else if (state.phase === 'signin') html = signInView();
  else html = VIEWS[state.tab]();

  view.innerHTML = html;
  const inApp = state.phase === 'app';
  document.body.classList.toggle('no-tabs', !inApp);
  view.classList.toggle('with-add-bar', inApp && state.tab === 'inicio');
  const currentTab = TAB_OF_VIEW[state.tab] ?? state.tab;
  document.querySelectorAll('.tab').forEach((tab) => {
    if (tab.dataset.tab === currentTab) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
  const listCount = pendingItems(state.shopping).length;
  const badge = $('.tab[data-tab="lista"] .tab-badge');
  if (badge) {
    badge.textContent = listCount > 9 ? '9+' : String(listCount);
    badge.hidden = !inApp || !listCount;
  }

  if (keep) {
    const input = document.getElementById(keep.id);
    if (input) {
      input.value = keep.value;
      input.focus({ preventScroll: true });
      try { input.setSelectionRange(keep.start, keep.end); } catch { /* tipo sin selección */ }
    }
  }
}

function setTab(tab) {
  if (!VIEWS[tab]) return;
  state.tab = tab;
  render();
  window.scrollTo(0, 0);
}

// ---------- Hojas, diálogos y avisos ----------

let sheetCleanup = null;

function openSheet(html, labelledBy) {
  closeSheet();
  const root = $('#sheet-root');
  root.innerHTML = `
    <div class="sheet-overlay"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="${labelledBy}">${html}</div>`;
  root.classList.add('visible');
  document.body.classList.add('sheet-open');
  root.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', closeSheet));
  const onKey = (event) => { if (event.key === 'Escape' && !$('#dialog-root').childElementCount) closeSheet(); };
  document.addEventListener('keydown', onKey);
  sheetCleanup = () => document.removeEventListener('keydown', onKey);
  root.getBoundingClientRect(); // fuerza el diseño para que se vea la animación
  root.classList.add('open');
  return $('.sheet', root);
}

function closeSheet() {
  const root = $('#sheet-root');
  sheetCleanup?.();
  sheetCleanup = null;
  root.classList.remove('open', 'visible');
  root.innerHTML = '';
  document.body.classList.remove('sheet-open');
}

function confirmDialog({ title, message = '', confirmLabel = 'Aceptar', cancelLabel = 'Cancelar', destructive = false }) {
  return new Promise((resolve) => {
    const root = $('#dialog-root');
    const previousFocus = document.activeElement;
    root.innerHTML = `
      <div class="dialog-overlay">
        <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title" ${message ? 'aria-describedby="dialog-message"' : ''}>
          <h2 id="dialog-title">${escapeHTML(title)}</h2>
          ${message ? `<p id="dialog-message">${escapeHTML(message)}</p>` : ''}
          <div class="dialog-actions">
            ${cancelLabel ? `<button type="button" data-answer="no">${escapeHTML(cancelLabel)}</button>` : ''}
            <button type="button" data-answer="yes" class="${destructive ? 'destructive' : 'primary'}">${escapeHTML(confirmLabel)}</button>
          </div>
        </div>
      </div>`;
    root.querySelectorAll('[data-answer]').forEach((button) => button.addEventListener('click', () => {
      root.innerHTML = '';
      previousFocus?.focus?.({ preventScroll: true });
      resolve(button.dataset.answer === 'yes');
    }));
    $('[data-answer="yes"]', root).focus();
  });
}

const alertDialog = (title, message) => confirmDialog({ title, message, cancelLabel: null });

let toastTimer = null;

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('visible'), 2200);
}

// ---------- Formulario de gasto ----------

function openExpenseForm(expense = null) {
  const isNew = !expense;
  const now = today();
  const categories = sortedCategories();
  if (!categories.length) {
    alertDialog('No hay categorías', 'Crea una categoría en Ajustes → Categorías antes de registrar gastos.');
    return;
  }

  const lastCategory = readPreference('ultimaCategoria');
  let selectedCategory = expense
    ? expense.categoryId
    : (categories.find((c) => c.id === lastCategory) ?? categories[0]).id;
  const canShare = Boolean(householdId());
  let selectedScope = expense?.scope
    ?? (canShare && readPreference('ultimoTipo') === SCOPES.family ? SCOPES.family : SCOPES.personal);
  const scopeHint = (scope) => (scope === SCOPES.family
    ? 'Lo verá todo tu hogar en la pestaña Familia.'
    : 'Solo tú lo ves. No aparece en Familia.');

  const chips = categories.map((category) => `
    <button type="button" class="chip" role="radio" data-category="${escapeHTML(category.id)}" aria-checked="${category.id === selectedCategory}">
      <span aria-hidden="true">${escapeHTML(category.icon)}</span>${escapeHTML(category.name)}
    </button>`).join('');

  const sheet = openSheet(`
    <form id="expense-form" novalidate>
      <div class="sheet-header">
        <button type="button" class="link" data-close>Cancelar</button>
        <h2 id="expense-title">${isNew ? 'Nuevo gasto' : 'Editar gasto'}</h2>
        <button type="submit" class="link strong" id="save-expense">Guardar</button>
      </div>
      <div class="sheet-body">
        <div class="group">
          <label class="group-label" for="amount">Valor</label>
          <div class="amount-field">
            <span class="currency" aria-hidden="true">$</span>
            <input id="amount" inputmode="decimal" autocomplete="off" enterkeyhint="done" placeholder="0"
              value="${expense ? escapeHTML(thousandsInput(expense.amount)) : ''}"
              aria-describedby="amount-preview amount-hint">
            <span class="unit" aria-hidden="true">mil</span>
          </div>
          <p id="amount-preview" class="preview" aria-live="polite"></p>
          <p id="amount-hint" class="hint">Escribe el valor en miles: 25 = $25.000 · 1250 = $1.250.000</p>
        </div>
        <div class="group">
          <span class="group-label" id="scope-label">Tipo de gasto</span>
          <div class="segmented" role="radiogroup" aria-labelledby="scope-label" aria-describedby="scope-hint">
            <button type="button" role="radio" data-scope="${SCOPES.personal}" aria-checked="${selectedScope === SCOPES.personal}">🔒 Personal</button>
            <button type="button" role="radio" data-scope="${SCOPES.family}" aria-checked="${selectedScope === SCOPES.family}" ${canShare ? '' : 'disabled'}>🏠 Familia</button>
          </div>
          <p id="scope-hint" class="hint">${scopeHint(selectedScope)}</p>
        </div>
        <div class="group">
          <span class="group-label" id="category-label">Categoría</span>
          <div class="chips" role="radiogroup" aria-labelledby="category-label">${chips}</div>
        </div>
        <div class="group fields">
          <label class="field"><span>Fecha</span><input id="date" type="date" required max="${now}" value="${expense ? expense.date : now}"></label>
          <label class="field"><span>Descripción</span><input id="note" maxlength="80" placeholder="Opcional" autocomplete="off" enterkeyhint="done" value="${expense ? escapeHTML(expense.note) : ''}"></label>
        </div>
        <p class="form-error" id="form-error" role="alert"></p>
        ${isNew ? '' : '<button type="button" class="destructive-button" id="delete-expense">Eliminar gasto</button>'}
      </div>
    </form>`, 'expense-title');

  const form = $('#expense-form', sheet);
  const amountInput = $('#amount', sheet);
  const dateInput = $('#date', sheet);
  const noteInput = $('#note', sheet);
  const preview = $('#amount-preview', sheet);
  const saveButton = $('#save-expense', sheet);
  const errorBox = $('#form-error', sheet);
  let saving = false;

  const update = () => {
    const result = parseThousands(amountInput.value);
    if (result.ok) {
      preview.className = 'preview ok';
      preview.innerHTML = `Se guardará como <strong>${formatCOP(result.pesos)}</strong> COP`;
    } else if (result.error === 'empty') {
      preview.className = 'preview';
      preview.textContent = 'Vista previa: $0 COP';
    } else {
      preview.className = 'preview error';
      preview.textContent = parseErrorMessage(result.error);
    }
    saveButton.disabled = saving || !result.ok || !selectedCategory;
    errorBox.textContent = '';
  };

  amountInput.addEventListener('input', update);
  $('.segmented', sheet).addEventListener('click', (event) => {
    const option = event.target.closest('[data-scope]');
    if (!option || option.disabled) return;
    selectedScope = option.dataset.scope;
    sheet.querySelectorAll('[data-scope]').forEach((el) => {
      el.setAttribute('aria-checked', String(el.dataset.scope === selectedScope));
    });
    $('#scope-hint', sheet).textContent = scopeHint(selectedScope);
  });
  $('.chips', sheet).addEventListener('click', (event) => {
    const chip = event.target.closest('[data-category]');
    if (!chip) return;
    selectedCategory = chip.dataset.category;
    sheet.querySelectorAll('[data-category]').forEach((el) => {
      el.setAttribute('aria-checked', String(el.dataset.category === selectedCategory));
    });
    update();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saving) return;
    const result = parseThousands(amountInput.value);
    const date = dateInput.value;
    const note = noteInput.value.trim();
    if (!result.ok) { errorBox.textContent = parseErrorMessage(result.error); return; }
    if (!selectedCategory) { errorBox.textContent = 'Elige una categoría.'; return; }
    if (!isValidDayKey(date)) { errorBox.textContent = 'Elige una fecha válida.'; return; }
    if (date > today()) { errorBox.textContent = 'La fecha no puede ser futura.'; return; }

    saving = true;
    update();
    const scope = selectedScope === SCOPES.family && householdId() ? SCOPES.family : SCOPES.personal;
    const fields = { amount: result.pesos, categoryId: selectedCategory, date, note, scope };
    const category = categoryById(selectedCategory);

    if (isNew) {
      const candidate = { ...fields, createdAt: Date.now() };
      if (isLikelyDuplicate(candidate, state.data.expenses)) {
        const proceed = await confirmDialog({
          title: '¿Gasto duplicado?',
          message: 'Acabas de registrar un gasto con el mismo valor, categoría, fecha y descripción.',
          confirmLabel: 'Guardar igual',
        });
        if (!proceed) { saving = false; update(); return; }
      }
      persist(cloud.saveExpense(owner(), { id: cloud.newExpenseId(uid()), ...candidate }, category));
      writePreference('ultimaCategoria', selectedCategory);
      writePreference('ultimoTipo', scope);
      closeSheet();
      toast(`Gasto ${scope === SCOPES.family ? 'familiar' : 'personal'} de ${formatCOP(result.pesos)} guardado`);
    } else {
      persist(cloud.saveExpense(owner(), { ...expense, ...fields }, category, expense.scope));
      closeSheet();
      toast(scope === expense.scope ? 'Cambios guardados' : `Ahora es un gasto ${scope === SCOPES.family ? 'familiar' : 'personal'}`);
    }
  });

  $('#delete-expense', sheet)?.addEventListener('click', async () => {
    const proceed = await confirmDialog({
      title: '¿Eliminar este gasto?',
      message: `${formatCOP(expense.amount)} · Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      destructive: true,
    });
    if (proceed) {
      persist(cloud.deleteExpense(owner(), expense));
      closeSheet();
      toast('Gasto eliminado');
    }
  });

  update();
  if (isNew) amountInput.focus();
}

// ---------- Filtros del historial ----------

function openFilters() {
  const filter = { ...state.filter };
  const options = sortedCategories().map((category) => `
    <option value="${escapeHTML(category.id)}" ${category.id === filter.categoryId ? 'selected' : ''}>${escapeHTML(category.icon)} ${escapeHTML(category.name)}</option>`).join('');

  const sheet = openSheet(`
    <form id="filter-form">
      <div class="sheet-header">
        <button type="button" class="link" data-close>Cancelar</button>
        <h2 id="filter-title">Filtros</h2>
        <button type="submit" class="link strong">Aplicar</button>
      </div>
      <div class="sheet-body">
        <div class="group fields">
          <label class="field"><span>Categoría</span>
            <select id="filter-category"><option value="">Todas</option>${options}</select>
          </label>
        </div>
        <div class="group fields">
          <label class="field"><span>Filtrar por fechas</span><input id="filter-by-date" type="checkbox" ${filter.byDate ? 'checked' : ''}></label>
          <label class="field date-field"><span>Desde</span><input id="filter-from" type="date" value="${filter.from}"></label>
          <label class="field date-field"><span>Hasta</span><input id="filter-to" type="date" value="${filter.to}"></label>
        </div>
        <button type="button" class="destructive-button" id="filter-clear">Quitar filtros</button>
      </div>
    </form>`, 'filter-title');

  const byDate = $('#filter-by-date', sheet);
  const syncDates = () => sheet.querySelectorAll('.date-field').forEach((el) => { el.hidden = !byDate.checked; });
  byDate.addEventListener('change', syncDates);
  syncDates();

  $('#filter-form', sheet).addEventListener('submit', (event) => {
    event.preventDefault();
    const from = $('#filter-from', sheet).value;
    const to = $('#filter-to', sheet).value;
    state.filter = {
      categoryId: $('#filter-category', sheet).value || null,
      byDate: byDate.checked && (isValidDayKey(from) || isValidDayKey(to)),
      from: isValidDayKey(from) ? from : '',
      to: isValidDayKey(to) ? to : '',
    };
    closeSheet();
    render();
  });

  $('#filter-clear', sheet).addEventListener('click', () => {
    clearFilters();
    closeSheet();
  });
}

function clearFilters() {
  state.filter = { categoryId: null, byDate: false, from: firstDayOfMonth(today()), to: today() };
  render();
}

// ---------- Editor de categoría ----------

function openCategoryEditor(category = null) {
  const count = category ? (usageCounts().get(category.id) ?? 0) : 0;
  let icon = category?.icon ?? '🏷️';

  const choices = CATEGORY_ICONS.map((choice) => `
    <button type="button" class="icon-choice" role="radio" data-icon="${choice}" aria-checked="${choice === icon}" aria-label="Icono ${choice}">${choice}</button>`).join('');

  const sheet = openSheet(`
    <form id="category-form" novalidate>
      <div class="sheet-header">
        <button type="button" class="link" data-close>Cancelar</button>
        <h2 id="category-title">${category ? 'Editar categoría' : 'Nueva categoría'}</h2>
        <button type="submit" class="link strong" id="save-category">Guardar</button>
      </div>
      <div class="sheet-body">
        <div class="group fields">
          <label class="field"><span>Nombre</span><input id="category-name" maxlength="40" autocomplete="off" enterkeyhint="done" placeholder="Ej. Mascotas" value="${escapeHTML(category?.name ?? '')}"></label>
        </div>
        <p class="form-error" id="category-error" role="alert"></p>
        <div class="group">
          <span class="group-label" id="icon-label">Icono</span>
          <div class="icon-grid" role="radiogroup" aria-labelledby="icon-label">${choices}</div>
        </div>
        ${category ? `
          <p class="section-note">${count ? `Se usa en ${usageText(count)}.` : 'No tiene gastos.'}</p>
          <button type="button" class="destructive-button" id="delete-category">Eliminar categoría</button>` : ''}
      </div>
    </form>`, 'category-title');

  const nameInput = $('#category-name', sheet);
  const errorBox = $('#category-error', sheet);
  const saveButton = $('#save-category', sheet);
  const otherNames = () => state.data.categories.filter((c) => c.id !== category?.id).map((c) => c.name);

  const validate = () => {
    const message = validateCategoryName(nameInput.value, otherNames());
    errorBox.textContent = nameInput.value.trim() ? (message ?? '') : '';
    saveButton.disabled = Boolean(message);
    return message;
  };

  nameInput.addEventListener('input', validate);
  $('.icon-grid', sheet).addEventListener('click', (event) => {
    const choice = event.target.closest('[data-icon]');
    if (!choice) return;
    icon = choice.dataset.icon;
    sheet.querySelectorAll('[data-icon]').forEach((el) => el.setAttribute('aria-checked', String(el.dataset.icon === icon)));
  });

  $('#category-form', sheet).addEventListener('submit', (event) => {
    event.preventDefault();
    if (validate()) return;
    const name = nameInput.value.trim();
    if (category) {
      persist(cloud.saveCategory(uid(), { ...category, name, icon }));
      const affected = myFamilyExpenses().filter((expense) => expense.categoryId === category.id);
      if (affected.length && householdId()) persist(cloud.refreshFamilyCategory(owner(), affected, { name, icon }));
    } else {
      const order = Math.max(-1, ...state.data.categories.map((c) => c.order)) + 1;
      persist(cloud.saveCategory(uid(), { id: cloud.newId('users', uid(), 'categories'), name, icon, order }));
    }
    closeSheet();
    toast(category ? 'Categoría actualizada' : 'Categoría creada');
  });

  $('#delete-category', sheet)?.addEventListener('click', async () => {
    if (!canDeleteCategory(count)) {
      await alertDialog('No se puede eliminar', `“${category.name}” se usa en ${usageText(count)}. Se conserva para no alterar tu historial, pero puedes cambiarle el nombre.`);
      return;
    }
    const proceed = await confirmDialog({ title: `¿Eliminar “${category.name}”?`, confirmLabel: 'Eliminar', destructive: true });
    if (proceed) {
      persist(cloud.deleteCategory(uid(), category.id));
      closeSheet();
      toast('Categoría eliminada');
    }
  });

  validate();
  if (!category) nameInput.focus();
}

// ---------- Nombre ----------

function openNameEditor() {
  const sheet = openSheet(`
    <form id="name-form" novalidate>
      <div class="sheet-header">
        <button type="button" class="link" data-close>Cancelar</button>
        <h2 id="name-title">Tu nombre</h2>
        <button type="submit" class="link strong">Guardar</button>
      </div>
      <div class="sheet-body">
        <div class="group fields">
          <label class="field"><span>Nombre</span><input id="profile-name" maxlength="30" autocomplete="given-name" value="${escapeHTML(myName())}"></label>
        </div>
        <p class="section-note">Así te verán en tu hogar (lista de compras y miembros).</p>
      </div>
    </form>`, 'name-title');
  const input = $('#profile-name', sheet);
  $('#name-form', sheet).addEventListener('submit', (event) => {
    event.preventDefault();
    const name = input.value.trim().slice(0, 30);
    if (!name) return;
    persist(cloud.updateProfile(uid(), { name }));
    if (householdId()) persist(cloud.renameInHousehold(uid(), householdId(), name));
    closeSheet();
    toast('Nombre actualizado');
  });
  input.focus();
}

// ---------- Exportar e importar ----------

async function shareFile(filename, mimeType, text) {
  const blob = new Blob([text], { type: mimeType });
  const file = new File([blob], filename, { type: mimeType });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function exportCSV(expenses) {
  const rows = sortExpenses(expenses).map((expense) => ({
    date: expense.date,
    category: categoryById(expense.categoryId)?.name ?? 'Sin categoría',
    note: expense.note,
    scope: expense.scope,
    amount: expense.amount,
  }));
  // La marca BOM hace que Excel lea bien las tildes.
  return shareFile(`mis-gastos-${today()}.csv`, 'text/csv', `﻿${toCSV(rows)}`);
}

function exportBackup() {
  const backup = JSON.stringify(makeBackup(state.data), null, 2);
  return shareFile(`mis-gastos-copia-${today()}.json`, 'application/json', backup);
}

async function importBackup(file) {
  let data;
  try {
    data = parseData(JSON.parse(await file.text()));
  } catch (error) {
    await alertDialog('No se pudo importar', error instanceof SyntaxError ? 'El archivo no es una copia de Mis Gastos.' : error.message);
    return;
  }
  const proceed = await confirmDialog({
    title: '¿Reemplazar tus datos?',
    message: `Se borrarán tus datos actuales (${usageText(state.data.expenses.length)}) y se usarán los de la copia (${usageText(data.expenses.length)}, ${data.categories.length === 1 ? '1 categoría' : `${data.categories.length} categorías`}).`,
    confirmLabel: 'Reemplazar',
    destructive: true,
  });
  if (!proceed) return;
  toast('Importando…');
  try {
    // Sin hogar no hay dónde guardar los familiares: entran como personales.
    const next = householdId() ? data : { ...data, expenses: data.expenses.map((e) => ({ ...e, scope: SCOPES.personal })) };
    await cloud.replaceAllData(owner(), state.data, next);
    toast('Copia importada');
  } catch (error) {
    console.error(error);
    await alertDialog('No se pudo importar', 'Revisa tu conexión a Internet e inténtalo de nuevo.');
  }
}

// ---------- Hogar ----------

async function shareInvite() {
  if (!householdId()) return;
  const url = inviteLink(location.origin, location.pathname, householdId());
  const text = `${myName()} te invita a su hogar en Mis Gastos. Abre el enlace en Safari e inicia sesión:`;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Mis Gastos', text, url });
      return;
    }
  } catch (error) {
    if (error?.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Enlace copiado');
  } catch {
    await alertDialog('Enlace de invitación', url);
  }
}

/** Comparte la dirección de la app (sin invitación: quien la abra tendrá su propio hogar). */
async function recommendApp() {
  const url = `${location.origin}${location.pathname}`;
  const text = 'Te recomiendo Mis Gastos para registrar tus gastos en pesos. Ábrela en el navegador e inicia sesión con Google:';
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Mis Gastos', text, url });
      return;
    }
  } catch (error) {
    if (error?.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Enlace copiado');
  } catch {
    await alertDialog('Enlace de la app', url);
  }
}

let householdBusy = false;

/** Se une al hogar de la invitación guardada o, si no hay, crea un hogar propio. */
async function settleHousehold() {
  if (householdBusy || !state.profile) return;
  const invite = readPreference('invitacion');
  const current = state.profile.householdId;
  if (current && (!invite || invite === current)) {
    if (invite) writePreference('invitacion', '');
    return;
  }

  householdBusy = true;
  try {
    if (invite) {
      const target = await cloud.readHousehold(invite).catch(() => null);
      writePreference('invitacion', '');
      if (!target) {
        await alertDialog('Invitación no válida', 'El enlace no corresponde a ningún hogar. Pide a quien te invitó que lo envíe de nuevo.');
      } else {
        const names = Object.values(target.names ?? {}).join(', ') || 'otra persona';
        const alone = !state.household || state.household.members.length <= 1;
        const proceed = await confirmDialog({
          title: `¿Unirte al hogar de ${names}?`,
          message: alone
            ? 'Verán los gastos que marques como Familia. Tus gastos personales siguen siendo solo tuyos.'
            : 'Saldrás de tu hogar actual y tus gastos familiares pasarán a ser personales.',
          confirmLabel: 'Unirme',
        });
        if (proceed) {
          if (current) await cloud.leaveHousehold({ ...owner(), householdId: current }, myFamilyExpenses());
          await cloud.joinHousehold(uid(), myName(), invite);
          toast('Te uniste al hogar');
          return;
        }
      }
    }
    if (!state.profile.householdId) await cloud.createHousehold(uid(), myName());
  } catch (error) {
    console.error(error);
    toast('No se pudo configurar el hogar. Revisa tu conexión.');
  } finally {
    householdBusy = false;
  }
}

async function leaveHousehold() {
  const proceed = await confirmDialog({
    title: '¿Salir del hogar?',
    message: 'Tus gastos familiares pasarán a ser personales y dejarás de ver los del hogar y la lista compartida. Tus gastos no se borran.',
    confirmLabel: 'Salir',
    destructive: true,
  });
  if (!proceed) return;
  try {
    await cloud.leaveHousehold(owner(), myFamilyExpenses());
    toast('Saliste del hogar');
  } catch (error) {
    console.error(error);
    toast('No se pudo salir del hogar. Revisa tu conexión.');
  }
}

// ---------- Sincronización ----------

let seeding = false;

function maybeSeedCategories() {
  if (seeding || !state.profile || !state.synced.categories) return;
  if (state.data.categories.length) {
    if (!state.profile.seeded) persist(cloud.updateProfile(uid(), { seeded: true }));
    return;
  }
  if (state.profile.seeded) return;
  seeding = true;
  const { categories } = createInitialData(() => cloud.newId('users', uid(), 'categories'));
  cloud.seedCategories(uid(), categories).catch(() => {}).finally(() => { seeding = false; });
}

function updateAppBadge() {
  if (!('setAppBadge' in navigator)) return;
  const count = pendingItems(state.shopping).length;
  (count ? navigator.setAppBadge(count) : navigator.clearAppBadge()).catch(() => {});
}

let personalWatchers = [];
let householdWatchers = [];
let watchedHousehold = null;

const stop = (list) => list.splice(0).forEach((unsubscribe) => unsubscribe());

function onWatchError(error) {
  console.error(error);
  if (error?.code === 'permission-denied') return;
  toast('Sin conexión con la nube. Los cambios se enviarán al volver.');
}

function dataChanged() {
  mergeMyExpenses();
  if (state.phase === 'app') render();
}

function watchHousehold(hid) {
  if (hid === watchedHousehold) return;
  stop(householdWatchers);
  watchedHousehold = hid;
  state.household = null;
  state.family = [];
  state.shopping = [];
  mergeMyExpenses();
  if (!hid) return;

  // La lista y los gastos familiares solo se piden cuando el servidor confirma que esta persona
  // es miembro del hogar; antes, las reglas los rechazarían y la escucha se cerraría.
  let sharedStarted = false;
  const startShared = () => {
    sharedStarted = true;
    householdWatchers.push(
      cloud.watchCollection(['households', hid, 'expenses'], (items) => {
        state.family = items;
        dataChanged();
      }, onWatchError),
      cloud.watchCollection(['households', hid, 'shopping'], (items) => {
        state.shopping = items;
        updateAppBadge();
        if (state.phase === 'app') render();
      }, onWatchError),
    );
  };

  householdWatchers.push(cloud.watchHousehold(hid, (household, meta) => {
    state.household = household;
    const member = household?.members.includes(uid());
    if (member && !sharedStarted && !meta.hasPendingWrites) startShared();
    dataChanged();
  }, onWatchError));
}

function handleUser(user) {
  stop(personalWatchers);
  watchHousehold(null);
  closeSheet();
  Object.assign(state, emptyState());
  state.user = user;

  if (!user) {
    state.phase = 'signin';
    render();
    const testUser = new URLSearchParams(location.search).get('usuaria');
    if (cloud.usingEmulators && testUser) cloud.signInForTesting(testUser).catch(console.error);
    return;
  }

  render();
  const id = user.uid;
  personalWatchers.push(
    cloud.watchProfile(id, (profile, meta) => {
      if (!profile) {
        // Sin perfil en la nube: es la primera vez. Se espera a la respuesta del servidor
        // para no sobrescribir un perfil que exista pero no esté en este dispositivo.
        if (!meta.fromCache) persist(cloud.createProfile(id, { name: firstName(user.displayName), email: user.email ?? '' }));
        return;
      }
      state.profile = profile;
      watchHousehold(profile.householdId);
      if (!meta.fromCache) settleHousehold();
      maybeSeedCategories();
      if (state.phase !== 'app') {
        state.phase = 'app';
        state.tab = 'inicio';
      }
      dataChanged();
    }, onWatchError),
    cloud.watchCollection(['users', id, 'categories'], (items, meta) => {
      state.data.categories = items;
      state.loaded.categories = true;
      if (!meta.fromCache) state.synced.categories = true;
      maybeSeedCategories();
      dataChanged();
    }, onWatchError),
    cloud.watchCollection(['users', id, 'expenses'], (items, meta) => {
      state.personal = items;
      state.loaded.expenses = true;
      if (!meta.fromCache) state.synced.expenses = true;
      dataChanged();
    }, onWatchError),
  );
}

// ---------- Acciones ----------

function shiftMonth(scope, delta) {
  const key = scope === 'family' ? 'familyMonth' : 'month';
  const next = delta === 0 ? monthKeyOf(today()) : addMonths(state[key], delta);
  if (next <= monthKeyOf(today())) state[key] = next;
  render();
}

const ACTIONS = {
  'sign-in': () => {
    state.authError = '';
    cloud.signInWithGoogle().catch((error) => {
      console.error(error);
      state.authError = 'No se pudo iniciar sesión. Revisa tu conexión e inténtalo de nuevo.';
      render();
    });
  },
  'sign-out': async () => {
    if (await confirmDialog({ title: '¿Cerrar sesión?', message: 'Tus datos siguen guardados en tu cuenta.', confirmLabel: 'Cerrar sesión' })) {
      cloud.signOutUser();
    }
  },
  'go-tab': (el) => setTab(el.dataset.tab),
  'month-prev': (el) => shiftMonth(el.dataset.scope, -1),
  'month-next': (el) => shiftMonth(el.dataset.scope, 1),
  'month-current': (el) => shiftMonth(el.dataset.scope, 0),
  'add-expense': () => openExpenseForm(),
  'edit-expense': (el) => {
    const expense = state.data.expenses.find((item) => item.id === el.dataset.id);
    if (expense) openExpenseForm(expense);
  },
  'open-filters': () => openFilters(),
  'clear-filters': () => clearFilters(),
  'export-csv': () => exportCSV(state.data.expenses.filter((expense) => matchesFilter(expense, state.filter))),
  'export-all-csv': () => exportCSV(state.data.expenses),
  'add-category': () => openCategoryEditor(),
  'edit-category': (el) => {
    const category = categoryById(el.dataset.id);
    if (category) openCategoryEditor(category);
  },
  'export-backup': () => exportBackup(),
  'import-backup': () => $('#backup-file')?.click(),
  'edit-name': () => openNameEditor(),
  invite: () => shareInvite(),
  'recommend-app': () => recommendApp(),
  'leave-household': () => leaveHousehold(),
  'toggle-item': (el) => {
    const item = state.shopping.find((entry) => entry.id === el.dataset.id);
    if (item && householdId()) persist(cloud.setShoppingDone(householdId(), item.id, !item.done, uid()));
  },
  'delete-item': (el) => {
    if (householdId()) persist(cloud.deleteShoppingItem(householdId(), el.dataset.id));
  },
  'clear-done': async () => {
    const done = doneItems(state.shopping);
    if (!done.length || !householdId()) return;
    if (await confirmDialog({ title: `¿Borrar ${done.length === 1 ? '1 cosa comprada' : `${done.length} cosas compradas`}?`, confirmLabel: 'Borrar', destructive: true })) {
      persist(cloud.deleteShoppingItems(householdId(), done.map((item) => item.id)));
    }
  },
  'enable-badge': async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        updateAppBadge();
        toast('Listo: verás los pendientes en el icono');
      }
    } catch {
      // El navegador no lo permite.
    }
    render();
  },
};

function addShoppingItem(form) {
  const input = $('#new-item', form);
  const text = cleanShoppingText(input.value);
  if (!text || !householdId()) return;
  persist(cloud.addShoppingItem(householdId(), uid(), myName(), text));
  input.value = '';
  input.focus();
}

// ---------- Inicio ----------

function registerServiceWorker() {
  const isLocal = cloud.usingEmulators;
  if ('serviceWorker' in navigator && (!isLocal || new URLSearchParams(location.search).has('sw'))) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

function start() {
  const view = $('#view');
  view.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (target && !target.disabled) ACTIONS[target.dataset.action]?.(target);
  });
  view.addEventListener('submit', (event) => {
    if (event.target.dataset.form !== 'add-item') return;
    event.preventDefault();
    addShoppingItem(event.target);
  });
  view.addEventListener('change', (event) => {
    if (event.target.id !== 'backup-file') return;
    const [file] = event.target.files;
    event.target.value = '';
    if (file) importBackup(file);
  });
  document.querySelector('.tabbar').addEventListener('click', (event) => {
    const tab = event.target.closest('[data-tab]');
    if (tab) setTab(tab.dataset.tab);
  });
  // Al volver a la app (por ejemplo, otro día) se recalculan "Hoy" y el mes.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !$('#sheet-root').childElementCount) render();
  });

  // Enlace de invitación: se guarda para usarlo después de iniciar sesión.
  const invite = householdIdFromSearch(location.search);
  if (invite) writePreference('invitacion', invite);
  const params = new URLSearchParams(location.search);
  if (params.has('hogar')) {
    params.delete('hogar');
    history.replaceState(null, '', location.pathname + (params.size ? `?${params}` : ''));
  }

  if (!cloud.startCloud()) {
    state.phase = 'setup';
    render();
    return;
  }
  render();
  cloud.finishRedirect().catch((error) => {
    console.error(error);
    state.authError = 'No se pudo iniciar sesión. Inténtalo de nuevo.';
    render();
  });
  cloud.onUserChanged(handleUser);
  registerServiceWorker();
}

start();
