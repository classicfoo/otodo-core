<?php
declare(strict_types=1);

require __DIR__ . '/auth.php';

header('Content-Type: application/json; charset=utf-8');

function respond_ok(array $data = []): void
{
    echo json_encode(['ok' => true, 'data' => $data], JSON_UNESCAPED_SLASHES);
    exit;
}

function respond_error(string $error, string $code = 'bad_request', int $status = 400): void
{
    http_response_code($status);
    echo json_encode(['ok' => false, 'error' => $error, 'code' => $code], JSON_UNESCAPED_SLASHES);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond_error('Invalid method', 'method_not_allowed', 405);
}

$currentUser = current_user();
if (!$currentUser) {
    respond_error('Unauthorized', 'unauthorized', 401);
}

$csrfToken = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
if (!$csrfToken || !isset($_SESSION['csrf_token']) || !hash_equals($_SESSION['csrf_token'], $csrfToken)) {
    respond_error('Invalid CSRF token', 'csrf_invalid', 403);
}

$payload = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($payload)) {
    $payload = $_POST;
}

$color = normalize_hex_color((string)($payload['editor_background_color'] ?? ''), '#F8FAFC');
$saved = save_user_editor_background_color($db, (int)$currentUser['id'], $color);

if (!$saved) {
    respond_error('Unable to save editor background color', 'save_failed', 500);
}

respond_ok(['editor_background_color' => $color]);
