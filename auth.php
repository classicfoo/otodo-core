<?php
session_start();

$databaseDir = __DIR__ . '/data';
if (!is_dir($databaseDir)) {
    mkdir($databaseDir, 0777, true);
}

$databasePath = $databaseDir . '/app.db';
$db = new SQLite3($databasePath);
$db->exec('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL)');
$db->exec('CREATE TABLE IF NOT EXISTS auth_tokens (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, token_hash TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, last_used_at TEXT NOT NULL, revoked_at TEXT)');

$tableInfo = $db->query('PRAGMA table_info(users)');
$columns = [];
while ($column = $tableInfo->fetchArray(SQLITE3_ASSOC)) {
    $columns[] = $column['name'];
}
if (!in_array('first_name', $columns, true)) {
    $db->exec('ALTER TABLE users ADD COLUMN first_name TEXT NOT NULL DEFAULT ""');
}
if (!in_array('last_name', $columns, true)) {
    $db->exec('ALTER TABLE users ADD COLUMN last_name TEXT NOT NULL DEFAULT ""');
}
if (!in_array('line_rules_json', $columns, true)) {
    $db->exec('ALTER TABLE users ADD COLUMN line_rules_json TEXT');
}
if (!in_array('date_formats_json', $columns, true)) {
    $db->exec('ALTER TABLE users ADD COLUMN date_formats_json TEXT');
}
if (!in_array('date_color', $columns, true)) {
    $db->exec('ALTER TABLE users ADD COLUMN date_color TEXT');
}

function get_default_line_rules(): array
{
    return [
        ['prefix' => 'T ', 'label' => 'Task', 'color' => '#1D4ED8', 'className' => 'code-line-task'],
        ['prefix' => 'N ', 'label' => 'Note', 'color' => '#1E7A3E', 'className' => 'code-line-note'],
        ['prefix' => 'M ', 'label' => 'Milestone', 'color' => '#800000', 'className' => 'code-line-milestone'],
        ['prefix' => '# ', 'label' => 'Heading', 'color' => '#212529', 'weight' => '700', 'className' => 'code-line-heading'],
        ['prefix' => 'X ', 'label' => 'Done', 'color' => '#6C757D', 'className' => 'code-line-done'],
    ];
}

function sanitize_line_rules($rules): array
{
    if (!is_array($rules)) {
        return [];
    }

    $cleaned = [];
    foreach ($rules as $rule) {
        if (!is_array($rule)) {
            continue;
        }
        $prefix = isset($rule['prefix']) ? (string)$rule['prefix'] : '';
        if (trim($prefix) === '') {
            continue;
        }
        $label = isset($rule['label']) ? trim((string)$rule['label']) : '';
        $color = isset($rule['color']) ? strtoupper(trim((string)$rule['color'])) : '';
        if ($color !== '' && !preg_match('/^#[0-9A-F]{6}$/', $color)) {
            $color = '';
        }
        $weight = isset($rule['weight']) ? (string)$rule['weight'] : '';
        if ($weight !== '' && !in_array($weight, ['400', '700'], true)) {
            $weight = '';
        }
        $className = isset($rule['className']) ? trim((string)$rule['className']) : '';
        if ($className !== '' && !preg_match('/^[A-Za-z0-9_-]+$/', $className)) {
            $className = '';
        }

        $entry = ['prefix' => $prefix];
        if ($label !== '') {
            $entry['label'] = $label;
        }
        if ($color !== '') {
            $entry['color'] = $color;
        }
        if ($weight !== '') {
            $entry['weight'] = $weight;
        }
        if ($className !== '') {
            $entry['className'] = $className;
        }

        $cleaned[] = $entry;
        if (count($cleaned) >= 25) {
            break;
        }
    }

    return $cleaned;
}

function decode_line_rules_from_storage(?string $raw): array
{
    $decoded = json_decode((string)$raw, true);
    $rules = sanitize_line_rules($decoded);
    if (!$rules) {
        return get_default_line_rules();
    }
    return $rules;
}

function get_user_line_rules(SQLite3 $db, int $userId): array
{
    if ($userId <= 0) {
        return get_default_line_rules();
    }
    $stmt = $db->prepare('SELECT line_rules_json FROM users WHERE id = :id');
    $stmt->bindValue(':id', $userId, SQLITE3_INTEGER);
    $result = $stmt->execute();
    $row = $result ? $result->fetchArray(SQLITE3_ASSOC) : null;
    return decode_line_rules_from_storage($row['line_rules_json'] ?? null);
}

