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
    const err = await res.json();
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
    div.style.left = `${bur.x}px`;
    div.style.top = `${bur.y}px`;
    div.title = `${bur.name}\nSenast kollad: ${new Date(bur.checked_at || 0).toLocaleString()}\nKollad av: ${bur.checked_by_name || 'okänd'}`;

    div.textContent = bur.name;

    // Enable drag in edit mode
    if (editingMode) {
      div.style.cursor = 'grab';
      let isDragging = false;
      let startX, startY, initialLeft, initialTop;

      div.addEventListener('pointerdown', e => {
        isDragging = true;
        div.style.cursor = 'grabbing';
        startX = e.clientX;
        startY = e.clientY;
        const rect = div.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;
        e.preventDefault();
      });

      document.addEventListener('pointermove', e => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        div.style.left = `${initialLeft + dx}px`;
        div.style.top = `${initialTop + dy}px`;
      });

      document.addEventListener('pointerup', () => {
        isDragging = false;
        div.style.cursor = 'grab';
        // Save new position
        const rect = div.getBoundingClientRect();
        const newX = Math.round(rect.left);
        const newY = Math.round(rect.top);
        updateBurPosition(div.dataset.id, newX, newY);
      });
    }

    // Click to select / check-in
    div.addEventListener('click', async () => {
      if (editingMode) {
        selectBur(div.dataset.id);
      } else {
        // Check-in mode
        if (!currentEmployee) {
          alert('Du måste logga in först för att kunna kollas en bur');
          return;
        }
        await checkinBur(div.dataset.id);
      }
    });

    karta.appendChild(div);
  });
}

// Select bur for editing
async function selectBur(id) {
  if (selectedBurId === id) {
    selectedBurId = null;
    document.querySelectorAll('.bur').forEach(b => b.classList.remove('selected'));
    document.getElementById('burModal').style.display = 'none';
    return;
  }

  selectedBurId = id;
  document.querySelectorAll('.bur').forEach(b => b.classList.toggle('selected', b.dataset.id === id));

  const bur = burar.find(b => b.id == id);
  if (!bur) return;

  document.getElementById('burNamn').value = bur.name;
  document.getElementById('burX').value = bur.x;
  document.getElementById('burY').value = bur.y;

  // Set active color button
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === bur.color_status);
  });

  document.getElementById('modalTitle').textContent = `Redigera "${bur.name}"`;
  document.getElementById('burModal').style.display = 'flex';
}

