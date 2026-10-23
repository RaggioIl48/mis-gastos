import {
  addMonths, canDeleteCategory, CATEGORY_ICONS, createInitialData, dateKey, dayTitle, firstDayOfMonth,
  formatCOP, groupByDay, isFilterActive, isLikelyDuplicate, isValidDayKey, makeBackup, matchesFilter,
  monthKeyOf, monthTitle, parseData, parseErrorMessage, parseThousands, shortDate, sortExpenses,
  thousandsInput, toCSV, total, dayTotal, usageText, validateCategoryName,
} from './logic.js';
import { loadData, readPreference, requestPersistence, saveData, writePreference } from './store.js';

// ---------- Utilidades ----------

const $ = (selector, root = document) => root.querySelector(selector);

const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);

const makeId = () => (crypto.randomUUID
  ? crypto.randomUUID()
  : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

const ICONS = {
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
  right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
  chevron: '<svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
  filter: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>',
};

// ---------- Estado ----------

const today = () => dateKey();

const state = {
  data: { categories: [], expenses: [] },
  tab: 'inicio',
  month: monthKeyOf(today()),
  filter: { categoryId: null, byDate: false, from: firstDayOfMonth(today()), to: today() },
};

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

/** Aplica un cambio, lo guarda y vuelve a dibujar. Si no se puede guardar, lo deshace. */
function commit(mutate) {
  const previous = structuredClone(state.data);
  mutate(state.data);
  if (!saveData(state.data)) {
    state.data = previous;
    toast('No se pudo guardar. Revisa el espacio del dispositivo.');
    return false;
  }
  requestPersistence();
  render();
  return true;
}

// ---------- Componentes ----------

function expenseRow(expense, { showDate }) {
  const category = categoryById(expense.categoryId);
  const categoryName = category?.name ?? 'Sin categoría';
  const title = expense.note || categoryName;
  const subtitle = [expense.note ? categoryName : null, showDate ? shortDate(expense.date) : null]
    .filter(Boolean)
    .join(' · ');
  return `
    <li>
      <button class="row-button" type="button" data-action="edit-expense" data-id="${escapeHTML(expense.id)}">
        <span class="row-icon" aria-hidden="true">${escapeHTML(category?.icon ?? '❔')}</span>
        <span class="row-texts">
          <span class="row-title">${escapeHTML(title)}</span>
          ${subtitle ? `<span class="row-subtitle">${escapeHTML(subtitle)}</span>` : ''}
        </span>
        <span class="row-amount">${formatCOP(expense.amount)}</span>
      </button>
    </li>`;
}

function emptyState(title, message) {
  return `<div class="empty"><strong>${escapeHTML(title)}</strong><p>${escapeHTML(message)}</p></div>`;
}

// ---------- Pantallas ----------

function homeView() {
  const now = today();
  const currentMonth = monthKeyOf(now);
  const isCurrent = state.month === currentMonth;
  const expenses = sortExpenses(state.data.expenses);
  const monthItems = expenses.filter((expense) => monthKeyOf(expense.date) === state.month);

  return `
    <header class="title-bar"><h1>Mis Gastos</h1></header>
    <section class="card summary" aria-label="Resumen">
      <div class="month-nav">
        <button class="icon-button" type="button" data-action="month-prev" aria-label="Mes anterior">${ICONS.left}</button>
        <button class="month-title" type="button" data-action="month-current" ${isCurrent ? 'aria-disabled="true"' : 'aria-label="Volver al mes actual"'}>${escapeHTML(monthTitle(state.month))}</button>
        <button class="icon-button" type="button" data-action="month-next" aria-label="Mes siguiente" ${isCurrent ? 'disabled' : ''}>${ICONS.right}</button>
      </div>
      <p class="summary-label">Total del mes</p>
      <p class="summary-total">${formatCOP(total(monthItems))}</p>
      <div class="summary-row"><span>Hoy</span><strong>${formatCOP(dayTotal(expenses, now))}</strong></div>
      <div class="summary-row"><span>Movimientos del mes</span><strong>${monthItems.length}</strong></div>
    </section>
    <h2 class="section-title">${isCurrent ? 'Últimos movimientos' : 'Movimientos del mes'}</h2>
    ${monthItems.length
      ? `<ul class="list">${monthItems.map((e) => expenseRow(e, { showDate: true })).join('')}</ul>`
      : emptyState('Sin gastos', isCurrent ? 'Aún no has registrado gastos este mes.' : 'No hay gastos registrados en este mes.')}
    <div class="add-bar">
      <button class="add-button" type="button" data-action="add-expense">${ICONS.plus}<span>Añadir gasto</span></button>
    </div>`;
}

function filterDescription(filter) {
  const parts = [];
  if (filter.categoryId) parts.push(categoryById(filter.categoryId)?.name ?? 'Categoría');
  if (filter.byDate) {
    const [from, to] = [filter.from, filter.to].sort();
    parts.push(from === to ? shortDate(from) : `${shortDate(from)} – ${shortDate(to)}`);
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
      ? emptyState('Sin resultados', 'Ningún gasto coincide con los filtros.')
      : emptyState('Sin gastos', 'Los gastos que registres aparecerán aquí.');
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
        <div class="summary-row" style="border-top:0"><span>${active ? 'Total filtrado' : 'Total registrado'}</span><strong>${formatCOP(total(items))}</strong></div>
        <div class="summary-row"><span>Gastos</span><strong>${items.length}</strong></div>
      </section>` : ''}
    ${groups}${empty}`;
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
    <header class="title-bar">
      <h1>Categorías</h1>
      <div class="title-actions">
        <button class="icon-button" type="button" data-action="add-category" aria-label="Nueva categoría">${ICONS.plus}</button>
      </div>
    </header>
    ${categories.length
      ? `<ul class="list">${rows}</ul>
         <p class="section-note">Toca una categoría para cambiar su nombre o icono. Solo se pueden eliminar las que no tienen gastos; las demás se conservan en el historial.</p>`
      : emptyState('Sin categorías', 'Crea una categoría para empezar a registrar gastos.')}`;
}

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
}

function settingsView() {
  const count = state.data.expenses.length;
  return `
    <header class="title-bar"><h1>Ajustes</h1></header>
    ${isStandalone() ? '' : `
      <h2 class="section-title">Instalar en el iPhone</h2>
      <div class="card">
        <p class="settings-text">En Safari toca <strong>Compartir</strong> y luego <strong>Añadir a pantalla de inicio</strong>. Úsala siempre desde ese icono: así funciona sin Internet y el iPhone conserva tus datos.</p>
      </div>`}

    <h2 class="section-title">Copia de seguridad</h2>
    <ul class="list">
      <li><button class="row-button" type="button" data-action="export-backup"><span class="row-texts"><span class="row-title">Exportar copia</span><span class="row-subtitle">Guarda un archivo con todos tus gastos y categorías</span></span>${ICONS.chevron}</button></li>
      <li><button class="row-button" type="button" data-action="import-backup"><span class="row-texts"><span class="row-title">Importar copia</span><span class="row-subtitle">Reemplaza los datos actuales por los de un archivo</span></span>${ICONS.chevron}</button></li>
      <li><button class="row-button" type="button" data-action="export-all-csv" ${count ? '' : 'disabled'}><span class="row-texts"><span class="row-title">Exportar todo a CSV</span><span class="row-subtitle">Para abrir en Excel o Numbers</span></span>${ICONS.chevron}</button></li>
    </ul>
    <input id="backup-file" class="visually-hidden" type="file" accept=".json,application/json" tabindex="-1" aria-hidden="true">
    <p class="section-note">Tus datos se guardan solo en este dispositivo; no se envían a ningún servidor. Si borras los datos de Safari o eliminas la app de la pantalla de inicio, se pierden. Exporta una copia de vez en cuando.</p>

    <h2 class="section-title">Datos</h2>
    <div class="card">
      <div class="summary" style="padding-top:0;padding-bottom:0">
        <div class="summary-row" style="border-top:0"><span>Gastos registrados</span><strong>${count}</strong></div>
        <div class="summary-row"><span>Total registrado</span><strong>${formatCOP(total(state.data.expenses))}</strong></div>
        <div class="summary-row"><span>Categorías</span><strong>${state.data.categories.length}</strong></div>
      </div>
    </div>`;
}

const VIEWS = { inicio: homeView, historial: historyView, categorias: categoriesView, ajustes: settingsView };

function render() {
  const view = $('#view');
  view.innerHTML = VIEWS[state.tab]();
  view.classList.toggle('with-add-bar', state.tab === 'inicio');
  document.querySelectorAll('.tab').forEach((tab) => {
    if (tab.dataset.tab === state.tab) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
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
    alertDialog('No hay categorías', 'Crea una categoría en la pestaña Categorías antes de registrar gastos.');
    return;
  }

  const lastCategory = readPreference('ultimaCategoria');
  let selectedCategory = expense
    ? expense.categoryId
    : (categories.find((c) => c.id === lastCategory) ?? categories[0]).id;

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
    const fields = { amount: result.pesos, categoryId: selectedCategory, date, note };

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
      if (commit((data) => data.expenses.push({ id: makeId(), ...candidate }))) {
        writePreference('ultimaCategoria', selectedCategory);
        closeSheet();
        toast(`Gasto de ${formatCOP(result.pesos)} guardado`);
        return;
      }
    } else if (commit((data) => {
      const target = data.expenses.find((item) => item.id === expense.id);
      if (target) Object.assign(target, fields);
    })) {
      closeSheet();
      toast('Cambios guardados');
      return;
    }
    saving = false;
    update();
  });

  $('#delete-expense', sheet)?.addEventListener('click', async () => {
    const proceed = await confirmDialog({
      title: '¿Eliminar este gasto?',
      message: `${formatCOP(expense.amount)} · Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      destructive: true,
    });
    if (proceed && commit((data) => { data.expenses = data.expenses.filter((item) => item.id !== expense.id); })) {
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
    const saved = commit((data) => {
      if (category) {
        Object.assign(data.categories.find((c) => c.id === category.id), { name, icon });
      } else {
        const nextOrder = Math.max(-1, ...data.categories.map((c) => c.order)) + 1;
        data.categories.push({ id: makeId(), name, icon, order: nextOrder });
      }
    });
    if (saved) {
      closeSheet();
      toast(category ? 'Categoría actualizada' : 'Categoría creada');
    }
  });

  $('#delete-category', sheet)?.addEventListener('click', async () => {
    if (!canDeleteCategory(count)) {
      await alertDialog('No se puede eliminar', `“${category.name}” se usa en ${usageText(count)}. Se conserva para no alterar tu historial, pero puedes cambiarle el nombre.`);
      return;
    }
    const proceed = await confirmDialog({
      title: `¿Eliminar “${category.name}”?`,
      confirmLabel: 'Eliminar',
      destructive: true,
    });
    if (proceed && commit((data) => { data.categories = data.categories.filter((c) => c.id !== category.id); })) {
      closeSheet();
      toast('Categoría eliminada');
    }
  });

  validate();
  if (!category) nameInput.focus();
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
  if (proceed && commit((current) => {
    current.categories = data.categories;
    current.expenses = data.expenses;
  })) {
    toast('Copia importada');
  }
}