function save_user_line_rules(SQLite3 $db, int $userId, array $rules): bool
{
    if ($userId <= 0) {
        return false;
    }
    $sanitized = sanitize_line_rules($rules);
    if (!$sanitized) {
        $sanitized = get_default_line_rules();
    }
    $encoded = json_encode($sanitized, JSON_UNESCAPED_SLASHES);
    $stmt = $db->prepare('UPDATE users SET line_rules_json = :line_rules_json WHERE id = :id');
    $stmt->bindValue(':line_rules_json', $encoded, SQLITE3_TEXT);
    $stmt->bindValue(':id', $userId, SQLITE3_INTEGER);
    $result = $stmt->execute();
    return (bool)$result;
}

function get_default_date_formats(): array
{
    return [
        'DD MMM YYYY',
        'DD MMM YY',
        'DD/MM/YYYY',
        'DD/MM/YY',
        'DD-MM-YYYY',
        'DD-MM-YY',
    ];
}

function sanitize_date_formats_input($input): array
{
    if (is_string($input)) {
        $lines = preg_split('/\r\n|\r|\n/', $input);
    } elseif (is_array($input)) {
        $lines = $input;
    } else {
        $lines = [];
    }

    $cleaned = [];
    foreach ($lines as $line) {
        $format = trim((string)$line);
        if ($format === '') {
            continue;
        }
        if (!preg_match('/(DD|D|MMMM|MMM|MM|M|YYYY|YY)/', $format)) {
            continue;
        }
        $cleaned[] = mb_substr($format, 0, 60);
    }

    $unique = array_values(array_unique($cleaned));
    if (!$unique) {
        return get_default_date_formats();
    }
    return $unique;
}

function decode_date_formats_from_storage(?string $value): array
{
    if (!$value) {
        return get_default_date_formats();
    }
    $decoded = json_decode($value, true);
    if (!is_array($decoded)) {
        return get_default_date_formats();
    }
    return sanitize_date_formats_input($decoded);
}

function save_user_date_formats(SQLite3 $db, int $userId, array $formats): bool
{
    if ($userId <= 0) {
        return false;
    }
    $sanitized = sanitize_date_formats_input($formats);
    $encoded = json_encode(array_values($sanitized), JSON_UNESCAPED_SLASHES);
    $stmt = $db->prepare('UPDATE users SET date_formats_json = :date_formats_json WHERE id = :id');
    $stmt->bindValue(':date_formats_json', $encoded, SQLITE3_TEXT);
    $stmt->bindValue(':id', $userId, SQLITE3_INTEGER);
    $result = $stmt->execute();
    return (bool)$result;
}

function get_user_date_formats(SQLite3 $db, int $userId): array
{
    if ($userId <= 0) {
        return get_default_date_formats();
    }
    $stmt = $db->prepare('SELECT date_formats_json FROM users WHERE id = :id');
    $stmt->bindValue(':id', $userId, SQLITE3_INTEGER);
    $result = $stmt->execute();
    $row = $result ? $result->fetchArray(SQLITE3_ASSOC) : null;
    return decode_date_formats_from_storage($row['date_formats_json'] ?? null);
}

function normalize_hex_color(string $color, string $default = '#FDA90D'): string
{
    $value = strtoupper(trim($color));
    if (!preg_match('/^#[0-9A-F]{6}$/', $value)) {
        return strtoupper($default);
    }
    return $value;
}

function get_user_date_color(SQLite3 $db, int $userId): string
{
    if ($userId <= 0) {
        return '#FDA90D';
    }
    $stmt = $db->prepare('SELECT date_color FROM users WHERE id = :id');
    $stmt->bindValue(':id', $userId, SQLITE3_INTEGER);
    $result = $stmt->execute();
    $row = $result ? $result->fetchArray(SQLITE3_ASSOC) : null;
    return normalize_hex_color((string)($row['date_color'] ?? ''), '#FDA90D');
}

function save_user_date_color(SQLite3 $db, int $userId, string $color): bool
{
    if ($userId <= 0) {
        return false;
    }
    $normalized = normalize_hex_color($color, '#FDA90D');
    $stmt = $db->prepare('UPDATE users SET date_color = :date_color WHERE id = :id');
    $stmt->bindValue(':date_color', $normalized, SQLITE3_TEXT);
    $stmt->bindValue(':id', $userId, SQLITE3_INTEGER);
    $result = $stmt->execute();
    return (bool)$result;
}

