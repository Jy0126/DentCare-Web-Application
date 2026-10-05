<?php
// Secure Database Connection & Common Helpers for DentCare
//
// ═══════════════════════════════════════════════════════════════════════════
// THIS API IS DISABLED. It is dead code that was still reachable.
// ═══════════════════════════════════════════════════════════════════════════
//
// Nothing in DentCare calls these scripts. The browser app initialises
// Firebase in js/app.js and the Flutter app uses cloud_firestore; neither has
// a single fetch() or http call pointed at this directory. This layer was
// written for a MySQL backend the project moved off.
//
// It was, however, still being served. The folder is inside XAMPP's htdocs,
// so it answered requests — and what it answered with was this:
//
//   • No sign-in check anywhere. Not one endpoint calls require_role(), and
//     none reads $_SESSION before acting. require_role() is defined at the
//     bottom of this file and has never been called.
//   • No ownership check. api/records.php?patient_id=5 returned patient 5's
//     medical history to anybody who asked. That is every patient's history,
//     one integer at a time.
//   • Destructive verbs wide open. api/inventory.php deletes a row on
//     request, api/billing.php rewrites an invoice, api/appointments.php
//     changes a status — all for an anonymous caller.
//   • Access-Control-Allow-Origin: * with cookie-backed sessions, so any
//     website open in the same browser could call it.
//   • The PDO error was echoed to the client on failure, which prints the
//     database name and often the credentials path.
//
// Every one of those is closed by refusing to run. Each endpoint's first
// statement is require_once 'db.php', so this single guard shuts all five.
//
// The queries themselves were parameterised, so SQL injection was not the
// problem here — missing authorisation was. Do not read the prepare() calls
// as evidence the file was safe.
//
// ── IF YOU WANT THIS BACK ──────────────────────────────────────────────────
// Do not just delete the guard. The endpoints need, at minimum: a session
// check on every action, require_role() on every action, an ownership check
// on every ID taken from the request, a fixed CORS origin, and a database
// user that is not root. Until that work is done this file staying shut is
// the only thing making the directory safe.
//
// Deleting api/ and database/schema.sql outright is also a fine answer, and
// is what you should do if the MySQL backend is not coming back.

if (!defined('DENTCARE_API_DELIBERATELY_ENABLED')) {
    http_response_code(410);
    header('Content-Type: application/json');
    // No detail. An error that names the database or the reason is a free
    // reconnaissance answer for whoever is probing.
    echo json_encode(['error' => 'This endpoint has been retired.']);
    exit;
}

$host     = 'localhost';
$db_name  = 'dentcare_db';
$username = 'root';
$password = ''; // XAMPP default
$port     = '3306';

try {
    $pdo = new PDO("mysql:host=$host;port=$port;dbname=$db_name;charset=utf8", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
} catch (PDOException $e) {
    http_response_code(500);
    // The message goes to the log, not to the client. PDO's connection error
    // quotes the host, the database name and sometimes the user, which tells
    // an attacker what to aim at next.
    error_log('DentCare DB connection failed: ' . $e->getMessage());
    echo json_encode(['error' => 'Database unavailable.']);
    exit;
}

// Secure Session Initialization
if (session_status() === PHP_SESSION_NONE) {
    $is_secure = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') 
              || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');
    
    session_set_cookie_params([
        'httponly' => true,
        'secure'   => $is_secure,
        'samesite' => 'Strict'
    ]);
    session_start();
}

// CORS Headers
//
// The origin is an allow-list, not '*'. A wildcard here was actively unsafe:
// these endpoints authenticate with a session cookie, so any page the user had
// open could call them and read the reply in the user's name. A wildcard and
// credentials are also mutually exclusive per the CORS spec — browsers refuse
// the pair — so the old header was both dangerous and broken.
header('Content-Type: application/json');

$allowed_origins = [
    'http://localhost',
    'http://localhost:80',
    'http://127.0.0.1',
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowed_origins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Credentials: true');
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

// Handle OPTIONS preflight request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Security Headers
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('X-XSS-Protection: 1; mode=block');

// Helper to enforce session role requirements
function require_role($allowed_roles) {
    $role = $_SESSION['role'] ?? '';
    if (!in_array($role, $allowed_roles)) {
        http_response_code(403);
        echo json_encode(['error' => 'Forbidden. Unauthorized access.']);
        exit;
    }
}
?>
