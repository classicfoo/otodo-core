<?php
$includeAllTasksLink = $includeAllTasksLink ?? false;
$currentUser = $currentUser ?? null;
?>
<nav class="app-nav">
  <div class="nav-row">
    <div class="nav-left">
      <a class="app-brand" href="/index.php">Otodo</a>
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
        Hello,
        <span id="menu-user-email" data-server-email="<?php echo $currentUser ? htmlspecialchars($currentUser['email'], ENT_QUOTES, 'UTF-8') : ''; ?>">
          <?php echo $currentUser ? htmlspecialchars($currentUser['email'], ENT_QUOTES, 'UTF-8') : 'Offline session'; ?>
        </span>
      </p>
      <div class="menu-card">
        <?php if ($includeAllTasksLink): ?>
          <a class="menu-item" href="/index.php">All tasks</a>
        <?php endif; ?>
        <form method="post" class="menu-action" data-offline-logout="true">
          <input type="hidden" name="action" value="logout">
          <button type="submit">Logout</button>
        </form>
      </div>
      <p class="menu-footer">All changes saved</p>
    </div>
  </div>
</div>
<div id="offline-banner" class="offline-banner hidden" role="status">Offline mode</div>
