<?php
$host = "localhost";
$usuario = "root";
$senha = "";
$banco = "senai_conecta";

try {
    $pdo = new PDO("mysql:host=$host;dbname=$banco;charset=utf8", $usuario, $senha); 
    
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); 
    
    echo "Conexão realizada com sucesso!"; 
} catch (PDOException $e) { 
    echo "Erro na conexão: " . $e->getMessage();
}
?>