// ---------- Acciones ----------

const ACTIONS = {
  'month-prev': () => { state.month = addMonths(state.month, -1); render(); },
  'month-next': () => {
    const next = addMonths(state.month, 1);
    if (next <= monthKeyOf(today())) { state.month = next; render(); }
  },
  'month-current': () => { state.month = monthKeyOf(today()); render(); },
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
};

// ---------- Inicio ----------

function start() {
  const loaded = loadData();
  if (loaded.status === 'ok') {
    state.data = loaded.data;
  } else {
    state.data = createInitialData(makeId);
    if (loaded.status !== 'unavailable') saveData(state.data);
  }

  const view = $('#view');
  view.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (target && !target.disabled) ACTIONS[target.dataset.action]?.(target);
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

  render();

  if (loaded.status === 'corrupt') {
    alertDialog('Datos dañados', 'No se pudieron leer los datos guardados. Se apartó una copia y se empezó de nuevo. Puedes importar una copia de seguridad desde Ajustes.');
  } else if (loaded.status === 'unavailable') {
    alertDialog('Sin almacenamiento', 'Este navegador no permite guardar datos (¿modo privado?). Los gastos se perderán al cerrar.');
  }

  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  if ('serviceWorker' in navigator && (!isLocal || new URLSearchParams(location.search).has('sw'))) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

start();
