document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    loadFeed();
});

async function loadFeed() {
    const feed = document.getElementById('feed');
    try {
        const posts = await apiFetch('/publicacoes');
        feed.innerHTML = posts.map(post => renderPost(post)).join('');
    } catch (err) {
        feed.innerHTML = `<p class="error">Erro ao carregar o feed.</p>`;
    }
}

function renderPost(post) {
    const user = JSON.parse(localStorage.getItem('usuario') || 'null');
    const isOwner = user && user.id_usuario === post.id_usuario;
    const isLiked = post.curtido_pelo_usuario == 1;

    return `
        <div class="post-card" id="post-${post.id_publicacao}">
            <div class="post-header">
                <div>
                    <span class="post-author">${escapeHtml(post.nome)}</span>
                    <span style="color:#777">@${escapeHtml(post.username)}</span>
                </div>
                ${isOwner ? `<button class="btn" onclick="deletePost(${post.id_publicacao})">Excluir</button>` : ''}
            </div>
            <p>${escapeHtml(post.texto)}</p>
            ${post.imagem ? `<img src="${API_BASE_URL}/uploads/${post.imagem}" class="post-image">` : ''}
            <div class="post-actions">
                <button class="like-btn ${isLiked ? 'liked' : ''}" onclick="toggleLike(${post.id_publicacao})">
                    ${isLiked ? '♥' : '♡'} ${post.total_curtidas}
                </button>
                <small style="color:#888">${new Date(post.datahora_publicacao).toLocaleString('pt-BR')}</small>
            </div>
        </div>
    `;
}

async function toggleLike(idPublicacao) {
    if (!localStorage.getItem('token')) {
        openAuthModal();
        return;
    }

    try {
        await apiFetch('/curtir', {
            method: 'POST',
            body: JSON.stringify({ id_publicacao: idPublicacao })
        });
        loadFeed();
    } catch (err) {
        alert(err.message);
    }
}

async function deletePost(idPublicacao) {
    if (!confirm('Deseja realmente excluir esta publicação?')) return;

    try {
        await apiFetch(`/publicacoes/${idPublicacao}`, { method: 'DELETE' });
        loadFeed();
    } catch (err) {
        alert(err.message);
    }
}

document.getElementById('postForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('texto', document.getElementById('postText').value);
    
    const img = document.getElementById('postImage').files[0];
    if (img) formData.append('imagem', img);

    try {
        await apiFetch('/publicacoes', { method: 'POST', body: formData });
        document.getElementById('postForm').reset();
        loadFeed();
    } catch (err) {
        alert(err.message);
    }
});

function escapeHtml(text) {
    return text.replace(/[&<>"']/g, match => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[match]));
}
