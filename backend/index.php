<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/helpers/jwt_helper.php';

// Qualquer erro inesperado vira uma resposta JSON em vez de uma página em branco
set_exception_handler(function (Throwable $e) {
    http_response_code(500);
    echo json_encode(["erro" => "Erro interno no servidor."]);
});

$db = (new Database())->getConnection();
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];

$basePath = '/senai_conecta/backend';
if (str_starts_with($uri, $basePath)) {
    $uri = substr($uri, strlen($basePath));
}
if ($uri === '') {
    $uri = '/';
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function respond(int $code, array $data): void {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

function getAuthenticatedUser(): ?array {
    $headers = getallheaders();
    $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    if (preg_match('/Bearer\s(\S+)/', $authHeader, $matches)) {
        return JWTHelper::decode($matches[1]);
    }
    return null;
}

function requireAuth(): array {
    $user = getAuthenticatedUser();
    if (!$user) {
        respond(401, ["erro" => "Acesso não autorizado. Faça login novamente."]);
    }
    return $user;
}

function saveUpload(string $field): ?string {
    if (!isset($_FILES[$field]) || $_FILES[$field]['error'] === UPLOAD_ERR_NO_FILE) {
        return null;
    }
    $file = $_FILES[$field];

    if ($file['error'] !== UPLOAD_ERR_OK) {
        respond(400, ["erro" => "Falha no envio da imagem."]);
    }

    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'webp'], true)) {
        respond(400, ["erro" => "Formato de imagem não permitido. Use JPG, PNG, GIF ou WEBP."]);
    }
    if ($file['size'] > 5 * 1024 * 1024) {
        respond(400, ["erro" => "A imagem deve ter no máximo 5 MB."]);
    }
    if (@getimagesize($file['tmp_name']) === false) {
        respond(400, ["erro" => "O arquivo enviado não é uma imagem válida."]);
    }

    $dir = __DIR__ . '/uploads';
    if (!is_dir($dir)) {
        mkdir($dir, 0775, true);
    }

    $name = uniqid() . '.' . $ext;
    move_uploaded_file($file['tmp_name'], $dir . '/' . $name);
    return $name;
}

// Busca publicações já com autor, total de curtidas e se o usuário atual curtiu
function fetchPosts(PDO $db, int $currentUserId, string $where = '', array $params = []): array {
    $sql = "
        SELECT p.*, u.nome, u.username, u.foto AS foto_usuario,
            (SELECT COUNT(*) FROM curtida c WHERE c.id_publicacao = p.id_publicacao) AS total_curtidas,
            EXISTS(SELECT 1 FROM curtida c2
                   WHERE c2.id_publicacao = p.id_publicacao
                     AND c2.id_usuario = :current_user) AS curtido_pelo_usuario
        FROM publicacao p
        JOIN usuario u ON p.id_usuario = u.id_usuario
        $where
        ORDER BY p.datahora_publicacao DESC, p.id_publicacao DESC
    ";
    $stmt = $db->prepare($sql);
    $stmt->execute(array_merge([':current_user' => $currentUserId], $params));
    $rows = $stmt->fetchAll();

    foreach ($rows as &$row) {
        $row['id_publicacao'] = (int)$row['id_publicacao'];
        $row['id_usuario'] = (int)$row['id_usuario'];
        $row['total_curtidas'] = (int)$row['total_curtidas'];
        $row['curtido_pelo_usuario'] = (int)$row['curtido_pelo_usuario'];
    }
    return $rows;
}

function likePattern(string $term): string {
    return '%' . addcslashes($term, '%_\\') . '%';
}

/* ------------------------------------------------------------------ */
/* POST /login                                                        */
/* ------------------------------------------------------------------ */
if ($uri === '/login' && $method === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true) ?? [];
    $email = trim($data['email'] ?? '');
    $senha = (string)($data['senha'] ?? '');

    $stmt = $db->prepare("SELECT * FROM usuario WHERE email = ?");
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    $ok = false;
    if ($user) {
        $stored = (string)$user['senha'];
        if (password_verify($senha, $stored)) {
            $ok = true;
        } elseif (hash_equals($stored, $senha)) {
            // Conta antiga com senha em texto puro: converte para hash no primeiro login
            $ok = true;
            $up = $db->prepare("UPDATE usuario SET senha = ? WHERE id_usuario = ?");
            $up->execute([password_hash($senha, PASSWORD_DEFAULT), $user['id_usuario']]);
        }
    }

    if (!$ok) {
        respond(401, ["erro" => "E-mail ou senha inválidos."]);
    }

    $token = JWTHelper::encode([
        'id_usuario' => (int)$user['id_usuario'],
        'username' => $user['username'],
        'nome' => $user['nome'],
        'exp' => time() + (8 * 3600)
    ]);

    respond(200, [
        "token" => $token,
        "usuario" => [
            "id_usuario" => (int)$user['id_usuario'],
            "nome" => $user['nome'],
            "username" => $user['username'],
            "foto" => $user['foto']
        ]
    ]);
}

