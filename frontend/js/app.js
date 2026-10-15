const state = {
    view: 'feed',        // 'feed' | 'profile'
    query: '',           // termo da barra de pesquisa
    req: 0,              // contador para ignorar respostas antigas
    profile: null,       // dados do perfil aberto
    profileUser: null,   // username do perfil aberto
    profileTab: null     // 'publicacoes' | 'curtidas'
};

document.addEventListener('DOMContentLoaded', () => {
    hydrateIcons();
    checkAuth();
    setupSearch();
    window.addEventListener('hashchange', () => refreshView());
    refreshView();
});

/* ------------------------------------------------------------------ */
/* Navegação (feed / perfil)                                          */
/* ------------------------------------------------------------------ */
function refreshView(silent = false) {
    const match = location.hash.match(/^#\/perfil\/([A-Za-z0-9_.]+)$/);
    if (match) {
        showProfile(match[1], silent);
    } else {
        showFeed(silent);
    }
}

function setView(view) {
    state.view = view;
    $('feedView').classList.toggle('hidden', view !== 'feed');
    $('profileView').classList.toggle('hidden', view !== 'profile');
}

function showFeed(silent = false) {
    setView('feed');
    loadFeed(silent);
}

/* ------------------------------------------------------------------ */
/* Barra de pesquisa                                                  */
/* ------------------------------------------------------------------ */
function setupSearch() {
    const input = $('searchInput');
    let timer;

    input.addEventListener('input', () => {
        $('searchClear').classList.toggle('hidden', input.value === '');
        clearTimeout(timer);
        timer = setTimeout(() => {
            state.query = input.value.trim();
            if (state.view === 'profile') {
                location.hash = '#/'; // volta ao feed e aplica a busca
            } else {
                loadFeed(true);
            }
        }, 300);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') clearSearch();
    });
}

function clearSearch() {
    const input = $('searchInput');
    const hadQuery = state.query !== '' || input.value !== '';
    input.value = '';
    state.query = '';
    $('searchClear').classList.add('hidden');
    if (hadQuery && state.view === 'feed') loadFeed(true);
}

/* ------------------------------------------------------------------ */
/* Feed                                                               */
/* ------------------------------------------------------------------ */
function skeletons(n = 2) {
    return Array.from({ length: n }, () => `
        <div class="post skeleton" aria-hidden="true">
            <div class="sk-line sk-short"></div>
            <div class="sk-line"></div>
            <div class="sk-line sk-mid"></div>
        </div>`).join('');
}

function emptyState(iconName, title, text = '') {
    return `
        <div class="empty">
            <span class="empty-icon">${icon(iconName, 28)}</span>
            <p class="empty-title">${escapeHtml(title)}</p>
            ${text ? `<p class="empty-text">${escapeHtml(text)}</p>` : ''}
        </div>`;
}

async function loadFeed(silent = false) {
    const feed = $('feed');
    const q = state.query;
    const reqId = ++state.req;

    if (!silent) feed.innerHTML = skeletons();

    try {
        const qs = q ? `?busca=${encodeURIComponent(q)}` : '';
        const [posts, people] = await Promise.all([
            apiFetch('/publicacoes' + qs),
            q ? apiFetch('/usuarios' + qs) : Promise.resolve([])
        ]);
        if (reqId !== state.req) return; // chegou uma resposta mais nova

        renderSearchInfo(q, posts.length);
        renderPeople(people);

        if (posts.length) {
            feed.innerHTML = posts.map(renderPost).join('');
        } else if (q) {
            feed.innerHTML = emptyState('search', 'Nada encontrado', 'Tente outro nome, @usuário ou palavra.');
        } else {
            feed.innerHTML = emptyState('pen', 'Ainda não há publicações',
                getToken() ? 'Use o campo acima para criar a primeira.' : 'Entre na sua conta para publicar.');
        }
    } catch (err) {
        if (reqId !== state.req) return;
        feed.innerHTML = emptyState('x', 'Não foi possível carregar o feed', err.message);
    }
}

function renderSearchInfo(q, total) {
    const info = $('searchInfo');
    if (!q) {
        info.classList.add('hidden');
        info.innerHTML = '';
        return;
    }
    info.classList.remove('hidden');
    info.innerHTML = `
        <span>${total} ${total === 1 ? 'publicação' : 'publicações'} para “${escapeHtml(q)}”</span>
        <button type="button" class="link-btn" onclick="clearSearch()">Limpar pesquisa</button>`;
}

function renderPeople(people) {
    const box = $('peopleResults');
    if (!people.length) {
        box.classList.add('hidden');
        box.innerHTML = '';
        return;
    }
    box.classList.remove('hidden');
    box.innerHTML = people.map(p => `
        <a class="person" href="#/perfil/${encodeURIComponent(p.username)}">
            ${avatarHtml(p.foto, p.nome, 'sm')}
            <span class="person-names">
                <strong>${escapeHtml(p.nome)}</strong>
                <small>@${escapeHtml(p.username)}</small>
            </span>
        </a>`).join('');
}

/* ------------------------------------------------------------------ */
/* Publicações                                                        */
/* ------------------------------------------------------------------ */
function timeAgo(value) {
    const date = new Date(String(value).replace(' ', 'T'));
    const diff = (Date.now() - date.getTime()) / 1000;
    if (isNaN(diff)) return '';
    if (diff < 60) return 'agora';
    if (diff < 3600) return `${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} d`;
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fullDate(value) {
    return new Date(String(value).replace(' ', 'T')).toLocaleString('pt-BR');
}

function likeButtonInner(liked, count) {
    return `${icon(liked ? 'heart-fill' : 'heart', 20)}<span class="like-count">${count}</span>`;
}

function renderPost(post) {
    const user = getUser();
    const isOwner = !!user && Number(user.id_usuario) === Number(post.id_usuario);
    const canDelete = isOwner;
    const liked = Number(post.curtido_pelo_usuario) === 1;
    const total = Number(post.total_curtidas) || 0;

    return `
        <article class="post" id="post-${post.id_publicacao}">
            <header class="post-head">
                <a class="post-user" href="#/perfil/${encodeURIComponent(post.username)}">
                    ${avatarHtml(post.foto_usuario, post.nome, 'md')}
                    <span class="post-names">
                        <strong>${escapeHtml(post.nome)}</strong>
                        <small>@${escapeHtml(post.username)}</small>
                    </span>
                </a>
                <time class="post-time" datetime="${escapeHtml(post.datahora_publicacao)}"
                      title="${escapeHtml(fullDate(post.datahora_publicacao))}">${timeAgo(post.datahora_publicacao)}</time>
                ${canDelete ? `
                    <button type="button" class="delete-btn" onclick="deletePost(${post.id_publicacao})"
                            aria-label="Excluir publicação" title="Excluir publicação">${icon('trash', 16)}<span>Excluir</span></button>` : ''}
            </header>
            ${post.texto ? `<p class="post-text">${escapeHtml(post.texto)}</p>` : ''}
            ${post.imagem ? `<img class="post-image" loading="lazy" alt="Imagem da publicação"
                                  src="${API_BASE_URL}/uploads/${encodeURIComponent(post.imagem)}">` : ''}
            <footer class="post-actions">
                <button type="button" class="like-btn ${liked ? 'liked' : ''}" data-count="${total}"
                        aria-pressed="${liked}" aria-label="Curtir" title="${liked ? 'Descurtir' : 'Curtir'}"
                        onclick="toggleLike(${post.id_publicacao}, this)">
                    ${likeButtonInner(liked, total)}
                </button>
            </footer>
        </article>`;
}

async function toggleLike(idPublicacao, btn) {
    if (!getToken()) {
        openAuthModal();
        return;
    }
    if (btn.disabled) return;
    btn.disabled = true;

    try {
        const res = await apiFetch('/curtir', {
            method: 'POST',
            body: JSON.stringify({ id_publicacao: idPublicacao })
        });
        const liked = res.status === 'adicionado';
        const count = Math.max(0, Number(btn.dataset.count) + (liked ? 1 : -1));

        btn.dataset.count = count;
        btn.classList.toggle('liked', liked);
        btn.setAttribute('aria-pressed', liked);
        btn.title = liked ? 'Descurtir' : 'Curtir';
        btn.innerHTML = likeButtonInner(liked, count);

        // No perfil, os contadores do topo e a aba "Curtidas" também mudam
        if (state.view === 'profile') refreshView(true);
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

async function deletePost(idPublicacao) {
    if (!confirm('Deseja realmente excluir esta publicação?')) return;

    try {
        await apiFetch(`/publicacoes/${idPublicacao}`, { method: 'DELETE' });
        showToast('Publicação excluída.');
        refreshView(true);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

/* ------------------------------------------------------------------ */
/* Nova publicação                                                    */
/* ------------------------------------------------------------------ */
$('postImage').addEventListener('change', (e) => {
    $('postImageName').textContent = e.target.files[0]?.name || 'Adicionar imagem';
});

$('postForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const texto = $('postText').value.trim();
    const img = $('postImage').files[0];

    if (!texto && !img) {
        showToast('Escreva algo ou adicione uma imagem.', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('texto', texto);
    if (img) formData.append('imagem', img);

    const submit = $('postSubmit');
    submit.disabled = true;

    try {
        await apiFetch('/publicacoes', { method: 'POST', body: formData });
        $('postForm').reset();
        $('postImageName').textContent = 'Adicionar imagem';
        showToast('Publicado.', 'success');
        loadFeed(true);
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        submit.disabled = false;
    }
});

/* ------------------------------------------------------------------ */
/* Perfil                                                             */
/* ------------------------------------------------------------------ */
async function showProfile(username, silent = false) {
    setView('profile');
    const box = $('profileView');
    const reqId = ++state.req;

    if (!silent || state.profileUser !== username) {
        box.innerHTML = skeletons(1);
        window.scrollTo({ top: 0 });
    }

    try {
        const data = await apiFetch(`/perfil/${encodeURIComponent(username)}`);
        if (reqId !== state.req) return;

        const isNewProfile = state.profileUser !== username;
        state.profile = data;
        state.profileUser = username;
        if (isNewProfile || !state.profileTab) {
            state.profileTab = 'publicacoes';
        }
        renderProfile();
    } catch (err) {
        if (reqId !== state.req) return;
        box.innerHTML = `
            <a href="#/" class="back-link">${icon('arrow-left', 18)} Voltar ao feed</a>
            ${emptyState('user', 'Perfil não encontrado', err.message)}`;
    }
}

function renderProfile() {
    const { usuario: u, estatisticas: s } = state.profile;
    const me = getUser();
    const isMe = !!me && Number(me.id_usuario) === Number(u.id_usuario);
    const tab = state.profileTab;
    const list = tab === 'publicacoes' ? state.profile.publicacoes : state.profile.curtidas;

    const since = u.criado_em
        ? new Date(String(u.criado_em).replace(' ', 'T')).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
        : '';

    let emptyHtml;
    if (tab === 'publicacoes') {
        emptyHtml = emptyState('pen', isMe ? 'Você ainda não publicou' : 'Nenhuma publicação ainda',
            isMe ? 'Use o campo de nova publicação no feed.' : '');
    } else {
        emptyHtml = emptyState('heart', isMe ? 'Você ainda não curtiu nada' : 'Nenhuma curtida ainda',
            isMe ? 'As publicações que você curtir aparecem aqui.' : '');
    }

    $('profileView').innerHTML = `
        <a href="#/" class="back-link" onclick="clearSearch()">${icon('arrow-left', 18)} Voltar ao feed</a>

        <section class="card profile-card">
            ${avatarHtml(u.foto, u.nome, 'xl')}
            <div class="profile-info">
                <h1>${escapeHtml(u.nome)}</h1>
                <p class="handle">@${escapeHtml(u.username)}</p>
                ${isMe ? '<div class="profile-badges"><span class="badge badge-me">Seu perfil</span></div>' : ''}
                ${since ? `<p class="since">Na comunidade desde ${escapeHtml(since)}</p>` : ''}
            </div>
            <dl class="stats">
                <div><dt>Publicações</dt><dd>${s.publicacoes}</dd></div>
                <div><dt>Curtidas recebidas</dt><dd>${s.curtidas_recebidas}</dd></div>
                <div><dt>Curtidas dadas</dt><dd>${s.curtidas_dadas}</dd></div>
            </dl>
        </section>

        <div class="tabs profile-tabs" role="tablist">
                <button type="button" role="tab" data-tab="publicacoes" aria-selected="${tab === 'publicacoes'}"
                        class="tab-btn ${tab === 'publicacoes' ? 'active' : ''}">Publicações</button>
                <button type="button" role="tab" data-tab="curtidas" aria-selected="${tab === 'curtidas'}"
                        class="tab-btn ${tab === 'curtidas' ? 'active' : ''}">Curtidas</button>
        </div>

        <section class="feed">
            ${list.length ? list.map(renderPost).join('') : emptyHtml}
        </section>`;
}

// Troca de aba no perfil sem nova requisição
$('profileView').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn || !state.profile) return;
    state.profileTab = btn.dataset.tab;
    renderProfile();
});