function handle_register(SQLite3 $db, string $email, string $firstName, string $lastName, string $password): array
{
    $errors = [];
    $successMessage = '';

    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $errors[] = 'Please provide a valid email address.';
    }

    if ($firstName === '') {
        $errors[] = 'Please provide your first name.';
    }

    if ($lastName === '') {
        $errors[] = 'Please provide your last name.';
    }

    if (strlen($password) < 8) {
        $errors[] = 'Password must be at least 8 characters.';
    }

    if (!$errors) {
        $statement = $db->prepare('SELECT id FROM users WHERE email = :email');
        $statement->bindValue(':email', $email, SQLITE3_TEXT);
        $result = $statement->execute();
        if ($result->fetchArray(SQLITE3_ASSOC)) {
            $errors[] = 'An account with that email already exists.';
        } else {
            $hash = password_hash($password, PASSWORD_DEFAULT);
            $insert = $db->prepare('INSERT INTO users (email, first_name, last_name, password_hash, created_at) VALUES (:email, :first_name, :last_name, :hash, :created_at)');
            $insert->bindValue(':email', $email, SQLITE3_TEXT);
            $insert->bindValue(':first_name', $firstName, SQLITE3_TEXT);
            $insert->bindValue(':last_name', $lastName, SQLITE3_TEXT);
            $insert->bindValue(':hash', $hash, SQLITE3_TEXT);
            $insert->bindValue(':created_at', gmdate('Y-m-d H:i:s'), SQLITE3_TEXT);
            if ($insert->execute()) {
                $successMessage = 'Account created! You can now log in.';
            } else {
                $errors[] = 'Unable to create account. Please try again.';
            }
        }
    }

    return [$errors, $successMessage];
}

const REMEMBER_COOKIE = 'otodo_remember';
const REMEMBER_TOKEN_BYTES = 32;
const REMEMBER_TTL_SECONDS = 2592000;

