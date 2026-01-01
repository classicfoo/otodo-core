<?php
declare(strict_types=1);

session_start();
header('Content-Type: application/json; charset=utf-8');

function respond_ok($data = null): void {
    echo json_encode(['ok' => true, 'data' => $data], JSON_UNESCAPED_SLASHES);
    exit;
}

function respond_error(string $error, string $code = 'bad_request', int $status = 400): void {
    http_response_code($status);
    echo json_encode(['ok' => false, 'error' => $error, 'code' => $code], JSON_UNESCAPED_SLASHES);
    exit;
}

function get_input(): array {
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    $raw = file_get_contents('php://input');
    if (stripos($contentType, 'application/json') !== false) {
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }
    return $_POST;
}

function require_csrf(): void {
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!$token || !isset($_SESSION['csrf_token']) || !hash_equals($_SESSION['csrf_token'], $token)) {
        respond_error('Invalid CSRF token', 'csrf_invalid', 403);
    }
}

function uuidv4(): string {
    $data = random_bytes(16);
    $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
    $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

function iso_now(): string {
    return gmdate('c');
}

function valid_priority(string $priority): bool {
    return in_array($priority, ['low', 'med', 'high'], true);
}

function valid_date(?string $value): bool {
    if ($value === null || $value === '') {
        return true;
    }
    return (bool)preg_match('/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(Z)?)?$/', $value);
}

function ensure_db(): SQLite3 {
    $dataDir = __DIR__ . '/data';
    if (!is_dir($dataDir)) {
        mkdir($dataDir, 0775, true);
    }
    $dbPath = $dataDir . '/otodo.sqlite';
    $db = new SQLite3($dbPath);
    $db->exec('PRAGMA journal_mode = WAL;');
    $db->exec('PRAGMA foreign_keys = ON;');
    $db->exec('CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        priority TEXT NOT NULL,
        start_date TEXT NULL,
        due_date TEXT NULL,
        completed INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );');
    $db->exec('CREATE TABLE IF NOT EXISTS ops (
        op_id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        applied_at TEXT NOT NULL
    );');
    return $db;
}

$action = $_GET['action'] ?? '';
if ($action === '' && isset($_POST['action'])) {
    $action = (string)$_POST['action'];
}

try {
    $db = ensure_db();
} catch (Throwable $e) {
    respond_error('Database unavailable', 'db_error', 500);
}

if ($action === 'ping') {
    respond_ok(['time' => iso_now()]);
}

if ($action === 'list') {
    $result = $db->query('SELECT * FROM tasks');
    $tasks = [];
    while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
        $row['completed'] = (int)$row['completed'];
        $tasks[] = $row;
    }
    respond_ok(['tasks' => $tasks]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond_error('Invalid method', 'method_not_allowed', 405);
}

require_csrf();
$payload = get_input();

if ($action === 'upsert') {
    $id = isset($payload['id']) ? trim((string)$payload['id']) : '';
    $title = trim((string)($payload['title'] ?? ''));
    $priority = (string)($payload['priority'] ?? 'low');
    $startDate = $payload['start_date'] ?? null;
    $dueDate = $payload['due_date'] ?? null;
    $completed = isset($payload['completed']) ? (int)(bool)$payload['completed'] : 0;
    if ($title === '') {
        respond_error('Title required', 'invalid_title');
    }
    if (!valid_priority($priority)) {
        respond_error('Invalid priority', 'invalid_priority');
    }
    if (!valid_date($startDate) || !valid_date($dueDate)) {
        respond_error('Invalid date', 'invalid_date');
    }
    if ($id === '') {
        $id = uuidv4();
    }
    $existing = $db->prepare('SELECT created_at FROM tasks WHERE id = :id');
    $existing->bindValue(':id', $id, SQLITE3_TEXT);
    $existingResult = $existing->execute();
    $row = $existingResult->fetchArray(SQLITE3_ASSOC);
    $createdAt = $row['created_at'] ?? iso_now();
    $updatedAt = iso_now();

    $stmt = $db->prepare('INSERT INTO tasks (id, title, priority, start_date, due_date, completed, created_at, updated_at)
        VALUES (:id, :title, :priority, :start_date, :due_date, :completed, :created_at, :updated_at)
        ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        priority = excluded.priority,
        start_date = excluded.start_date,
        due_date = excluded.due_date,
        completed = excluded.completed,
        updated_at = excluded.updated_at');
    $stmt->bindValue(':id', $id, SQLITE3_TEXT);
    $stmt->bindValue(':title', $title, SQLITE3_TEXT);
    $stmt->bindValue(':priority', $priority, SQLITE3_TEXT);
    $stmt->bindValue(':start_date', $startDate ?: null, SQLITE3_TEXT);
    $stmt->bindValue(':due_date', $dueDate ?: null, SQLITE3_TEXT);
    $stmt->bindValue(':completed', $completed, SQLITE3_INTEGER);
    $stmt->bindValue(':created_at', $createdAt, SQLITE3_TEXT);
    $stmt->bindValue(':updated_at', $updatedAt, SQLITE3_TEXT);
    $stmt->execute();

    respond_ok([
        'task' => [
            'id' => $id,
            'title' => $title,
            'priority' => $priority,
            'start_date' => $startDate ?: null,
            'due_date' => $dueDate ?: null,
            'completed' => $completed,
            'created_at' => $createdAt,
            'updated_at' => $updatedAt,
        ]
    ]);
}

if ($action === 'toggle') {
    $id = trim((string)($payload['id'] ?? ''));
    if ($id === '') {
        respond_error('Invalid id', 'invalid_id');
    }
    $completed = isset($payload['completed']) ? (int)(bool)$payload['completed'] : 0;
    $updatedAt = iso_now();
    $stmt = $db->prepare('UPDATE tasks SET completed = :completed, updated_at = :updated_at WHERE id = :id');
    $stmt->bindValue(':completed', $completed, SQLITE3_INTEGER);
    $stmt->bindValue(':updated_at', $updatedAt, SQLITE3_TEXT);
    $stmt->bindValue(':id', $id, SQLITE3_TEXT);
    $stmt->execute();
    respond_ok(['id' => $id, 'completed' => $completed, 'updated_at' => $updatedAt]);
}

if ($action === 'delete') {
    $id = trim((string)($payload['id'] ?? ''));
    if ($id === '') {
        respond_error('Invalid id', 'invalid_id');
    }
    $stmt = $db->prepare('DELETE FROM tasks WHERE id = :id');
    $stmt->bindValue(':id', $id, SQLITE3_TEXT);
    $stmt->execute();
    respond_ok(['id' => $id]);
}

if ($action === 'sync_outbox') {
    $ops = $payload['ops'] ?? [];
    if (!is_array($ops)) {
        respond_error('Invalid ops payload', 'invalid_ops');
    }
    $applied = 0;
    foreach ($ops as $op) {
        $opId = trim((string)($op['op_id'] ?? ''));
        $clientId = trim((string)($op['client_id'] ?? ''));
        $type = (string)($op['type'] ?? '');
        if ($opId === '' || $clientId === '' || $type === '') {
            continue;
        }
        $check = $db->prepare('SELECT op_id FROM ops WHERE op_id = :op_id');
        $check->bindValue(':op_id', $opId, SQLITE3_TEXT);
        $checkResult = $check->execute();
        if ($checkResult->fetchArray(SQLITE3_ASSOC)) {
            continue;
        }
        if ($type === 'upsert') {
            $task = $op['task'] ?? [];
            if (!is_array($task)) {
                continue;
            }
            $id = trim((string)($task['id'] ?? ''));
            $title = trim((string)($task['title'] ?? ''));
            $priority = (string)($task['priority'] ?? 'low');
            $startDate = $task['start_date'] ?? null;
            $dueDate = $task['due_date'] ?? null;
            $completed = isset($task['completed']) ? (int)(bool)$task['completed'] : 0;
            $updatedAt = $task['updated_at'] ?? iso_now();
            if ($id === '' || $title === '' || !valid_priority($priority) || !valid_date($startDate) || !valid_date($dueDate)) {
                continue;
            }
            $existing = $db->prepare('SELECT created_at, updated_at FROM tasks WHERE id = :id');
            $existing->bindValue(':id', $id, SQLITE3_TEXT);
            $existingResult = $existing->execute();
            $row = $existingResult->fetchArray(SQLITE3_ASSOC);
            if ($row && strcmp((string)$row['updated_at'], (string)$updatedAt) > 0) {
                // Existing is newer, skip.
            } else {
                $createdAt = $row['created_at'] ?? ($task['created_at'] ?? iso_now());
                $stmt = $db->prepare('INSERT INTO tasks (id, title, priority, start_date, due_date, completed, created_at, updated_at)
                    VALUES (:id, :title, :priority, :start_date, :due_date, :completed, :created_at, :updated_at)
                    ON CONFLICT(id) DO UPDATE SET
                    title = excluded.title,
                    priority = excluded.priority,
                    start_date = excluded.start_date,
                    due_date = excluded.due_date,
                    completed = excluded.completed,
                    updated_at = excluded.updated_at');
                $stmt->bindValue(':id', $id, SQLITE3_TEXT);
                $stmt->bindValue(':title', $title, SQLITE3_TEXT);
                $stmt->bindValue(':priority', $priority, SQLITE3_TEXT);
                $stmt->bindValue(':start_date', $startDate ?: null, SQLITE3_TEXT);
                $stmt->bindValue(':due_date', $dueDate ?: null, SQLITE3_TEXT);
                $stmt->bindValue(':completed', $completed, SQLITE3_INTEGER);
                $stmt->bindValue(':created_at', $createdAt, SQLITE3_TEXT);
                $stmt->bindValue(':updated_at', $updatedAt, SQLITE3_TEXT);
                $stmt->execute();
            }
        } elseif ($type === 'toggle') {
            $id = trim((string)($op['id'] ?? ''));
            $completed = isset($op['completed']) ? (int)(bool)$op['completed'] : 0;
            $updatedAt = $op['updated_at'] ?? iso_now();
            if ($id !== '') {
                $stmt = $db->prepare('UPDATE tasks SET completed = :completed, updated_at = :updated_at WHERE id = :id');
                $stmt->bindValue(':completed', $completed, SQLITE3_INTEGER);
                $stmt->bindValue(':updated_at', $updatedAt, SQLITE3_TEXT);
                $stmt->bindValue(':id', $id, SQLITE3_TEXT);
                $stmt->execute();
            }
        } elseif ($type === 'delete') {
            $id = trim((string)($op['id'] ?? ''));
            if ($id !== '') {
                $stmt = $db->prepare('DELETE FROM tasks WHERE id = :id');
                $stmt->bindValue(':id', $id, SQLITE3_TEXT);
                $stmt->execute();
            }
        }
        $insertOp = $db->prepare('INSERT INTO ops (op_id, client_id, applied_at) VALUES (:op_id, :client_id, :applied_at)');
        $insertOp->bindValue(':op_id', $opId, SQLITE3_TEXT);
        $insertOp->bindValue(':client_id', $clientId, SQLITE3_TEXT);
        $insertOp->bindValue(':applied_at', iso_now(), SQLITE3_TEXT);
        $insertOp->execute();
        $applied++;
    }
    respond_ok(['applied' => $applied]);
}

respond_error('Unknown action', 'unknown_action', 404);
