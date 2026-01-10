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
$taskFilter = ($_GET['view'] ?? 'all') === 'completed' ? 'completed' : 'all';
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
  <?php
  include __DIR__ . '/app_nav.php';
  ?>
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
          Description
          <textarea id="edit-description" name="description" rows="4"></textarea>
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
    window.OTODO_SERVER_AUTH = <?php echo $serverAuth ? 'true' : 'false'; ?>;
    window.OTODO_AUTH_GATE = 'app';
  </script>
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
  <script type="module" src="/assets/auth_offline.js"></script>
  <script type="module" src="/assets/task.js"></script>
</body>
</html>
