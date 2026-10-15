const API_BASE_URL = 'http://localhost:8080/senai_conecta/backend';

/* ------------------------------------------------------------------ */
/* Sessão                                                             */
/* ------------------------------------------------------------------ */
function getToken() {
    return localStorage.getItem('token');
}

function getUser() {
    try {
        return JSON.parse(localStorage.getItem('usuario') || 'null');
    } catch {
        return null;
    }
}

/* ------------------------------------------------------------------ */
/* Requisições                                                        */
/* ------------------------------------------------------------------ */
async function apiFetch(endpoint, options = {}) {
    const token = getToken();
    const headers = { ...(options.headers || {}) };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }

    let response;
    try {
        response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
    } catch {
        throw new Error('Não foi possível conectar ao servidor.');
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        // Sessão expirada: limpa o login e atualiza o cabeçalho
        if (response.status === 401 && token && endpoint !== '/login') {
            localStorage.removeItem('token');
            localStorage.removeItem('usuario');
            if (typeof checkAuth === 'function') checkAuth();
        }
        throw new Error(data.erro || 'Erro no processamento da requisição.');
    }
    return data;
}

/* ------------------------------------------------------------------ */
/* Utilitários de interface                                           */
/* ------------------------------------------------------------------ */
function $(id) {
    return document.getElementById(id);
}

function escapeHtml(text) {
    return String(text ?? '').replace(/[&<>"']/g, match => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[match]));
}

const DEFAULT_AVATARS = ['avatar.png', 'default_avatar.png'];

// Avatar com foto; se não houver foto (ou falhar), mostra a inicial do nome
function avatarHtml(foto, nome, size = 'md') {
    const initial = escapeHtml((nome || '?').trim().charAt(0).toUpperCase());
    const hasPhoto = foto && !DEFAULT_AVATARS.includes(foto);
    const img = hasPhoto
        ? `<img src="${API_BASE_URL}/uploads/${encodeURIComponent(foto)}" alt="" onerror="this.remove()">`
        : '';
    return `<span class="avatar avatar-${size}" aria-hidden="true">${initial}${img}</span>`;
}

function showToast(message, type = 'info') {
    let box = $('toasts');
    if (!box) {
        box = document.createElement('div');
        box.id = 'toasts';
        box.className = 'toasts';
        box.setAttribute('aria-live', 'polite');
        document.body.appendChild(box);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    box.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}
