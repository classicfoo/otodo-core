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
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="csrf-token" content="<?php echo htmlspecialchars($csrfToken, ENT_QUOTES); ?>" />
  <title>Otodo</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" />
  <link rel="stylesheet" href="/assets/styles.css" />
</head>
<body class="bg-light page-index">
  <nav class="navbar navbar-light bg-white mb-4">
    <div class="container d-flex justify-content-between align-items-center">
      <span class="navbar-brand mb-0 h1">Otodo</span>
      <div class="d-flex align-items-center header-actions ms-auto">
        <div class="task-search" id="task-search" aria-expanded="false">
          <button class="search-toggle" type="button" id="task-search-toggle" aria-label="Search tasks">
            <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
              <path d="M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14z" />
              <path d="m15.75 15.75 4.25 4.25" />
            </svg>
          </button>
          <input type="text" id="task-search-input" class="search-input" placeholder="Search tasks…" aria-label="Search tasks" tabindex="-1" inputmode="search">
          <button class="search-clear" type="button" id="task-search-clear" aria-label="Clear search">&times;</button>
        </div>
        <button class="navbar-toggler" type="button" data-bs-toggle="offcanvas" data-bs-target="#menu" aria-controls="menu">
          <span class="navbar-toggler-icon"></span>
        </button>
      </div>
    </div>
  </nav>

  <div class="offcanvas offcanvas-start" tabindex="-1" id="menu" aria-labelledby="menuLabel">
    <div class="offcanvas-header">
      <h5 class="offcanvas-title" id="menuLabel">Menu</h5>
      <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
    </div>
    <div class="offcanvas-body">
      <p class="mb-4">Hello, <?php echo $currentUser ? htmlspecialchars($currentUser['email'], ENT_QUOTES, 'UTF-8') : 'Offline session'; ?></p>
      <div class="list-group">
        <a href="/index.php" class="list-group-item list-group-item-action" <?php echo $taskFilter === 'active' ? 'aria-current="page"' : ''; ?>>Active Tasks</a>
        <a href="/index.php?view=completed" class="list-group-item list-group-item-action" <?php echo $taskFilter === 'completed' ? 'aria-current="page"' : ''; ?>>Completed Tasks</a>
        <button type="button" class="list-group-item list-group-item-action text-start" id="clear-cache-btn">Clear cache</button>
        <form method="post" class="list-group-item list-group-item-action p-0" data-offline-logout="true">
          <input type="hidden" name="action" value="logout">
          <button type="submit" class="btn w-100 text-start">Logout</button>
        </form>
      </div>
      <div class="mt-3 small text-muted" id="sync-status" aria-live="polite">All changes saved</div>
    </div>
  </div>

  <div class="container">
    <form id="add-form" autocomplete="off" class="mb-3">
      <div class="input-group">
        <input id="title-input" name="title" type="text" class="form-control" placeholder="New task" required autocapitalize="none">
        <button class="btn btn-primary" type="submit">Add</button>
      </div>
    </form>
    <div id="task-body" class="list-group"></div>
    <p id="empty-state" class="empty">No tasks yet.</p>
  </div>

  <div id="toast" class="toast hidden"></div>

  <script>
    window.OTODO_CSRF = "<?php echo htmlspecialchars($csrfToken, ENT_QUOTES); ?>";
    window.OTODO_SERVER_AUTH = <?php echo $serverAuth ? 'true' : 'false'; ?>;
    window.OTODO_AUTH_GATE = 'app';
  </script>
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
  <script type="module" src="/assets/auth_offline.js"></script>
  <script type="module" src="/assets/app.js"></script>
</body>
</html>
