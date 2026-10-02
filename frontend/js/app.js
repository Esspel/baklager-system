/* Frontend JavaScript for Baklager-system */
let burar = [];
let employees = [];
let editingMode = false;
let selectedBurId = null;
let currentEmployee = null;
const API = '/api';

// Simple wrapper for fetch with error handling
async function api(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(endpoint, { ...options, headers });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    let err;
    try { err = await res.json(); } catch { err = { message: errText }; }
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

// Render wheelbarrows on the map
function renderBurar() {
  const karta = document.getElementById('karta');
  karta.innerHTML = '';

  if (burar.length === 0) {
    karta.innerHTML = '<div class="empty-state">Inga rullburar ännu. Klicka "Lägg till" för att skapa din första.</div>';
    return;
  }

  burar.forEach(bur => {
    const div = document.createElement('div');
    div.className = 'bur';
    div.dataset.id = bur.id;
    div.style.left = bur.x + 'px';
    div.style.top = bur.y + 'px';

    // Status färg baserat på senaste checkin
    let statusColor = 'gron';
    if (bur.checked_at) {
      const hours = (Date.now() - new Date(bur.checked_at).getTime()) / 3600000;
      if (hours < 24) {
        statusColor = 'gron';
      } else if (hours < 72) {
        statusColor = 'gul';
      } else {
        statusColor = 'rod';
      }
    }
    div.dataset.status = statusColor;

    // Bur namn
    const nameSpan = document.createElement('span');
    nameSpan.className = 'bur-name';
    nameSpan.textContent = bur.name;
    div.appendChild(nameSpan);

    // Status indikator
    const statusDot = document.createElement('span');
    statusDot.className = 'status-dot';
    statusDot.dataset.status = statusColor;
    div.appendChild(statusDot);

    // Klick för checkin (i normalt läge)
    if (!editingMode) {
      const checkinHint = document.createElement('span');
      checkinHint.className = 'checkin-hint';
      checkinHint.textContent = 'Klicka för koll';
      div.appendChild(checkinHint);
    }

    // Klick-hantering
    div.addEventListener('click', (e) => {
      if (editingMode) {
        e.stopPropagation();
        selectBur(div.dataset.id);
      } else {
        checkinBur(div.dataset.id);
      }
    });

    // Hover info
    div.addEventListener('mouseenter', () => showBurTooltip(bur, div));
    div.addEventListener('mouseleave', hideBurTooltip);

    karta.appendChild(div);
  });
}

// Tooltip för bur
function showBurTooltip(bur, element) {
  hideBurTooltip();
  const tooltip = document.createElement('div');
  tooltip.id = 'bur-tooltip';
  tooltip.className = 'bur-tooltip';

  const title = document.createElement('strong');
  title.textContent = bur.name;
  tooltip.appendChild(title);

  const br1 = document.createElement('br');
  tooltip.appendChild(br1);

  let lastCheckText = 'Aldrig kollad';
  if (bur.checked_at) {
    const date = new Date(bur.checked_at);
    lastCheckText = 'Senast kollad: ' + date.toLocaleString('sv-SE');
  }
  const lastCheck = document.createTextNode(lastCheckText);
  tooltip.appendChild(lastCheck);

  if (bur.checked_by_name) {
    const br2 = document.createElement('br');
    tooltip.appendChild(br2);
    const checkedBy = document.createTextNode('Av: ' + bur.checked_by_name);
    tooltip.appendChild(checkedBy);
  }

  document.body.appendChild(tooltip);

  const rect = element.getBoundingClientRect();
  tooltip.style.left = rect.left + rect.width / 2 + 'px';
  tooltip.style.top = rect.top - tooltip.offsetHeight - 8 + 'px';
}

function hideBurTooltip() {
  const existing = document.getElementById('bur-tooltip');
  if (existing) existing.remove();
}

// Select bur for editing
async function selectBur(id) {
  if (id === selectedBurId) {
    selectedBurId = null;
    document.querySelectorAll('.bur').forEach(b => b.classList.remove('selected'));
    document.getElementById('burModal').style.display = 'none';
    return;
  }

  selectedBurId = id;
  document.querySelectorAll('.bur').forEach(b => b.classList.toggle('selected', b.dataset.id === id));

  const bur = burar.find(b => b.id == id);
  if (!bur) return;

  document.getElementById('burNamn').value = bur.name || '';
  document.getElementById('burX').value = bur.x || 10;
  document.getElementById('burY').value = bur.y || 10;

  const color = bur.color_status || 'gron';
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === color);
  });

  document.getElementById('modalTitle').textContent = 'Redigera "' + (bur.name || '') + '"';
  document.getElementById('burModal').style.display = 'flex';
}

// Update bur position
async function updateBurPosition(id, newX, newY) {
  try {
    await api('/api/burar/' + id, { method: 'PUT', body: JSON.stringify({ x: newX, y: newY }) });
    await loadBurar();
  } catch (e) {
    console.error('Position update failed:', e.message);
  }
}

