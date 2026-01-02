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
  $includeAllTasksLink = false;
  include __DIR__ . '/app_nav.php';
  ?>
  <div class="app">
    <section class="controls">
      <form id="add-form" autocomplete="off">
        <input id="title-input" name="title" type="text" placeholder="New task" required />
        <button type="submit">Add</button>
      </form>
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
    window.OTODO_SERVER_AUTH = <?php echo $serverAuth ? 'true' : 'false'; ?>;
    window.OTODO_AUTH_GATE = 'app';
  </script>
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
  <script type="module" src="/assets/auth_offline.js"></script>
  <script type="module" src="/assets/app.js"></script>
</body>
</html>
