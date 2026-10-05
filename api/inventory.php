<?php
// Inventory API for DentCare
require_once 'db.php';

$data = json_decode(file_get_contents('php://input'), true);
$action = $data['action'] ?? $_GET['action'] ?? '';

// Check if user is logged in
if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized. Please log in first.']);
    exit;
}

$role = $_SESSION['role'];

// Restrict access: Patients cannot access inventory at all
if ($role === 'patient') {
    http_response_code(403);
    echo json_encode(['error' => 'Access denied. Unauthorized role.']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // List inventory items
    if ($action === 'list') {
        $stmt = $pdo->query("SELECT * FROM inventory ORDER BY item_name ASC");
        echo json_encode($stmt->fetchAll());
        exit;
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Add inventory item (Staff/Admin only)
    if ($action === 'add') {
        if ($role === 'dentist') {
            http_response_code(403);
            echo json_encode(['error' => 'Only administrative staff or admin can modify inventory.']);
            exit;
        }

        $item_name = trim($data['item_name'] ?? '');
        $quantity = (int)($data['quantity'] ?? 0);
        $unit = trim($data['unit'] ?? 'pcs');
        $min_stock_level = (int)($data['min_stock_level'] ?? 5);

        if (!$item_name) {
            http_response_code(400);
            echo json_encode(['error' => 'Item name is required.']);
            exit;
        }

        $stmt = $pdo->prepare("INSERT INTO inventory (item_name, quantity, unit, min_stock_level) VALUES (?, ?, ?, ?)");
        $stmt->execute([$item_name, $quantity, $unit, $min_stock_level]);

        echo json_encode(['success' => true, 'message' => "Item '$item_name' added successfully."]);
        exit;
    }

    // Update stock quantity (Staff/Admin or Dentist)
    if ($action === 'update_stock') {
        $item_id = (int)($data['item_id'] ?? 0);
        $quantity = (int)($data['quantity'] ?? 0);

        if (!$item_id) {
            http_response_code(400);
            echo json_encode(['error' => 'Item ID is required.']);
            exit;
        }

        $stmt = $pdo->prepare("UPDATE inventory SET quantity = ? WHERE item_id = ?");
        $stmt->execute([$quantity, $item_id]);

        echo json_encode(['success' => true, 'message' => 'Stock quantity updated successfully.']);
        exit;
    }

    // Delete item (Staff/Admin only)
    if ($action === 'delete') {
        if ($role === 'dentist') {
            http_response_code(403);
            echo json_encode(['error' => 'Only administrative staff or admin can delete inventory items.']);
            exit;
        }

        $item_id = (int)($data['item_id'] ?? 0);
        if (!$item_id) {
            http_response_code(400);
            echo json_encode(['error' => 'Item ID is required.']);
            exit;
        }

        $stmt = $pdo->prepare("DELETE FROM inventory WHERE item_id = ?");
        $stmt->execute([$item_id]);

        echo json_encode(['success' => true, 'message' => 'Item removed from inventory.']);
        exit;
    }
}

http_response_code(400);
echo json_encode(['error' => 'Invalid action or request method.']);
?>
