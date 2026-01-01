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
    <section class="controls">
      <form id="add-form" autocomplete="off">
        <input id="title-input" name="title" type="text" placeholder="New task" required />
        <button type="submit">Add</button>
      </form>
      <button id="clear-cache-btn" type="button">Clear cache</button>
    </section>

    <section class="list">
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Due</th>
          </tr>
        </thead>
        <tbody id="task-body"></tbody>
      </table>
      <p id="empty-state" class="empty">No tasks yet.</p>
    </section>
  </div>

  <div id="toast" class="toast hidden"></div>

  <script>
    window.OTODO_CSRF = "<?php echo htmlspecialchars($csrfToken, ENT_QUOTES); ?>";
  </script>
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
  <script type="module" src="/assets/app.js"></script>
</body>
</html>
