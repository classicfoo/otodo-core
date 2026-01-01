<?php
require __DIR__ . '/auth.php';

$errors = [];
$email = '';
$rememberMe = false;

$action = $_POST['action'] ?? null;

if ($action === 'login') {
    $email = trim($_POST['email'] ?? '');
    $password = $_POST['password'] ?? '';
    $rememberMe = !empty($_POST['remember_me']);
    [$errors, $successMessage] = handle_login($db, $email, $password, $rememberMe);
    if (!$errors) {
        $currentUser = current_user();
        $offlineLoginPayload = [
            'user' => [
                'id' => $currentUser['id'],
                'email' => $currentUser['email'],
            ],
            'issued_at' => gmdate('c'),
        ];
    }
} elseif ($action === 'logout') {
    $successMessage = handle_logout($db);
}

$currentUser = current_user();

$pageTitle = 'Log in';
$pageHeading = 'Welcome back';
$pageHint = 'Sign in to access your Otodo tasks.';

include __DIR__ . '/auth_header.php';
?>

<?php if (!empty($successMessage ?? '')): ?>
  <div class="alert alert-success" role="alert">
    <?php echo htmlspecialchars($successMessage, ENT_QUOTES, 'UTF-8'); ?>
  </div>
<?php endif; ?>

<?php if ($errors): ?>
  <div class="alert alert-danger" role="alert">
    <ul class="mb-0">
      <?php foreach ($errors as $error): ?>
        <li><?php echo htmlspecialchars($error, ENT_QUOTES, 'UTF-8'); ?></li>
      <?php endforeach; ?>
    </ul>
  </div>
<?php endif; ?>

<?php if ($currentUser): ?>
  <section class="surface">
    <h2 class="h5">You are signed in</h2>
    <p class="mb-1"><strong>Email:</strong> <?php echo htmlspecialchars($currentUser['email'], ENT_QUOTES, 'UTF-8'); ?></p>
    <p class="hint mb-3">Continue to your tasks or sign out to switch accounts.</p>
    <div class="d-flex flex-wrap gap-2">
      <a class="btn btn-neutral" href="index.php">Go to app</a>
      <form method="post" data-offline-logout="true">
        <input type="hidden" name="action" value="logout">
        <button type="submit" class="btn btn-outline-dark">Log out</button>
      </form>
    </div>
    <div class="divider"></div>
    <p class="hint mb-0">Need a new account? <a href="register.php">Register here</a>.</p>
  </section>
<?php else: ?>
  <section class="surface">
    <h2 class="h5">Log in</h2>
    <p class="hint">Enter your email and password.</p>
    <div id="offline-login-error" class="alert alert-danger hidden" role="alert"></div>
    <form method="post" class="d-grid gap-3" id="login-form">
      <input type="hidden" name="action" value="login">
      <div>
        <label class="form-label" for="login-email">Email</label>
        <input class="form-control" type="email" id="login-email" name="email" value="<?php echo htmlspecialchars($email, ENT_QUOTES, 'UTF-8'); ?>" required>
      </div>
      <div>
        <label class="form-label" for="login-password">Password</label>
        <input class="form-control" type="password" id="login-password" name="password" required>
      </div>
      <div class="form-check">
        <input class="form-check-input" type="checkbox" id="login-remember" name="remember_me" value="1" <?php echo $rememberMe ? 'checked' : ''; ?>>
        <label class="form-check-label" for="login-remember">Remember me</label>
      </div>
      <button type="submit" class="btn btn-neutral">Sign in</button>
    </form>
    <div class="divider"></div>
    <p class="hint mb-0">Need an account? <a href="register.php">Create one</a>.</p>
  </section>
<?php endif; ?>

<?php
if (!empty($offlineLoginPayload ?? null)) {
    $payloadJson = json_encode($offlineLoginPayload, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT);
    echo "<script>window.OTODO_LOGIN_PAYLOAD = {$payloadJson};</script>";
}
?>
<script>
  window.OTODO_AUTH_GATE = 'login';
</script>
<script type="module" src="/assets/auth_offline.js"></script>
<?php
include __DIR__ . '/auth_footer.php';
?>
