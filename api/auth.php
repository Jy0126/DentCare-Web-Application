<?php
// Authentication API for DentCare
require_once 'db.php';

$data = json_decode(file_get_contents('php://input'), true);
$action = $data['action'] ?? $_GET['action'] ?? '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if ($action === 'login') {
        $email = strtolower(trim($data['email'] ?? ''));
        $password = $data['password'] ?? '';

        if (!$email || !$password) {
            http_response_code(400);
            echo json_encode(['error' => 'Email and password are required.']);
            exit;
        }

        // 1. Check Patients table
        $stmt = $pdo->prepare("SELECT * FROM patients WHERE email = ?");
        $stmt->execute([$email]);
        $user = $stmt->fetch();
        if ($user && password_verify($password, $user['password_hash'])) {
            $_SESSION['user_id'] = $user['patient_id'];
            $_SESSION['email'] = $user['email'];
            $_SESSION['name'] = $user['first_name'] . ' ' . $user['last_name'];
            $_SESSION['role'] = 'patient';

            echo json_encode([
                'success' => true,
                'role' => 'patient',
                'name' => $_SESSION['name'],
                'user_id' => $_SESSION['user_id']
            ]);
            exit;
        }

        // 2. Check Dentists table
        $stmt = $pdo->prepare("SELECT * FROM dentists WHERE email = ?");
        $stmt->execute([$email]);
        $user = $stmt->fetch();
        if ($user && password_verify($password, $user['password_hash'])) {
            $_SESSION['user_id'] = $user['dentist_id'];
            $_SESSION['email'] = $user['email'];
            $_SESSION['name'] = 'Dr. ' . $user['first_name'] . ' ' . $user['last_name'];
            $_SESSION['role'] = 'dentist';

            echo json_encode([
                'success' => true,
                'role' => 'dentist',
                'name' => $_SESSION['name'],
                'user_id' => $_SESSION['user_id']
            ]);
            exit;
        }

        // 3. Check Staff/Admin table
        $stmt = $pdo->prepare("SELECT * FROM staff WHERE email = ?");
        $stmt->execute([$email]);
        $user = $stmt->fetch();
        if ($user && password_verify($password, $user['password_hash'])) {
            $userRole = strtolower($user['role']); // 'staff' or 'admin'
            $_SESSION['user_id'] = $user['staff_id'];
            $_SESSION['email'] = $user['email'];
            $_SESSION['name'] = $user['first_name'] . ' ' . $user['last_name'];
            $_SESSION['role'] = $userRole;

            echo json_encode([
                'success' => true,
                'role' => $userRole,
                'name' => $_SESSION['name'],
                'user_id' => $_SESSION['user_id']
            ]);
            exit;
        }

        http_response_code(401);
        echo json_encode(['error' => 'Invalid email or password.']);
        exit;
    }

    if ($action === 'register') {
        $first_name = trim($data['first_name'] ?? '');
        $last_name = trim($data['last_name'] ?? '');
        $email = strtolower(trim($data['email'] ?? ''));
        $password = $data['password'] ?? '';
        $phone_number = trim($data['phone_number'] ?? '');
        $date_of_birth = $data['date_of_birth'] ?? '';
        $gender = $data['gender'] ?? '';
        $address = trim($data['address'] ?? '');
        $emergency_contact = trim($data['emergency_contact'] ?? '');

        if (!$first_name || !$last_name || !$email || !$password || !$date_of_birth) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing required registration fields.']);
            exit;
        }

        // Check if email exists in any table
        $email_exists = false;
        foreach (['patients', 'dentists', 'staff'] as $table) {
            $stmt = $pdo->prepare("SELECT COUNT(*) FROM $table WHERE email = ?");
            $stmt->execute([$email]);
            if ($stmt->fetchColumn() > 0) {
                $email_exists = true;
                break;
            }
        }

        if ($email_exists) {
            http_response_code(400);
            echo json_encode(['error' => 'Email is already registered.']);
            exit;
        }

        // Insert patient
        $password_hash = password_hash($password, PASSWORD_BCRYPT);
        $stmt = $pdo->prepare("INSERT INTO patients (first_name, last_name, date_of_birth, gender, email, password_hash, phone_number, address, emergency_contact) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([$first_name, $last_name, $date_of_birth, $gender, $email, $password_hash, $phone_number, $address, $emergency_contact]);
        
        $patient_id = $pdo->lastInsertId();

        // Initialize empty medical history
        $stmt_med = $pdo->prepare("INSERT INTO medical_histories (patient_id) VALUES (?)");
        $stmt_med->execute([$patient_id]);

        // Auto-login patient
        $_SESSION['user_id'] = $patient_id;
        $_SESSION['email'] = $email;
        $_SESSION['name'] = $first_name . ' ' . $last_name;
        $_SESSION['role'] = 'patient';

        echo json_encode([
            'success' => true,
            'role' => 'patient',
            'name' => $_SESSION['name'],
            'user_id' => $patient_id
        ]);
        exit;
    }

    if ($action === 'logout') {
        session_unset();
        session_destroy();
        echo json_encode(['success' => true]);
        exit;
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if ($action === 'check') {
        if (isset($_SESSION['user_id']) && isset($_SESSION['role'])) {
            echo json_encode([
                'loggedIn' => true,
                'role' => $_SESSION['role'],
                'name' => $_SESSION['name'],
                'user_id' => $_SESSION['user_id'],
                'email' => $_SESSION['email']
            ]);
        } else {
            echo json_encode(['loggedIn' => false]);
        }
        exit;
    }
}

http_response_code(400);
echo json_encode(['error' => 'Invalid action or request method.']);
?>
