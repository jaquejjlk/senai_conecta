// Ícones SVG inline (sem dependências externas).
// Use icon('nome', tamanho) no JS ou <span data-icon="nome" data-size="20"></span> no HTML.
const HEART_PATH = '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>';

const ICONS = {
    'heart': HEART_PATH,
    'heart-fill': HEART_PATH,
    'search': '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    'login': '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>',
    'logout': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    'trash': '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
    'image': '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    'x': '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    'user': '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    'pen': '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    'eye': '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    'arrow-left': '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>'
};

function icon(name, size = 20) {
    const filled = name.endsWith('-fill');
    return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
        `fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" ` +
        `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">` +
        `${ICONS[name] || ''}</svg>`;
}

function hydrateIcons(root = document) {
    root.querySelectorAll('[data-icon]').forEach(el => {
        el.innerHTML = icon(el.dataset.icon, Number(el.dataset.size) || 20);
    });
}
