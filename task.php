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
  <title>Task Details</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" />
  <link rel="stylesheet" href="/assets/styles.css" />
</head>
<body class="bg-light page-task">
  <nav class="navbar navbar-light bg-white mb-4">
    <div class="container d-flex justify-content-between align-items-center">
      <a href="/index.php" class="navbar-brand">Otodo</a>
      <div class="d-flex align-items-center gap-2">
        <span id="offline-indicator" class="badge bg-danger-subtle text-danger hidden">Offline</span>
        <span id="sync-indicator" class="badge bg-primary-subtle text-primary hidden">0 pending</span>
        <div class="dropdown">
          <button class="btn btn-outline-secondary btn-sm" type="button" id="taskMenu" data-bs-toggle="dropdown" aria-expanded="false">&#x2026;</button>
          <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="taskMenu">
            <li><button id="delete-task" type="button" class="dropdown-item text-danger">Delete</button></li>
          </ul>
        </div>
      </div>
    </div>
  </nav>

  <div id="offline-banner" class="offline-banner hidden" role="status">Offline mode</div>

  <div class="container task-container">
    <form id="edit-form" class="bg-light border-0 rounded-3 p-3 shadow-none" autocomplete="off">
      <div class="mb-3">
        <label class="form-label" for="edit-title">Title</label>
        <input id="edit-title" name="title" type="text" class="form-control" required autocapitalize="none" />
      </div>
      <div class="mb-3 d-flex flex-wrap align-items-end gap-3">
        <div>
          <label class="form-label" for="edit-due">Due Date</label>
          <input id="edit-due" name="due" type="date" class="form-control w-auto" />
        </div>
        <div class="form-check mb-2">
          <input class="form-check-input" type="checkbox" name="completed" id="edit-completed" />
          <label class="form-check-label" for="edit-completed">Completed</label>
        </div>
      </div>
      <div class="mb-3">
        <label class="form-label" for="edit-priority">Priority</label>
        <select id="edit-priority" name="priority" class="form-select w-auto">
          <option value="none">None</option>
          <option value="high">High</option>
          <option value="med">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>
      <div class="form-check form-switch mb-3">
        <input class="form-check-input" type="checkbox" name="star" id="edit-star" />
        <label class="form-check-label" for="edit-star">Star this task</label>
      </div>
      <div class="mb-3">
        <label class="form-label" for="edit-description">Description</label>
        <textarea id="edit-description" name="description" class="form-control" rows="4" spellcheck="false"></textarea>
      </div>
      <div class="d-flex align-items-center gap-2">
        <a href="/index.php" class="btn btn-secondary">Back</a>
      </div>
    </form>
    <p id="missing-task" class="empty hidden">Task not found.</p>
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
