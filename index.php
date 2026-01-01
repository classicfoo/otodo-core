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
  <script type="module" src="/assets/app.js"></script>
</body>
</html>