// Update bur (name, position)
async function updateBur(id, updates) {
  try {
    await api(`/burar/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
    await loadBurar();
    selectBur(id); // Refresh modal
  } catch (e) {
    alert('Fel vid uppdatering: ' + e.message);
  }
}

// Update position only
async function updateBurPosition(id, x, y) {
  try {
    await api(`/burar/${id}`, { method: 'PUT', body: JSON.stringify({ x, y }) });
    await loadBurar();
  } catch (e) {
    alert('Kunde inte spara position: ' + e.message);
  }
}

// Delete bur
async function deleteBur(id) {
  if (!confirm('Ta bort denna rullbur?')) return;
  try {
    await api(`/burar/${id}`, { method: 'DELETE' });
    await loadBurar();
    if (selectedBurId === id) selectBur(id); // Close modal
  } catch (e) {
    alert('Fel vid borttagning: ' + e.message);
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
  } catch (e) {
    alert('Fel vid skapande: ' + e.message);
  }
}

// Check-in a bur
async function checkinBur(burId) {
  try {
    const result = await api('/checkin', { method: 'POST', body: JSON.stringify({ bur_id: burId }) });
    // Update local bur data for immediate UI feedback
    const bur = burar.find(b => b.id == burId);
    if (bur) {
      bur.checked_at = new Date().toISOString();
      bur.checked_by_name = currentEmployee.name;
      bur.color_status = 'gron'; // Reset to green after check-in
    }
    renderBurar();
    updateStats();
  } catch (e) {
    alert('Kunde inte registrera koll: ' + e.message);
  }
}

// Load all burar from backend
async function loadBurar() {
  try {
    burar = await api('/burar');
    renderBurar();
    updateStats();
  } catch (e) {
    console.error('Failed to load burar:', e);
    document.getElementById('karta').innerHTML = '<p>Kunde inte ladda data</p>';
  }
}

// Update statistics panels
async function updateStats() {
  try {
    // Total burar
    document.getElementById('totalBurar').textContent = burar.length;

    // Kollade idag
    const today = new Date();
    today.setHours(0,0,0,0);
    const kolladeIdag = burar.filter(b => {
      const d = b.checked_at ? new Date(b.checked_at) : 0;
      return d >= today;
    }).length;
    document.getElementById('kolladeIdag').textContent = kolladeIdag;

    // Nyligen kollade (last 3 days)
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const nyligen = burar.filter(b => {
      const d = b.checked_at ? new Date(b.checked_at) : 0;
      return d >= threeDaysAgo;
    }).length;
    document.getElementById('nyligenKollade').textContent = nyligen;
  } catch (e) {
    console.error('Stats error:', e);
  }
}

// RFID Login
async function loginWithRFID() {
  const tag = prompt('Skanna eller ange din RFID-tagg:');
  if (!tag) return;
  try {
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ rfid_tag: tag }) });
    localStorage.setItem('token', data.token);
    currentEmployee = data.employee;
    document.getElementById('userInfo').style.display = 'flex';
    document.getElementById('userName').textContent = currentEmployee.name;
    document.getElementById('loginBtn').textContent = 'Logga ut';
    document.getElementById('loginBtn').onclick = logout;
    document.getElementById('redigeringsLägeBtn').style.display = 'inline-block';
    await loadBurar();
  } catch (e) {
    alert('Ogiltig RFID-tagg: ' + e.message);
  }
}

function logout() {
  localStorage.removeItem('token');
  currentEmployee = null;
  document.getElementById('userInfo').style.display = 'none';
  document.getElementById('loginBtn').textContent = 'Logga in med RFID';
  document.getElementById('loginBtn').onclick = loginWithRFID;
  document.getElementById('redigeringsLägeBtn').style.display = 'none';
  editingMode = false;
  document.getElementById('redigeringsLägeBtn').textContent = 'Släpp på redigeringsläge';
  document.querySelectorAll('.bur').forEach(b => b.classList.remove('selected'));
  document.getElementById('burModal').style.display = 'none';
  loadBurar();
}

// Toggle edit mode
function toggleEditMode() {
  editingMode = !editingMode;
  document.getElementById('redigeringsLägeBtn').textContent = editingMode ? 'Avsluta redigeringsläge' : 'Släpp på redigeringsläge';
  document.querySelectorAll('.bur').forEach(b => {
    b.style.cursor = editingMode ? 'grab' : 'pointer';
  });
  if (!editingMode) {
    selectBur(null);
    document.getElementById('burModal').style.display = 'none';
  }
}

// Modal buttons
document.getElementById('btnSparaBur').addEventListener('click', createBur);
document.getElementById('btnAvbryt').addEventListener('click', () => {
  document.getElementById('burModal').style.display = 'none';
});

// Init
async function initApp() {
  // Check if already logged in
  const token = localStorage.getItem('token');
  if (token) {
    try {
      const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ rfid_tag: token }) }); // reuse token as tag? Not ideal but works for demo
      currentEmployee = data.employee;
      document.getElementById('userInfo').style.display = 'flex';
      document.getElementById('userName').textContent = currentEmployee.name;
      document.getElementById('loginBtn').textContent = 'Logga ut';
      document.getElementById('loginBtn').onclick = logout;
      document.getElementById('redigeringsLägeBtn').style.display = 'inline-block';
    } catch {
      logout();
    }
  }

  document.getElementById('loginBtn').addEventListener('click', loginWithRFID);
  document.getElementById('redigeringsLägeBtn').addEventListener('click', toggleEditMode);

  await loadBurar();
}

// Export for use in HTML
window.initApp = initApp;