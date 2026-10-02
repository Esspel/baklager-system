/* Frontend JavaScript for Baklager-system */
let burar = [];
let editingMode = false;
let selectedBurId = null;
let currentEmployee = null;
const API = '/api'; // If served from same origin; else adjust

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

  burar.forEach(bur => {
    const div = document.createElement('div');
    div.className = 'bur';
    div.dataset.id = bur.id;
    div.dataset.status = bur.color_status;
    div.style.left = bur.x + 'px';
    div.style.top = bur.y + 'px';
    div.title = bur.name;

    // Status färg
    if (bur.checked_at) {
      const hours = (Date.now() - new Date(bur.checked_at).getTime()) / 3600000;
      if (hours < 24) {
        div.dataset.status = 'gron';
      } else if (hours < 72) {
        div.dataset.status = 'gul';
      } else {
        div.dataset.status = 'röd';
      }
    }

    div.textContent = bur.name.substring(0, 8);

    div.addEventListener('click', () => {
      if (editingMode) {
        selectBur(div.dataset.id);
      } else {
        checkinBur(div.dataset.id);
      }
    });

    karta.appendChild(div);
  });
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
    await api('/burar/' + id, { method: 'PUT', body: JSON.stringify({ x: newX, y: newY }) });
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
    await api('/burar', { method: 'POST', body: JSON.stringify({ name, x, y, color_status: color }) });
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
    await api('/burar/' + selectedBurId, { method: 'PUT', body: JSON.stringify({ name, x, y, color_status: color }) });
    await loadBurar();
    document.getElementById('burModal').style.display = 'none';
  } catch (e) {
    alert('Fel: ' + e.message);
  }
}

// Check-in a bur
async function checkinBur(burId) {
  try {
    const result = await api('/checkin', { method: 'POST', body: JSON.stringify({ bur_id: burId }) });
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
    await api('/burar/' + id, { method: 'DELETE' });
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
    burar = await api('/burar');
    renderBurar();
    updateStats();
  } catch (e) {
    console.error('Failed to load burar:', e);
    document.getElementById('karta').innerHTML = '<p style="padding:20px">Kunde inte ladda...</p>';
  }
}

// RFID Login
async function loginWithRFID() {
  const tag = prompt('Skanna eller ange RFID-taggen:');
  if (!tag) return;
  try {
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ rfid_tag: tag }) });
    localStorage.setItem('token', data.token);
    currentEmployee = data.employee;
    document.getElementById('userInfo').style.display = 'flex';
    document.getElementById('userName').textContent = currentEmployee.name;
    document.getElementById('loginBtn').textContent = 'Logga ut';
    document.getElementById('redigeringsLägeBtn').style.display = 'inline-block';
    await loadBurar();
  } catch (e) {
    alert('Felaktig RFID: ' + e.message);
  }
}

window.logout = function logout() {
  localStorage.removeItem('token');
  currentEmployee = null;
  document.getElementById('userInfo').style.display = 'none';
  document.getElementById('loginBtn').textContent = 'Logga in med RFID';
  document.getElementById('redigeringsLägeBtn').style.display = 'none';
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

// Modal handlers
document.getElementById('btnSparaBur').onclick = createBur;
document.getElementById('btnAvbryt').onclick = () => {
  document.getElementById('burModal').style.display = 'none';
  selectedBurId = null;
};

// Init
function initApp() {
  document.getElementById('loginBtn').addEventListener('click', loginWithRFID);
  document.getElementById('redigeringsLägeBtn').addEventListener('click', toggleEditMode);
  loadBurar();
}

window.initApp = initApp;
window.createBur = createBur;
window.updateBur = updateBur;
window.deleteBur = deleteBur;
window.loadBurar = loadBurar;
window.toggleEditMode = toggleEditMode;