/* ------------------------------------------------------------------ */
/* POST /cadastro                                                     */
/* ------------------------------------------------------------------ */
if ($uri === '/cadastro' && $method === 'POST') {
    $nome = trim($_POST['nome'] ?? '');
    $username = ltrim(trim($_POST['username'] ?? ''), '@');
    $email = trim($_POST['email'] ?? '');
    $senha = $_POST['senha'] ?? '';

    if ($nome === '' || $username === '' || $email === '' || $senha === '') {
        respond(400, ["erro" => "Todos os campos obrigatórios devem ser preenchidos."]);
    }
    if (!preg_match('/^[A-Za-z0-9_.]{3,30}$/', $username)) {
        respond(400, ["erro" => "O nome de usuário deve ter de 3 a 30 caracteres: letras, números, _ ou ."]);
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        respond(400, ["erro" => "Informe um e-mail válido."]);
    }
    if (strlen($senha) < 6) {
        respond(400, ["erro" => "A senha deve ter pelo menos 6 caracteres."]);
    }

    $stmt = $db->prepare("SELECT id_usuario FROM usuario WHERE username = ? OR email = ?");
    $stmt->execute([$username, $email]);
    if ($stmt->fetch()) {
        respond(409, ["erro" => "Nome de usuário ou e-mail já cadastrados."]);
    }

    $fotoPath = saveUpload('foto') ?? 'avatar.png';

    $stmt = $db->prepare("INSERT INTO usuario (nome, username, email, senha, foto) VALUES (?, ?, ?, ?, ?)");
    $stmt->execute([$nome, $username, $email, password_hash($senha, PASSWORD_DEFAULT), $fotoPath]);

    respond(201, ["mensagem" => "Usuário cadastrado com sucesso!"]);
}

/* ------------------------------------------------------------------ */
/* GET /publicacoes?busca=...                                         */
/* ------------------------------------------------------------------ */
if ($uri === '/publicacoes' && $method === 'GET') {
    $user = getAuthenticatedUser();
    $currentUserId = $user ? (int)$user['id_usuario'] : 0;

    $busca = ltrim(trim($_GET['busca'] ?? ''), '@');
    if ($busca !== '') {
        $like = likePattern($busca);
        $posts = fetchPosts(
            $db,
            $currentUserId,
            "WHERE (u.username LIKE :q1 OR u.nome LIKE :q2 OR p.texto LIKE :q3)",
            [':q1' => $like, ':q2' => $like, ':q3' => $like]
        );
    } else {
        $posts = fetchPosts($db, $currentUserId);
    }

    respond(200, $posts);
}