function set_remember_cookie(int $tokenId, string $tokenSecret, int $expiresAt): void
{
    $secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    setcookie(REMEMBER_COOKIE, $tokenId . '.' . $tokenSecret, [
        'expires' => $expiresAt,
        'path' => '/',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function clear_remember_cookie(): void
{
    $secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    setcookie(REMEMBER_COOKIE, '', [
        'expires' => time() - 3600,
        'path' => '/',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function parse_remember_cookie(?string $cookie): ?array
{
    if (!$cookie) {
        return null;
    }
    $parts = explode('.', $cookie, 2);
    if (count($parts) !== 2) {
        return null;
    }
    if (!ctype_digit($parts[0])) {
        return null;
    }
    $tokenId = (int)$parts[0];
    $tokenSecret = trim($parts[1]);
    if ($tokenId <= 0 || $tokenSecret === '') {
        return null;
    }
    return ['id' => $tokenId, 'secret' => $tokenSecret];
}

function create_auth_token(SQLite3 $db, int $userId): array
{
    $tokenSecret = bin2hex(random_bytes(REMEMBER_TOKEN_BYTES));
    $tokenHash = hash('sha256', $tokenSecret);
    $createdAt = gmdate('Y-m-d H:i:s');
    $expiresAt = gmdate('Y-m-d H:i:s', time() + REMEMBER_TTL_SECONDS);
    $insert = $db->prepare('INSERT INTO auth_tokens (user_id, token_hash, created_at, expires_at, last_used_at) VALUES (:user_id, :token_hash, :created_at, :expires_at, :last_used_at)');
    $insert->bindValue(':user_id', $userId, SQLITE3_INTEGER);
    $insert->bindValue(':token_hash', $tokenHash, SQLITE3_TEXT);
    $insert->bindValue(':created_at', $createdAt, SQLITE3_TEXT);
    $insert->bindValue(':expires_at', $expiresAt, SQLITE3_TEXT);
    $insert->bindValue(':last_used_at', $createdAt, SQLITE3_TEXT);
    $insert->execute();
    $tokenId = (int)$db->lastInsertRowID();

    return [
        'id' => $tokenId,
        'secret' => $tokenSecret,
        'expires_at' => $expiresAt,
    ];
}

function revoke_auth_token(SQLite3 $db, int $tokenId): void
{
    $revoke = $db->prepare('UPDATE auth_tokens SET revoked_at = :revoked_at WHERE id = :id AND revoked_at IS NULL');
    $revoke->bindValue(':revoked_at', gmdate('Y-m-d H:i:s'), SQLITE3_TEXT);
    $revoke->bindValue(':id', $tokenId, SQLITE3_INTEGER);
    $revoke->execute();
}

function handle_login(SQLite3 $db, string $email, string $password, bool $rememberMe): array
{
    $errors = [];
    $successMessage = '';

    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $errors[] = 'Please provide a valid email address.';
    }

    if ($password === '') {
        $errors[] = 'Please enter your password.';
    }

    if (!$errors) {
        $statement = $db->prepare('SELECT id, email, first_name, last_name, password_hash FROM users WHERE email = :email');
        $statement->bindValue(':email', $email, SQLITE3_TEXT);
        $result = $statement->execute();
        $user = $result->fetchArray(SQLITE3_ASSOC);
        if (!$user || !password_verify($password, $user['password_hash'])) {
            $errors[] = 'Invalid email or password.';
        } else {
            $_SESSION['user'] = [
                'id' => $user['id'],
                'email' => $user['email'],
                'first_name' => $user['first_name'],
                'last_name' => $user['last_name'],
            ];
            if ($rememberMe) {
                $token = create_auth_token($db, (int)$user['id']);
                set_remember_cookie($token['id'], $token['secret'], time() + REMEMBER_TTL_SECONDS);
            } else {
                $parsedCookie = parse_remember_cookie($_COOKIE[REMEMBER_COOKIE] ?? null);
                if ($parsedCookie) {
                    revoke_auth_token($db, $parsedCookie['id']);
                }
                clear_remember_cookie();
            }
            $successMessage = 'Welcome back! You are now signed in.';
        }
    }

    return [$errors, $successMessage];
}

function handle_logout(SQLite3 $db): string
{
    $parsedCookie = parse_remember_cookie($_COOKIE[REMEMBER_COOKIE] ?? null);
    if ($parsedCookie) {
        revoke_auth_token($db, $parsedCookie['id']);
    }
    clear_remember_cookie();
    $_SESSION = [];
    if (session_id() !== '' || isset($_COOKIE[session_name()])) {
        setcookie(session_name(), '', time() - 3600, '/');
    }
    session_destroy();

    return 'You have been signed out.';
}

function current_user(): ?array
{
    return $_SESSION['user'] ?? null;
}

function attempt_remembered_login(SQLite3 $db): void
{
    if (!empty($_SESSION['user'])) {
        return;
    }
    $parsed = parse_remember_cookie($_COOKIE[REMEMBER_COOKIE] ?? null);
    if (!$parsed) {
        return;
    }
    $lookup = $db->prepare('SELECT id, user_id, token_hash, expires_at, revoked_at FROM auth_tokens WHERE id = :id');
    $lookup->bindValue(':id', $parsed['id'], SQLITE3_INTEGER);
    $token = $lookup->execute()->fetchArray(SQLITE3_ASSOC);
    if (!$token || $token['revoked_at']) {
        clear_remember_cookie();
        return;
    }
    $now = gmdate('Y-m-d H:i:s');
    if ($token['expires_at'] <= $now) {
        revoke_auth_token($db, (int)$parsed['id']);
        clear_remember_cookie();
        return;
    }
    $computedHash = hash('sha256', $parsed['secret']);
    if (!hash_equals($token['token_hash'], $computedHash)) {
        revoke_auth_token($db, (int)$parsed['id']);
        clear_remember_cookie();
        return;
    }
    $userLookup = $db->prepare('SELECT id, email, first_name, last_name FROM users WHERE id = :id');
    $userLookup->bindValue(':id', (int)$token['user_id'], SQLITE3_INTEGER);
    $user = $userLookup->execute()->fetchArray(SQLITE3_ASSOC);
    if (!$user) {
        revoke_auth_token($db, (int)$parsed['id']);
        clear_remember_cookie();
        return;
    }

    $_SESSION['user'] = [
        'id' => $user['id'],
        'email' => $user['email'],
        'first_name' => $user['first_name'],
        'last_name' => $user['last_name'],
    ];

    $touch = $db->prepare('UPDATE auth_tokens SET last_used_at = :last_used_at, revoked_at = :revoked_at WHERE id = :id');
    $touch->bindValue(':last_used_at', $now, SQLITE3_TEXT);
    $touch->bindValue(':revoked_at', $now, SQLITE3_TEXT);
    $touch->bindValue(':id', (int)$parsed['id'], SQLITE3_INTEGER);
    $touch->execute();

    $newToken = create_auth_token($db, (int)$user['id']);
    set_remember_cookie($newToken['id'], $newToken['secret'], time() + REMEMBER_TTL_SECONDS);
}

attempt_remembered_login($db);
