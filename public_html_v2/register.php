<?php
/**
 * Usmani Cricket Academy: registration form handler.
 *
 * Every registration is appended to data/registrations.csv (blocked from the
 * web by data/.htaccess) and, if the server can send mail, emailed to
 * REGISTRATION_TO. Responds with JSON for fetch() requests and redirects back
 * to the page for plain form posts.
 */

// PLACEHOLDER: change to the inbox that should receive registrations.
const REGISTRATION_TO   = 'usmanicricketacademy@gmail.com';
// Sender must be an address on your own domain or many hosts reject the mail.
const REGISTRATION_FROM = 'no-reply@example.com';

const BATCHES = [
    'Precinct 2 - All ages',
    'Diamond - Precinct 12 (Under 14)',
    'Platinum - Precinct 12 (14+)',
];

$wantsJson = isset($_SERVER['HTTP_ACCEPT']) && strpos($_SERVER['HTTP_ACCEPT'], 'application/json') !== false;

function respond($ok, $message, $code = 200)
{
    global $wantsJson;
    if ($wantsJson) {
        http_response_code($code);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => $ok, 'message' => $message]);
    } else {
        header('Location: index.html' . ($ok ? '?registered=1' : '') . '#register', true, 303);
    }
    exit;
}

function field($name, $max = 200)
{
    $v = isset($_POST[$name]) ? trim((string) $_POST[$name]) : '';
    $v = preg_replace('/[\r\n\t]+/', ' ', $v);          // no header injection / CSV breaks
    return mb_substr($v, 0, $max, 'UTF-8');
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(false, 'Method not allowed.', 405);
}

// Honeypot: bots fill every field. Pretend success.
if (field('website') !== '') {
    respond(true, 'Thank you!');
}

$data = [
    'name'     => field('name', 100),
    'age'      => field('age', 3),
    'phone'    => field('phone', 20),
    'guardian' => field('guardian', 100),
    'email'    => field('email', 120),
    'batch'    => field('batch', 60),
    'message'  => field('message', 1000),
];

$errors = [];
if ($data['name'] === '')                                            $errors[] = 'name';
if (!ctype_digit($data['age']) || $data['age'] < 4 || $data['age'] > 60) $errors[] = 'age';
if (!preg_match('/^[+\d][\d\s-]{9,18}$/', $data['phone']))           $errors[] = 'phone';
if ($data['email'] !== '' && !filter_var($data['email'], FILTER_VALIDATE_EMAIL)) $errors[] = 'email';
if (!in_array($data['batch'], BATCHES, true))                        $errors[] = 'batch';

if ($errors) {
    respond(false, 'Please check: ' . implode(', ', $errors) . '.', 422);
}

/* ---------- Save to CSV ---------- */
$dir = __DIR__ . '/data';
if (!is_dir($dir)) {
    @mkdir($dir, 0750, true);
}
$file = $dir . '/registrations.csv';
$isNew = !file_exists($file);
$saved = false;
if ($fh = @fopen($file, 'a')) {
    if (flock($fh, LOCK_EX)) {
        if ($isNew) {
            fputcsv($fh, ['date', 'name', 'age', 'phone', 'guardian', 'email', 'batch', 'message', 'ip']);
        }
        // Leading = + - @ would be run as formulas when opened in Excel
        $row = array_map(function ($v) {
            return preg_match('/^[=+\-@]/', $v) ? "'" . $v : $v;
        }, array_values($data));
        array_unshift($row, date('Y-m-d H:i:s'));
        $row[] = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '';
        $saved = fputcsv($fh, $row) !== false;
        flock($fh, LOCK_UN);
    }
    fclose($fh);
}

/* ---------- Email ---------- */
$body = "New registration - Usmani Cricket Academy\n\n"
      . "Player:   {$data['name']}\n"
      . "Age:      {$data['age']}\n"
      . "Phone:    {$data['phone']}\n"
      . "Guardian: {$data['guardian']}\n"
      . "Email:    {$data['email']}\n"
      . "Batch:    {$data['batch']}\n\n"
      . "Message:\n{$data['message']}\n";

$headers = 'From: Usmani Cricket Academy <' . REGISTRATION_FROM . ">\r\n"
         . "Content-Type: text/plain; charset=UTF-8\r\n";
if ($data['email'] !== '') {
    $headers .= 'Reply-To: ' . $data['email'] . "\r\n";
}
$mailed = @mail(REGISTRATION_TO, 'New registration: ' . $data['name'] . ' (' . $data['batch'] . ')', $body, $headers);

if (!$saved && !$mailed) {
    respond(false, 'Could not save your registration. Please call +92 300 938 2539.', 500);
}

respond(true, 'Thank you, ' . $data['name'] . '! We will call you shortly to confirm your batch.');
