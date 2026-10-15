function checkAuth() {
    const token = getToken();
    const user = getUser();

    const userMenu = $('userMenu');
    const createPostSection = $('createPostSection');

    if (token && user) {
        userMenu.innerHTML = `
            <a class="user-chip" href="#/perfil/${encodeURIComponent(user.username)}" title="Meu perfil">
                ${avatarHtml(user.foto, user.nome, 'sm')}
                <span class="user-chip-name">Meu perfil</span>
            </a>
            <button type="button" class="icon-btn" onclick="logout()" aria-label="Sair" title="Sair">
                ${icon('logout', 20)}
            </button>
        `;
        createPostSection.classList.remove('hidden');
    } else {
        userMenu.innerHTML = `
            <button type="button" class="btn light" onclick="openAuthModal()">
                ${icon('login', 18)} <span>Entrar</span>
            </button>
        `;
        createPostSection.classList.add('hidden');
    }
}

function openAuthModal() {
    $('authModal').classList.remove('hidden');
    const form = $('loginForm').classList.contains('hidden') ? 'regNome' : 'loginEmail';
    setTimeout(() => $(form).focus(), 0);
}

function closeAuthModal() {
    $('authModal').classList.add('hidden');
}

function switchTab(tab) {
    const isLogin = tab === 'login';
    $('loginForm').classList.toggle('hidden', !isLogin);
    $('registerForm').classList.toggle('hidden', isLogin);
    $('tabLogin').classList.toggle('active', isLogin);
    $('tabRegister').classList.toggle('active', !isLogin);
    $('tabLogin').setAttribute('aria-selected', isLogin);
    $('tabRegister').setAttribute('aria-selected', !isLogin);
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    checkAuth();
    refreshView(true);
    showToast('Você saiu da conta.');
}

// Fecha o modal ao clicar fora dele ou ao apertar Esc
$('authModal').addEventListener('click', (e) => {
    if (e.target === $('authModal')) closeAuthModal();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('authModal').classList.contains('hidden')) closeAuthModal();
});

$('regFoto').addEventListener('change', (e) => {
    $('regFotoName').textContent = e.target.files[0]?.name || 'Foto de perfil (opcional)';
});

$('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorDiv = $('loginError');
    errorDiv.classList.add('hidden');

    try {
        const res = await apiFetch('/login', {
            method: 'POST',
            body: JSON.stringify({
                email: $('loginEmail').value.trim(),
                senha: $('loginSenha').value
            })
        });

        localStorage.setItem('token', res.token);
        localStorage.setItem('usuario', JSON.stringify(res.usuario));
        $('loginForm').reset();
        closeAuthModal();
        checkAuth();
        refreshView(true);
        showToast(`Olá, ${res.usuario.nome.split(' ')[0]}!`, 'success');
    } catch (err) {
        errorDiv.textContent = err.message;
        errorDiv.classList.remove('hidden');
    }
});

$('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorDiv = $('regError');
    errorDiv.classList.add('hidden');

    const email = $('regEmail').value.trim();
    const formData = new FormData();
    formData.append('nome', $('regNome').value.trim());
    formData.append('username', $('regUsername').value.trim());
    formData.append('email', email);
    formData.append('senha', $('regSenha').value);

    const foto = $('regFoto').files[0];
    if (foto) formData.append('foto', foto);

    try {
        await apiFetch('/cadastro', { method: 'POST', body: formData });
        $('registerForm').reset();
        $('regFotoName').textContent = 'Foto de perfil (opcional)';
        $('loginEmail').value = email;
        switchTab('login');
        $('loginSenha').focus();
        showToast('Conta criada. Entre com seu e-mail e senha.', 'success');
    } catch (err) {
        errorDiv.textContent = err.message;
        errorDiv.classList.remove('hidden');
    }
});