/* ------------------------------------------------------------------ */
/* GET /usuarios?busca=...  (pessoas para a barra de pesquisa)        */
/* ------------------------------------------------------------------ */
if ($uri === '/usuarios' && $method === 'GET') {
    $busca = ltrim(trim($_GET['busca'] ?? ''), '@');
    if ($busca === '') {
        respond(200, []);
    }

    $like = likePattern($busca);
    $stmt = $db->prepare("
        SELECT id_usuario, nome, username, foto
        FROM usuario
        WHERE username LIKE :a OR nome LIKE :b
        ORDER BY (username = :exato) DESC, nome ASC
        LIMIT 5
    ");
    $stmt->execute([':a' => $like, ':b' => $like, ':exato' => $busca]);
    respond(200, $stmt->fetchAll());
}

/* ------------------------------------------------------------------ */
/* GET /perfil/{username}                                             */
/* ------------------------------------------------------------------ */
if (preg_match('/^\/perfil\/([A-Za-z0-9_.]+)$/', $uri, $matches) && $method === 'GET') {
    $viewer = getAuthenticatedUser();
    $viewerId = $viewer ? (int)$viewer['id_usuario'] : 0;

    $stmt = $db->prepare("SELECT id_usuario, nome, username, foto, criado_em FROM usuario WHERE username = ?");
    $stmt->execute([$matches[1]]);
    $perfil = $stmt->fetch();

    if (!$perfil) {
        respond(404, ["erro" => "Perfil não encontrado."]);
    }

    $alvo = (int)$perfil['id_usuario'];
    $perfil['id_usuario'] = $alvo;

    $publicacoes = fetchPosts($db, $viewerId, "WHERE p.id_usuario = :alvo", [':alvo' => $alvo]);
    $curtidas = fetchPosts(
        $db,
        $viewerId,
        "WHERE EXISTS (SELECT 1 FROM curtida cx WHERE cx.id_publicacao = p.id_publicacao AND cx.id_usuario = :alvo)",
        [':alvo' => $alvo]
    );

    respond(200, [
        "usuario" => $perfil,
        "estatisticas" => [
            "publicacoes" => count($publicacoes),
            "curtidas_recebidas" => array_sum(array_column($publicacoes, 'total_curtidas')),
            "curtidas_dadas" => count($curtidas)
        ],
        "publicacoes" => $publicacoes,
        "curtidas" => $curtidas
    ]);
}

/* ------------------------------------------------------------------ */
/* POST /publicacoes  (qualquer usuário logado)                               */
/* ------------------------------------------------------------------ */
if ($uri === '/publicacoes' && $method === 'POST') {
    $user = requireAuth();

    $texto = trim($_POST['texto'] ?? '');
    $imagemPath = saveUpload('imagem');

    if ($texto === '' && $imagemPath === null) {
        respond(400, ["erro" => "Escreva algo ou adicione uma imagem para publicar."]);
    }

    $stmt = $db->prepare("INSERT INTO publicacao (id_usuario, texto, imagem) VALUES (?, ?, ?)");
    $stmt->execute([$user['id_usuario'], $texto, $imagemPath]);

    respond(201, ["mensagem" => "Publicação criada com sucesso!"]);
}

/* ------------------------------------------------------------------ */
/* POST /curtir  (qualquer usuário logado)                            */
/* ------------------------------------------------------------------ */
if ($uri === '/curtir' && $method === 'POST') {
    $user = requireAuth();

    $data = json_decode(file_get_contents("php://input"), true) ?? [];
    $id_publicacao = filter_var($data['id_publicacao'] ?? null, FILTER_VALIDATE_INT);
    if (!$id_publicacao) {
        respond(400, ["erro" => "Publicação inválida."]);
    }

    $check = $db->prepare("SELECT 1 FROM publicacao WHERE id_publicacao = ?");
    $check->execute([$id_publicacao]);
    if (!$check->fetch()) {
        respond(404, ["erro" => "Publicação não encontrada."]);
    }

    $stmt = $db->prepare("SELECT id_curtida FROM curtida WHERE id_publicacao = ? AND id_usuario = ?");
    $stmt->execute([$id_publicacao, $user['id_usuario']]);
    $curtida = $stmt->fetch();

    if ($curtida) {
        $delete = $db->prepare("DELETE FROM curtida WHERE id_curtida = ?");
        $delete->execute([$curtida['id_curtida']]);
        respond(200, ["status" => "removido"]);
    }

    $insert = $db->prepare("INSERT INTO curtida (id_publicacao, id_usuario) VALUES (?, ?)");
    $insert->execute([$id_publicacao, $user['id_usuario']]);
    respond(200, ["status" => "adicionado"]);
}

/* ------------------------------------------------------------------ */
/* DELETE /publicacoes/{id}  (só as próprias)        */
/* ------------------------------------------------------------------ */
if (preg_match('/^\/publicacoes\/(\d+)$/', $uri, $matches) && $method === 'DELETE') {
    $user = requireAuth();
    $id_publicacao = (int)$matches[1];

    $stmt = $db->prepare("SELECT imagem FROM publicacao WHERE id_publicacao = ? AND id_usuario = ?");
    $stmt->execute([$id_publicacao, $user['id_usuario']]);
    $post = $stmt->fetch();

    if (!$post) {
        respond(403, ["erro" => "Ação não permitida ou publicação inexistente."]);
    }

    $delete = $db->prepare("DELETE FROM publicacao WHERE id_publicacao = ? AND id_usuario = ?");
    $delete->execute([$id_publicacao, $user['id_usuario']]);

    if (!empty($post['imagem'])) {
        $file = __DIR__ . '/uploads/' . basename($post['imagem']);
        if (is_file($file)) {
            @unlink($file);
        }
    }

    respond(200, ["mensagem" => "Publicação excluída com sucesso."]);
}

respond(404, ["erro" => "Rota não encontrada."]);