// Create new bur
async function createBur() {
  const name = document.getElementById('burNamn').value.trim();
  if (!name) return alert('Ange namn');
  const x = parseInt(document.getElementById('burX').value) || 10;
  const y = parseInt(document.getElementById('burY').value) || 10;
  const colorBtn = document.querySelector('.color-btn.active');
  const color = colorBtn ? colorBtn.dataset.color : 'gron';

  try {
    await api('/api/burar', { method: 'POST', body: JSON.stringify({ name, x, y, color_status: color }) });
    await loadBurar();
    document.getElementById('burModal').style.display = 'none';
    selectedBurId = null;
  } catch (e) {
    alert('Fel: ' + e.message);
  }
}

// Update bur
async function updateBur() {
  if (!selectedBurId) return;
  const name = document.getElementById('burNamn').value.trim();
  const x = parseInt(document.getElementById('burX').value) || 10;
  const y = parseInt(document.getElementById('burY').value) || 10;
  const colorBtn = document.querySelector('.color-btn.active');
  const color = colorBtn ? colorBtn.dataset.color : 'gron';
  try {
    await api('/api/burar/' + selectedBurId, { method: 'PUT', body: JSON.stringify({ name, x, y, color_status: color }) });
    await loadBurar();
    document.getElementById('burModal').style.display = 'none';
  } catch (e) {
    alert('Fel: ' + e.message);
  }
}

// Check-in a bur
async function checkinBur(burId) {
  try {
    const result = await api('/api/checkin', { method: 'POST', body: JSON.stringify({ bur_id: burId }) });
    await loadBurar();
    updateStats();
  } catch (e) {
    alert('Kunde inte registrera koll: ' + e.message);
  }
}

// Delete bur
async function deleteBur(id) {
  if (!confirm('Ta bort denna rullbur?')) return;
  try {
    await api('/api/burar/' + id, { method: 'DELETE' });
    await loadBurar();
    selectedBurId = null;
    document.getElementById('burModal').style.display = 'none';
  } catch (e) {
    alert('Fel: ' + e.message);
  }
}

// Update statistics
function updateStats() {
  document.getElementById('totalBurar').textContent = burar.length;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const kolladeIdag = burar.filter(b => {
    if (!b.checked_at) return false;
    return new Date(b.checked_at) >= today;
  }).length;
  document.getElementById('kolladeIdag').textContent = kolladeIdag;

  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const nyligen = burar.filter(b => {
    if (!b.checked_at) return false;
    return new Date(b.checked_at) >= threeDaysAgo;
  }).length;
  document.getElementById('nyligenKollade').textContent = nyligen;
}

// Load all burar
async function loadBurar() {
  try {
    burar = await api('/api/burar');
    renderBurar();
    updateStats();
  } catch (e) {
    console.error('Failed to load burar:', e);
    document.getElementById('karta').innerHTML = '<p class="empty-state">Kunde inte ladda rullburar...</p>';
  }
}

// --- EMPLOYEE MANAGEMENT ---
async function loadEmployees() {
  try {
    employees = await api('/api/employees');
    renderEmployeeList();
    updateLoginSelect();
  } catch (e) {
    console.error('Failed to load employees:', e);
  }
}

function renderEmployeeList() {
  const container = document.getElementById('employeeList');
  if (!container) return;

  container.innerHTML = '';

  if (employees.length === 0) {
    container.innerHTML = '<div class="empty-state">Inga användare skapade ännu</div>';
    return;
  }

  employees.forEach(emp => {
    const div = document.createElement('div');
    div.className = 'employee-item';
    div.innerHTML = `
      <span class="employee-name">${emp.name}</span>
      <div class="employee-actions">
        <button class="btn btn-sm btn-edit" data-id="${emp.id}" title="Redigera">✏️</button>
        <button class="btn btn-sm btn-delete" data-id="${emp.id}" title="Ta bort">🗑️</button>
      </div>
    `;
    container.appendChild(div);
  });

  // Event listeners for edit/delete
  container.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => openEmployeeModal(btn.dataset.id));
  });
  container.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteEmployee(btn.dataset.id));
  });
}

function updateLoginSelect() {
  const select = document.getElementById('loginEmployee');
  if (!select) return;

  select.innerHTML = '<option value="">-- Välj användare --</option>';
  employees.forEach(emp => {
    const option = document.createElement('option');
    option.value = emp.id;
    option.textContent = emp.name;
    select.appendChild(option);
  });
}

