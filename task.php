<?php
declare(strict_types=1);

require __DIR__ . '/auth.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'logout') {
    handle_logout();
    header('Location: login.php');
    exit;
}

$currentUser = current_user();
if (!$currentUser) {
    header('Location: login.php');
    exit;
}

if (!isset($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}
$csrfToken = $_SESSION['csrf_token'];
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
<body>
  <nav class="app-nav">
    <div class="nav-row">
      <div class="nav-left">
        <a class="app-brand" href="/index.php">commit</a>
        <div class="status">
          <span id="offline-indicator" class="badge offline hidden">Offline</span>
          <span id="sync-indicator" class="badge sync hidden">0 pending</span>
        </div>
      </div>
      <button class="btn btn-outline-dark btn-sm" type="button" data-bs-toggle="offcanvas" data-bs-target="#mainMenu" aria-controls="mainMenu">
        <span class="visually-hidden">Open menu</span>
        ☰
      </button>
    </div>
  </nav>
  <div class="offcanvas offcanvas-end" tabindex="-1" id="mainMenu" aria-labelledby="mainMenuLabel">
    <div class="offcanvas-header">
      <h5 class="offcanvas-title" id="mainMenuLabel">Menu</h5>
      <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
    </div>
    <div class="offcanvas-body">
      <div class="menu-panel">
        <p class="menu-greeting">
          Hello, <?php echo htmlspecialchars($currentUser['email'], ENT_QUOTES, 'UTF-8'); ?>
        </p>
        <div class="menu-card">
          <a class="menu-item" href="/index.php">All tasks</a>
          <form method="post" class="menu-action">
            <input type="hidden" name="action" value="logout">
            <button type="submit">Logout</button>
          </form>
        </div>
        <p class="menu-footer">All changes saved</p>
      </div>
    </div>
  </div>
  <div class="app">

    <section class="controls editor">
      <details class="editor-menu">
        <summary class="menu-trigger" aria-label="Task options">…</summary>
        <div class="menu-panel">
          <button id="delete-task" type="button" class="menu-delete">Delete</button>
        </div>
      </details>
      <form id="edit-form" class="edit-form" autocomplete="off">
        <label>
          Title
          <input id="edit-title" name="title" type="text" required />
        </label>
        <label>
          Due date
          <input id="edit-due" name="due" type="date" />
        </label>
        <label class="checkbox-field">
          <input id="edit-completed" name="completed" type="checkbox" />
          Completed
        </label>
      </form>
      <p id="missing-task" class="empty hidden">Task not found.</p>
    </section>
  </div>

  <div id="toast" class="toast hidden"></div>

  <script>
    window.OTODO_CSRF = "<?php echo htmlspecialchars($csrfToken, ENT_QUOTES); ?>";
  </script>
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
  <script type="module" src="/assets/task.js"></script>
</body>
</html>
