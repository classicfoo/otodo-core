<?php
declare(strict_types=1);

require __DIR__ . '/auth.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'logout') {
    handle_logout($db);
    header('Location: login.php');
    exit;
}

$currentUser = current_user();
$serverAuth = (bool)$currentUser;

if (!isset($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}
$csrfToken = $_SESSION['csrf_token'];
$taskFilter = ($_GET['view'] ?? 'active') === 'completed' ? 'completed' : 'active';
$initialRoute = 'list';

require __DIR__ . '/app_shell.php';
