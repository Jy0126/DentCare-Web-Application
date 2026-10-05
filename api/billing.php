<?php
// Billing & Invoices API for DentCare
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
    // List invoices (role based)
    if ($action === 'list') {
        if ($role === 'patient') {
            // Patient sees their own invoices
            $stmt = $pdo->prepare("
                SELECT b.*, a.appointment_date, a.appointment_time, t.treatment_name 
                FROM billing b
                JOIN appointments a ON b.appointment_id = a.appointment_id
                JOIN treatments t ON a.treatment_id = t.treatment_id
                WHERE b.patient_id = ?
                ORDER BY b.created_at DESC
            ");
            $stmt->execute([$user_id]);
            echo json_encode($stmt->fetchAll());
            exit;
        } else if ($role === 'staff' || $role === 'admin' || $role === 'dentist') {
            // Staff / Dentist sees all invoices
            $stmt = $pdo->query("
                SELECT b.*, a.appointment_date, t.treatment_name, p.first_name AS patient_first, p.last_name AS patient_last
                FROM billing b
                JOIN appointments a ON b.appointment_id = a.appointment_id
                JOIN treatments t ON a.treatment_id = t.treatment_id
                JOIN patients p ON b.patient_id = p.patient_id
                ORDER BY b.created_at DESC
            ");
            echo json_encode($stmt->fetchAll());
            exit;
        }
    }

    // Get Financial Revenue Summary (Staff & Admin only)
    if ($action === 'reports') {
        if ($role !== 'staff' && $role !== 'admin') {
            http_response_code(403);
            echo json_encode(['error' => 'Unauthorized access.']);
            exit;
        }

        // Total earnings
        $total_earnings = $pdo->query("SELECT SUM(total_amount) FROM billing WHERE payment_status = 'Paid'")->fetchColumn() ?: 0.00;

        // Earnings by payment method
        $by_method = $pdo->query("
            SELECT payment_method, SUM(total_amount) as total 
            FROM billing 
            WHERE payment_status = 'Paid' 
            GROUP BY payment_method
        ")->fetchAll();

        // Earnings by treatment category
        $by_treatment = $pdo->query("
            SELECT t.treatment_name, COUNT(b.invoice_id) as count, SUM(b.total_amount) as total
            FROM billing b
            JOIN appointments a ON b.appointment_id = a.appointment_id
            JOIN treatments t ON a.treatment_id = t.treatment_id
            WHERE b.payment_status = 'Paid'
            GROUP BY t.treatment_id
            ORDER BY total DESC
        ")->fetchAll();

        echo json_encode([
            'total_earnings' => $total_earnings,
            'by_method' => $by_method,
            'by_treatment' => $by_treatment
        ]);
        exit;
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Submit payment (Patients pay GCash/BDO in simulated modal)
    if ($action === 'submit_payment') {
        $invoice_id = (int)($data['invoice_id'] ?? 0);
        $payment_method = trim($data['payment_method'] ?? 'Cash');
        $reference_number = trim($data['reference_number'] ?? '');

        if (!$invoice_id) {
            http_response_code(400);
            echo json_encode(['error' => 'Invoice ID is required.']);
            exit;
        }

        // Fetch invoice
        $stmt_inv = $pdo->prepare("SELECT * FROM billing WHERE invoice_id = ?");
        $stmt_inv->execute([$invoice_id]);
        $invoice = $stmt_inv->fetch();

        if (!$invoice) {
            http_response_code(404);
            echo json_encode(['error' => 'Invoice not found.']);
            exit;
        }

        if ($role === 'patient' && $invoice['patient_id'] !== $user_id) {
            http_response_code(403);
            echo json_encode(['error' => 'Unauthorized payment action.']);
            exit;
        }

        // Process simulated online payment
        $payment_status = 'Paid';
        if ($payment_method !== 'Cash' && !$reference_number) {
            http_response_code(400);
            echo json_encode(['error' => 'Reference number is required for GCash/BDO payments.']);
            exit;
        }

        $stmt_pay = $pdo->prepare("
            UPDATE billing 
            SET payment_method = ?, payment_status = ?, reference_number = ?, payment_date = NOW() 
            WHERE invoice_id = ?
        ");
        $stmt_pay->execute([$payment_method, $payment_status, $reference_number ?: null, $invoice_id]);

        echo json_encode(['success' => true, 'message' => 'Simulated payment completed successfully!']);
        exit;
    }

    // Process Cash payment or Override verification (Staff/Admin only)
    if ($action === 'verify_payment') {
        if ($role !== 'staff' && $role !== 'admin') {
            http_response_code(403);
            echo json_encode(['error' => 'Access denied. Administrative roles only.']);
            exit;
        }

        $invoice_id = (int)($data['invoice_id'] ?? 0);
        $payment_method = trim($data['payment_method'] ?? 'Cash');
        $payment_status = trim($data['payment_status'] ?? 'Paid');

        if (!$invoice_id) {
            http_response_code(400);
            echo json_encode(['error' => 'Invoice ID is required.']);
            exit;
        }

        $stmt_pay = $pdo->prepare("
            UPDATE billing 
            SET payment_method = ?, payment_status = ?, payment_date = NOW() 
            WHERE invoice_id = ?
        ");
        $stmt_pay->execute([$payment_method, $payment_status, $invoice_id]);

        echo json_encode(['success' => true, 'message' => "Invoice updated to '$payment_status'."]);
        exit;
    }
}

http_response_code(400);
echo json_encode(['error' => 'Invalid action or request method.']);
?>
