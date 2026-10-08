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

function getAuthenticatedUser(): ?array {
    $headers = getallheaders();
    $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    if (preg_match('/Bearer\s(\S+)/', $authHeader, $matches)) {
        return JWTHelper::decode($matches[1]);
    }
    return null;
}

// ROUTE: POST /login
if ($uri === '/login' && $method === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);
    $email = trim($data['email'] ?? '');
    $senha = $data['senha'] ?? '';

    $stmt = $db->prepare("SELECT * FROM usuario WHERE email = ?");
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if ($user && $senha === $user['senha']) {
        $token = JWTHelper::encode([
            'id_usuario' => $user['id_usuario'],
            'username' => $user['username'],
            'nome' => $user['nome'],
            'exp' => time() + (8 * 3600)
        ]);
        echo json_encode(["token" => $token, "usuario" => [
            "id_usuario" => $user['id_usuario'],
            "nome" => $user['nome'],
            "username" => $user['username'],
            "foto" => $user['foto']
        ]]);
    } else {
        http_response_code(401);
        echo json_encode(["erro" => "E-mail ou senha inválidos."]);
    }
    exit;
}

// ROUTE: POST /cadastro
if ($uri === '/cadastro' && $method === 'POST') {
    $nome = trim($_POST['nome'] ?? '');
    $username = trim($_POST['username'] ?? '');
    $email = trim($_POST['email'] ?? '');
    $senha = $_POST['senha'] ?? '';

    if (empty($nome) || empty($username) || empty($email) || empty($senha)) {
        http_response_code(400);
        echo json_encode(["erro" => "Todos os campos obrigatórios devem ser preenchidos."]);
        exit;
    }

    $stmt = $db->prepare("SELECT id_usuario FROM usuario WHERE username = ? OR email = ?");
    $stmt->execute([$username, $email]);
    if ($stmt->fetch()) {
        http_response_code(409);
        echo json_encode(["erro" => "Nome de usuário ou e-mail já cadastrados."]);
        exit;
    }

    $fotoPath = "default_avatar.png";
    if (isset($_FILES['foto']) && $_FILES['foto']['error'] === UPLOAD_ERR_OK) {
        $ext = strtolower(pathinfo($_FILES['foto']['name'], PATHINFO_EXTENSION));
        $fotoName = uniqid() . "." . $ext;
        move_uploaded_file($_FILES['foto']['tmp_name'], __DIR__ . "/uploads/" . $fotoName);
        $fotoPath = $fotoName;
    }

    $stmt = $db->prepare("INSERT INTO usuario (nome, username, email, senha, foto) VALUES (?, ?, ?, ?, ?)");
    $stmt->execute([$nome, $username, $email, $senha, $fotoPath]);

    http_response_code(201);
    echo json_encode(["mensagem" => "Usuário cadastrado com sucesso!"]);
    exit;
}

// ROUTE: GET /publicacoes
if ($uri === '/publicacoes' && $method === 'GET') {
    $user = getAuthenticatedUser();
    $currentUserId = $user ? $user['id_usuario'] : 0;

    $query = "
        SELECT p.*, u.nome, u.username, u.foto AS foto_usuario,
            COUNT(c.id_curtida) AS total_curtidas,
            MAX(CASE WHEN c.id_usuario = :current_user THEN 1 ELSE 0 END) AS curtido_pelo_usuario
        FROM publicacao p
        JOIN usuario u ON p.id_usuario = u.id_usuario
        LEFT JOIN curtida c ON p.id_publicacao = c.id_publicacao
        GROUP BY p.id_publicacao
        ORDER BY p.datahora_publicacao DESC
    ";

    $stmt = $db->prepare($query);
    $stmt->bindValue(':current_user', $currentUserId, PDO::PARAM_INT);
    $stmt->execute();
    
    echo json_encode($stmt->fetchAll());
    exit;
}

// ROUTE: POST /publicacoes
if ($uri === '/publicacoes' && $method === 'POST') {
    $user = getAuthenticatedUser();
    if (!$user) {
        http_response_code(401);
        echo json_encode(["erro" => "Acesso não autorizado."]);
        exit;
    }

    $texto = trim($_POST['texto'] ?? '');
    $imagemPath = null;

    if (isset($_FILES['imagem']) && $_FILES['imagem']['error'] === UPLOAD_ERR_OK) {
        $ext = strtolower(pathinfo($_FILES['imagem']['name'], PATHINFO_EXTENSION));
        $imagemName = uniqid() . "." . $ext;
        move_uploaded_file($_FILES['imagem']['tmp_name'], __DIR__ . "/uploads/" . $imagemName);
        $imagemPath = $imagemName;
    }

    $stmt = $db->prepare("INSERT INTO publicacao (id_usuario, texto, imagem) VALUES (?, ?, ?)");
    $stmt->execute([$user['id_usuario'], $texto, $imagemPath]);

    http_response_code(201);
    echo json_encode(["mensagem" => "Publicação criada com sucesso!"]);
    exit;
}

// ROUTE: POST /curtir
if ($uri === '/curtir' && $method === 'POST') {
    $user = getAuthenticatedUser();
    if (!$user) {
        http_response_code(401);
        echo json_encode(["erro" => "Acesso não autorizado."]);
        exit;
    }

    $data = json_decode(file_get_contents("php://input"), true);
    $id_publicacao = $data['id_publicacao'] ?? null;

    $stmt = $db->prepare("SELECT id_curtida FROM curtida WHERE id_publicacao = ? AND id_usuario = ?");
    $stmt->execute([$id_publicacao, $user['id_usuario']]);
    $curtida = $stmt->fetch();

    if ($curtida) {
        $delete = $db->prepare("DELETE FROM curtida WHERE id_curtida = ?");
        $delete->execute([$curtida['id_curtida']]);
        echo json_encode(["status" => "removido"]);
    } else {
        $insert = $db->prepare("INSERT INTO curtida (id_publicacao, id_usuario) VALUES (?, ?)");
        $insert->execute([$id_publicacao, $user['id_usuario']]);
        echo json_encode(["status" => "adicionado"]);
    }
    exit;
}

// ROUTE: DELETE /publicacoes/{id}
if (preg_match('/^\/publicacoes\/(\d+)$/', $uri, $matches) && $method === 'DELETE') {
    $user = getAuthenticatedUser();
    if (!$user) {
        http_response_code(401);
        echo json_encode(["erro" => "Acesso não autorizado."]);
        exit;
    }

    $id_publicacao = $matches[1];
    $stmt = $db->prepare("DELETE FROM publicacao WHERE id_publicacao = ? AND id_usuario = ?");
    $stmt->execute([$id_publicacao, $user['id_usuario']]);

    if ($stmt->rowCount() > 0) {
        echo json_encode(["mensagem" => "Publicação excluída com sucesso."]);
    } else {
        http_response_code(403);
        echo json_encode(["erro" => "Ação não permitida ou publicação inexistente."]);
    }
    exit;
}

http_response_code(404);
echo json_encode(["erro" => "Rota não encontrada."]);