// Open employee modal for create/edit
function openEmployeeModal(id = null) {
  const modal = document.getElementById('employeeModal');
  const title = document.getElementById('employeeModalTitle');
  const input = document.getElementById('employeeName');
  const saveBtn = document.getElementById('btnSaveEmployee');

  if (id) {
    const emp = employees.find(e => e.id == id);
    if (emp) {
      title.textContent = 'Redigera användare';
      input.value = emp.name;
      saveBtn.dataset.id = id;
    }
  } else {
    title.textContent = 'Ny användare';
    input.value = '';
    saveBtn.dataset.id = '';
  }

  modal.style.display = 'flex';
  input.focus();
}

async function saveEmployee() {
  const input = document.getElementById('employeeName');
  const saveBtn = document.getElementById('btnSaveEmployee');
  const name = input.value.trim();
  const id = saveBtn.dataset.id;

  if (!name) return alert('Ange namn');

  try {
    if (id) {
      await api('/api/employees/' + id, { method: 'PUT', body: JSON.stringify({ name }) });
    } else {
      await api('/api/employees', { method: 'POST', body: JSON.stringify({ name }) });
    }
    document.getElementById('employeeModal').style.display = 'none';
    await loadEmployees();
  } catch (e) {
    alert('Fel: ' + e.message);
  }
}

async function deleteEmployee(id) {
  if (!confirm('Ta bort denna användare?')) return;
  try {
    await api('/api/employees/' + id, { method: 'DELETE' });
    await loadEmployees();
  } catch (e) {
    alert('Fel: ' + e.message);
  }
}

// Login with employee ID
async function loginWithEmployee() {
  const select = document.getElementById('loginEmployee');
  const employeeId = select.value;
  if (!employeeId) return alert('Välj en användare');

  try {
    const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ employee_id: employeeId }) });
    localStorage.setItem('token', data.token);
    currentEmployee = data.employee;
    document.getElementById('userInfo').style.display = 'flex';
    document.getElementById('userName').textContent = currentEmployee.name;
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('redigeringsLägeBtn').style.display = 'inline-block';
    document.getElementById('usersBtn').style.display = 'inline-block';
    await loadBurar();
    await loadEmployees();
  } catch (e) {
    alert('Felaktig inloggning: ' + e.message);
  }
}

window.logout = function logout() {
  localStorage.removeItem('token');
  currentEmployee = null;
  document.getElementById('userInfo').style.display = 'none';
  document.getElementById('loginSection').style.display = 'flex';
  document.getElementById('redigeringsLägeBtn').style.display = 'none';
  document.getElementById('usersBtn').style.display = 'none';
  editingMode = false;
  selectedBurId = null;
  document.querySelectorAll('.bur').forEach(b => b.classList.remove('selected'));
  document.getElementById('burModal').style.display = 'none';
  loadBurar();
};

// Toggle edit mode
function toggleEditMode() {
  editingMode = !editingMode;
  document.getElementById('redigeringsLägeBtn').textContent = editingMode ? 'Avsluta redigering' : 'Redigera läge';
  if (!editingMode) {
    selectedBurId = null;
    document.getElementById('burModal').style.display = 'none';
    document.querySelectorAll('.bur').forEach(b => b.classList.remove('selected'));
  }
}

// Toggle user management modal
function toggleUsersModal() {
  const modal = document.getElementById('usersModal');
  if (modal.style.display === 'flex') {
    modal.style.display = 'none';
  } else {
    modal.style.display = 'flex';
    loadEmployees();
  }
}

// Modal handlers
document.getElementById('btnSparaBur').onclick = createBur;
document.getElementById('btnAvbryt').onclick = () => {
  document.getElementById('burModal').style.display = 'none';
  selectedBurId = null;
};

document.getElementById('btnSaveEmployee').onclick = saveEmployee;
document.getElementById('btnCancelEmployee').onclick = () => {
  document.getElementById('employeeModal').style.display = 'none';
};

// Init
function initApp() {
  document.getElementById('loginBtn').addEventListener('click', () => {
    document.getElementById('loginModal').style.display = 'flex';
    // Load employees for login select
    api('/api/employees')
      .then(data => {
        const select = document.getElementById('loginEmployee');
        select.innerHTML = '<option value="">-- Välj användare --</option>';
        data.forEach(emp => {
          const option = document.createElement('option');
          option.value = emp.id;
          option.textContent = emp.name;
          select.appendChild(option);
        });
      })
      .catch(() => {});
  });
  document.getElementById('btnLoginEmployee').addEventListener('click', loginWithEmployee);
  document.getElementById('redigeringsLägeBtn').addEventListener('click', toggleEditMode);
  document.getElementById('usersBtn').addEventListener('click', () => {
    document.getElementById('usersModal').style.display = 'flex';
    loadEmployees();
  });
  document.getElementById('btnNewEmployee').addEventListener('click', () => openEmployeeModal());
  loadBurar();
}

window.initApp = initApp;
window.createBur = createBur;
window.updateBur = updateBur;
window.deleteBur = deleteBur;
window.loadBurar = loadBurar;
window.toggleEditMode = toggleEditMode;
window.logout = logout;