<?php
// Records & Charting API for DentCare
require_once 'db.php';

$data = json_decode(file_get_contents('php://input'), true);
$action = $data['action'] ?? $_GET['action'] ?? '';

// Check if user is logged in
if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized. Please log in first.']);
    exit;
}

$user_id = $_SESSION['user_id'];
$role = $_SESSION['role'];

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // 1. Get Medical History (Patients can get their own, Dentists/Staff can get any patient's)
    if ($action === 'get_medical_history') {
        $patient_id = (int)($_GET['patient_id'] ?? 0);
        if ($role === 'patient') {
            $patient_id = $user_id; // Patients can only access their own
        }

        if (!$patient_id) {
            http_response_code(400);
            echo json_encode(['error' => 'Patient ID is required.']);
            exit;
        }

        $stmt = $pdo->prepare("SELECT * FROM medical_histories WHERE patient_id = ?");
        $stmt->execute([$patient_id]);
        $history = $stmt->fetch();

        if (!$history) {
            // Initialize if not exists
            $stmt_init = $pdo->prepare("INSERT INTO medical_histories (patient_id) VALUES (?)");
            $stmt_init->execute([$patient_id]);
            
            $stmt->execute([$patient_id]);
            $history = $stmt->fetch();
        }

        echo json_encode($history);
        exit;
    }

    // 2. Get Teeth Charting Status (Dentist & Patient can view)
    if ($action === 'get_teeth_status') {
        $patient_id = (int)($_GET['patient_id'] ?? 0);
        if ($role === 'patient') {
            $patient_id = $user_id;
        }

        if (!$patient_id) {
            http_response_code(400);
            echo json_encode(['error' => 'Patient ID is required.']);
            exit;
        }

        $stmt = $pdo->prepare("SELECT tooth_number, condition_status, notes FROM teeth_status WHERE patient_id = ?");
        $stmt->execute([$patient_id]);
        echo json_encode($stmt->fetchAll());
        exit;
    }

    // 3. Get Patient Treatment Records (Clinical Logs)
    if ($action === 'patient_history') {
        $patient_id = (int)($_GET['patient_id'] ?? 0);
        if ($role === 'patient') {
            $patient_id = $user_id;
        }

        if (!$patient_id) {
            http_response_code(400);
            echo json_encode(['error' => 'Patient ID is required.']);
            exit;
        }

        $stmt = $pdo->prepare("
            SELECT r.*, t.treatment_name, d.first_name AS dentist_first, d.last_name AS dentist_last 
            FROM dental_records r
            JOIN treatments t ON r.treatment_id = t.treatment_id
            JOIN dentists d ON r.dentist_id = d.dentist_id
            WHERE r.patient_id = ?
            ORDER BY r.record_date DESC, r.created_at DESC
        ");
        $stmt->execute([$patient_id]);
        echo json_encode($stmt->fetchAll());
        exit;
    }

    // 4. Search Patients (Dentists & Staff only)
    if ($action === 'search_patients') {
        if ($role === 'patient') {
            http_response_code(403);
            echo json_encode(['error' => 'Unauthorized.']);
            exit;
        }

        $query = '%' . ($data['query'] ?? $_GET['query'] ?? '') . '%';
        $stmt = $pdo->prepare("
            SELECT patient_id, first_name, last_name, email, phone_number, date_of_birth, gender 
            FROM patients 
            WHERE first_name LIKE ? OR last_name LIKE ? OR email LIKE ?
            ORDER BY last_name ASC, first_name ASC
        ");
        $stmt->execute([$query, $query, $query]);
        echo json_encode($stmt->fetchAll());
        exit;
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // 1. Save Medical History (Patient updates their own, staff/dentist can save it too)
    if ($action === 'save_medical_history') {
        $patient_id = (int)($data['patient_id'] ?? 0);
        if ($role === 'patient') {
            $patient_id = $user_id;
        }

        if (!$patient_id) {
            http_response_code(400);
            echo json_encode(['error' => 'Patient ID is required.']);
            exit;
        }

        $good_health = (int)($data['good_health'] ?? 0);
        $under_medical_treatment = (int)($data['under_medical_treatment'] ?? 0);
        $medical_treatment_details = trim($data['medical_treatment_details'] ?? '');
        $serious_illness_or_operation = (int)($data['serious_illness_or_operation'] ?? 0);
        $illness_or_operation_details = trim($data['illness_or_operation_details'] ?? '');
        $hospitalized = (int)($data['hospitalized'] ?? 0);
        $hospitalization_details = trim($data['hospitalization_details'] ?? '');
        $prescribed_medicine = (int)($data['prescribed_medicine'] ?? 0);
        $prescribed_medicine_details = trim($data['prescribed_medicine_details'] ?? '');
        $tobacco_use = (int)($data['tobacco_use'] ?? 0);
        $drugs_alcohol_use = (int)($data['drugs_alcohol_use'] ?? 0);
        $allergies = is_array($data['allergies'] ?? null) ? json_encode($data['allergies']) : ($data['allergies'] ?? '[]');
        $women_pregnant = (int)($data['women_pregnant'] ?? 0);
        $women_nursing = (int)($data['women_nursing'] ?? 0);
        $women_birth_control = (int)($data['women_birth_control'] ?? 0);
        $conditions_checklist = is_array($data['conditions_checklist'] ?? null) ? json_encode($data['conditions_checklist']) : ($data['conditions_checklist'] ?? '[]');
        $bleeding_time = trim($data['bleeding_time'] ?? '');
        $blood_type = trim($data['blood_type'] ?? '');
        $consent_signature = trim($data['consent_signature'] ?? '');

        // Update record
        $stmt = $pdo->prepare("
            UPDATE medical_histories 
            SET good_health = ?, under_medical_treatment = ?, medical_treatment_details = ?, 
                serious_illness_or_operation = ?, illness_or_operation_details = ?, hospitalized = ?, hospitalization_details = ?, 
                prescribed_medicine = ?, prescribed_medicine_details = ?, tobacco_use = ?, drugs_alcohol_use = ?, 
                allergies = ?, women_pregnant = ?, women_nursing = ?, women_birth_control = ?, conditions_checklist = ?, 
                bleeding_time = ?, blood_type = ?, consent_signature = ?
            WHERE patient_id = ?
        ");
        $stmt->execute([
            $good_health, $under_medical_treatment, $medical_treatment_details,
            $serious_illness_or_operation, $illness_or_operation_details, $hospitalized, $hospitalization_details,
            $prescribed_medicine, $prescribed_medicine_details, $tobacco_use, $drugs_alcohol_use,
            $allergies, $women_pregnant, $women_nursing, $women_birth_control, $conditions_checklist,
            $bleeding_time, $blood_type, $consent_signature, $patient_id
        ]);

        echo json_encode(['success' => true, 'message' => 'Medical history updated successfully.']);
        exit;
    }

    // 2. Save Tooth status (Dentist only)
    if ($action === 'save_tooth_status') {
        if ($role !== 'dentist') {
            http_response_code(403);
            echo json_encode(['error' => 'Only dentists can edit teeth charting status.']);
            exit;
        }

        $patient_id = (int)($data['patient_id'] ?? 0);
        $tooth_number = (int)($data['tooth_number'] ?? 0);
        $condition_status = trim($data['condition_status'] ?? 'Healthy');
        $notes = trim($data['notes'] ?? '');

        if (!$patient_id || !$tooth_number) {
            http_response_code(400);
            echo json_encode(['error' => 'Patient ID and tooth number are required.']);
            exit;
        }

        // Insert or update tooth status
        $stmt = $pdo->prepare("
            INSERT INTO teeth_status (patient_id, tooth_number, condition_status, notes)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE condition_status = VALUES(condition_status), notes = VALUES(notes)
        ");
        $stmt->execute([$patient_id, $tooth_number, $condition_status, $notes]);

        echo json_encode(['success' => true, 'message' => "Tooth $tooth_number condition updated to '$condition_status'."]);
        exit;
    }

    // 3. Add Clinical Record (Dentist only)
    if ($action === 'add_dental_record') {
        if ($role !== 'dentist') {
            http_response_code(403);
            echo json_encode(['error' => 'Only dentists can create dental records.']);
            exit;
        }

        $patient_id = (int)($data['patient_id'] ?? 0);
        $appointment_id = $data['appointment_id'] ? (int)$data['appointment_id'] : null;
        $treatment_id = (int)($data['treatment_id'] ?? 0);
        $diagnosis = trim($data['diagnosis'] ?? '');
        $treatment_done = trim($data['treatment_done'] ?? '');
        $prescription = trim($data['prescription'] ?? '');
        $tooth_number = trim($data['tooth_number'] ?? 'All');
        $next_visit_date = $data['next_visit_date'] ?: null;
        $record_date = $data['record_date'] ?: date('Y-m-d');

        if (!$patient_id || !$treatment_id) {
            http_response_code(400);
            echo json_encode(['error' => 'Patient ID and Treatment type are required.']);
            exit;
        }

        $stmt = $pdo->prepare("
            INSERT INTO dental_records (patient_id, dentist_id, appointment_id, treatment_id, diagnosis, treatment_done, prescription, tooth_number, next_visit_date, record_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([$patient_id, $user_id, $appointment_id, $treatment_id, $diagnosis, $treatment_done, $prescription, $tooth_number, $next_visit_date, $record_date]);

        // If linked to an appointment, let's mark it as Completed!
        if ($appointment_id) {
            $stmt_app = $pdo->prepare("UPDATE appointments SET status = 'Completed' WHERE appointment_id = ?");
            $stmt_app->execute([$appointment_id]);
        }

        echo json_encode(['success' => true, 'message' => 'Dental treatment record added successfully.']);
        exit;
    }
}

http_response_code(400);
echo json_encode(['error' => 'Invalid action or request method.']);
?>
