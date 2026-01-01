<?php
declare(strict_types=1);

session_start();

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
  <title>O2DO</title>
  <link rel="stylesheet" href="/assets/styles.css" />
</head>
<body>
  <div class="app">
    <header class="navbar">
      <div class="navbar-left">
        <a class="brand" href="/index.php">O2DO</a>
        <div class="status">
          <span id="offline-indicator" class="badge offline hidden">Offline</span>
          <span id="sync-indicator" class="badge sync hidden">0 pending</span>
        </div>
      </div>
      <div class="navbar-actions">
        <a class="back-link" href="/index.php">Back</a>
      </div>
    </header>

    <section class="controls editor">
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
        <div class="button-row">
          <button type="submit">Save</button>
          <button id="delete-task" type="button" class="danger">Delete</button>
        </div>
      </form>
      <p id="missing-task" class="empty hidden">Task not found.</p>
    </section>
  </div>

  <div id="toast" class="toast hidden"></div>

  <script>
    window.OTODO_CSRF = "<?php echo htmlspecialchars($csrfToken, ENT_QUOTES); ?>";
  </script>
  <script type="module" src="/assets/task.js"></script>
</body>
</html>
