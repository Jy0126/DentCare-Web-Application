<?php
// Appointments API for DentCare
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
    // List available treatments
    if ($action === 'treatments') {
        $stmt = $pdo->query("SELECT * FROM treatments WHERE is_active = 1 ORDER BY treatment_name ASC");
        echo json_encode($stmt->fetchAll());
        exit;
    }

    // List dentists
    if ($action === 'dentists') {
        $stmt = $pdo->query("SELECT dentist_id, first_name, last_name, specialization, schedule FROM dentists ORDER BY first_name ASC");
        echo json_encode($stmt->fetchAll());
        exit;
    }

    // List appointments (role dependent)
    if ($action === 'list') {
        if ($role === 'patient') {
            // Patient sees their own appointments
            $stmt = $pdo->prepare("
                SELECT a.*, t.treatment_name, t.price, d.first_name AS dentist_first, d.last_name AS dentist_last, b.invoice_id, b.payment_status, b.payment_method
                FROM appointments a
                JOIN treatments t ON a.treatment_id = t.treatment_id
                JOIN dentists d ON a.dentist_id = d.dentist_id
                LEFT JOIN billing b ON a.appointment_id = b.appointment_id
                WHERE a.patient_id = ?
                ORDER BY a.appointment_date DESC, a.appointment_time DESC
            ");
            $stmt->execute([$user_id]);
            echo json_encode($stmt->fetchAll());
            exit;
        } else if ($role === 'dentist') {
            // Dentist sees appointments assigned to them
            $stmt = $pdo->prepare("
                SELECT a.*, t.treatment_name, p.first_name AS patient_first, p.last_name AS patient_last, p.date_of_birth, p.gender, p.phone_number
                FROM appointments a
                JOIN treatments t ON a.treatment_id = t.treatment_id
                JOIN patients p ON a.patient_id = p.patient_id
                WHERE a.dentist_id = ?
                ORDER BY a.appointment_date DESC, a.appointment_time DESC
            ");
            $stmt->execute([$user_id]);
            echo json_encode($stmt->fetchAll());
            exit;
        } else if ($role === 'staff' || $role === 'admin') {
            // Staff / Admin see all appointments
            $stmt = $pdo->query("
                SELECT a.*, t.treatment_name, p.first_name AS patient_first, p.last_name AS patient_last, p.phone_number, d.first_name AS dentist_first, d.last_name AS dentist_last
                FROM appointments a
                JOIN treatments t ON a.treatment_id = t.treatment_id
                JOIN patients p ON a.patient_id = p.patient_id
                JOIN dentists d ON a.dentist_id = d.dentist_id
                ORDER BY a.appointment_date DESC, a.appointment_time DESC
            ");
            echo json_encode($stmt->fetchAll());
            exit;
        }
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Book Appointment (Patients only)
    if ($action === 'book') {
        if ($role !== 'patient') {
            http_response_code(403);
            echo json_encode(['error' => 'Only patients can book appointments.']);
            exit;
        }

        $dentist_id = (int)($data['dentist_id'] ?? 0);
        $treatment_id = (int)($data['treatment_id'] ?? 0);
        $appointment_date = $data['appointment_date'] ?? '';
        $appointment_time = $data['appointment_time'] ?? '';
        $notes = trim($data['notes'] ?? '');

        if (!$dentist_id || !$treatment_id || !$appointment_date || !$appointment_time) {
            http_response_code(400);
            echo json_encode(['error' => 'Please provide dentist, treatment, date, and time.']);
            exit;
        }

        // 1. Check double-booking: Is dentist busy at that time?
        $stmt_check = $pdo->prepare("
            SELECT COUNT(*) FROM appointments 
            WHERE dentist_id = ? AND appointment_date = ? AND appointment_time = ? AND status NOT IN ('Rejected', 'Cancelled')
        ");
        $stmt_check->execute([$dentist_id, $appointment_date, $appointment_time]);
        if ($stmt_check->fetchColumn() > 0) {
            http_response_code(409);
            echo json_encode(['error' => 'This slot is already booked for this dentist. Please choose another time.']);
            exit;
        }

        // 2. Retrieve treatment cost
        $stmt_treatment = $pdo->prepare("SELECT price FROM treatments WHERE treatment_id = ?");
        $stmt_treatment->execute([$treatment_id]);
        $price = $stmt_treatment->fetchColumn();
        if (!$price) {
            http_response_code(404);
            echo json_encode(['error' => 'Treatment not found.']);
            exit;
        }

        // 3. Create Appointment
        $pdo->beginTransaction();
        try {
            $stmt_app = $pdo->prepare("
                INSERT INTO appointments (patient_id, dentist_id, treatment_id, appointment_date, appointment_time, notes, status)
                VALUES (?, ?, ?, ?, ?, ?, 'Pending')
            ");
            $stmt_app->execute([$user_id, $dentist_id, $treatment_id, $appointment_date, $appointment_time, $notes]);
            $appointment_id = $pdo->lastInsertId();

            // 4. Create pending Invoice/Billing
            $stmt_bill = $pdo->prepare("
                INSERT INTO billing (appointment_id, patient_id, total_amount, payment_status)
                VALUES (?, ?, ?, 'Unpaid')
            ");
            $stmt_bill->execute([$appointment_id, $user_id, $price]);

            $pdo->commit();
            echo json_encode(['success' => true, 'message' => 'Appointment booked successfully and is pending approval.', 'appointment_id' => $appointment_id]);
        } catch (Exception $e) {
            $pdo->rollBack();
            http_response_code(500);
            echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
        }
        exit;
    }

    // Update appointment status (Staff/Admin/Dentist or Patient Cancellation)
    if ($action === 'update_status') {
        $appointment_id = (int)($data['appointment_id'] ?? 0);
        $new_status = $data['status'] ?? ''; // Approved, Rejected, Completed, Cancelled

        if (!$appointment_id || !$new_status) {
            http_response_code(400);
            echo json_encode(['error' => 'Appointment ID and status are required.']);
            exit;
        }

        // Fetch appointment to verify permissions
        $stmt_app = $pdo->prepare("SELECT * FROM appointments WHERE appointment_id = ?");
        $stmt_app->execute([$appointment_id]);
        $appointment = $stmt_app->fetch();

        if (!$appointment) {
            http_response_code(404);
            echo json_encode(['error' => 'Appointment not found.']);
            exit;
        }

        // Authorization check
        if ($role === 'patient') {
            if ($appointment['patient_id'] !== $user_id) {
                http_response_code(403);
                echo json_encode(['error' => 'Unauthorized action on this appointment.']);
                exit;
            }
            if ($new_status !== 'Cancelled') {
                http_response_code(400);
                echo json_encode(['error' => 'Patients can only cancel appointments.']);
                exit;
            }
        } else if ($role === 'dentist') {
            if ($appointment['dentist_id'] !== $user_id && $new_status === 'Completed') {
                http_response_code(403);
                echo json_encode(['error' => 'You can only complete your own appointments.']);
                exit;
            }
            if (!in_array($new_status, ['Approved', 'Rejected', 'Completed', 'Cancelled'])) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid status change.']);
                exit;
            }
        } else if ($role !== 'staff' && $role !== 'admin') {
            http_response_code(403);
            echo json_encode(['error' => 'Unauthorized role.']);
            exit;
        }

        // Perform status update
        $stmt_up = $pdo->prepare("UPDATE appointments SET status = ? WHERE appointment_id = ?");
        $stmt_up->execute([$new_status, $appointment_id]);

        // If cancelled or rejected, mark billing as unpaid or optionally void
        // In this case, we keep the invoice but we can mark it as Unpaid / voided if needed.
        echo json_encode(['success' => true, 'message' => "Appointment status updated to '$new_status'."]);
        exit;
    }
}

http_response_code(400);
echo json_encode(['error' => 'Invalid action or request method.']);
?>
