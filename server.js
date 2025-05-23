const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

let users = [
    { id: 1, username: 'kasa', password: 'kasa', role: 'cashier' },
    { id: 2, username: 'garson1', password: '1', role: 'waiter' },
];
let nextUserId = 3;

let products = [
    { id: 1001, name: "İSKENDER - 120 GR", price: 275.00, category: "ET - TAVUK" },
    { id: 1002, name: "ET DÖNER EKMEK ARASI", price: 150.00, category: "ET - TAVUK" },
    { id: 1003, name: "ET DÖNER PORSİYON", price: 175.00, category: "ET - TAVUK" },
    { id: 1004, name: "TAVUK DÖNER EKMEK ARASI", price: 130.00, category: "ET - TAVUK" },
    { id: 1005, name: "TAVUK DÖNER PORSİYON", price: 150.00, category: "ET - TAVUK" },
    { id: 1006, name: "KÖFTE EKMEK", price: 130.00, category: "ET - TAVUK" },
    { id: 1007, name: "KÖFTE PORSİYON", price: 150.00, category: "ET - TAVUK" },
    { id: 1008, name: "KUZU ŞİŞ", price: 150.00, category: "ET - TAVUK" },
    { id: 1009, name: "ADANA ŞİŞ", price: 150.00, category: "ET - TAVUK" },
    { id: 1010, name: "PİRZOLA - 4 ADET", price: 250.00, category: "ET - TAVUK" },
    { id: 1011, name: "TAVUK FAJİTA", price: 200.00, category: "ET - TAVUK" },
    { id: 1012, name: "TAVUK (PİLİÇ) ÇEVİRME", price: 250.00, category: "ET - TAVUK" },
    { id: 1013, name: "ET DÖNER - KG", price: 1300.00, category: "ET - TAVUK" },
    { id: 1014, name: "ET DÖNER - 500 GR", price: 650.00, category: "ET - TAVUK" },
    { id: 1015, name: "TAVUK DÖNER - KG", price: 800.00, category: "ET - TAVUK" },
    { id: 1016, name: "TAVUK DÖNER - 500 GR", price: 400.00, category: "ET - TAVUK" },
    { id: 2001, name: "PİZZA KARIŞIK (ORTA BOY)", price: 150.00, category: "ATIŞTIRMALIK" },
    { id: 2002, name: "PİZZA KARIŞIK (BÜYÜK BOY)", price: 200.00, category: "ATIŞTIRMALIK" },
    { id: 2003, name: "LAHMACUN", price: 75.00, category: "ATIŞTIRMALIK" },
    { id: 2004, name: "PİDE ÇEŞİTLERİ", price: 100.00, category: "ATIŞTIRMALIK" },
    { id: 2005, name: "AYVALIK TOSTU", price: 100.00, category: "ATIŞTIRMALIK" },
    { id: 2006, name: "HAMBURGER", price: 120.00, category: "ATIŞTIRMALIK" },
    { id: 2007, name: "ÇİĞ KÖFTE KG (MARUL-LİMON)", price: 300.00, category: "ATIŞTIRMALIK" },
    { id: 3001, name: "OSMANLI ŞERBETİ - 1 LİTRE", price: 75.00, category: "İÇECEK" },
    { id: 3002, name: "LİMONATA", price: 75.00, category: "İÇECEK" },
    { id: 3003, name: "SU", price: 10.00, category: "İÇECEK" },
    { id: 3004, name: "AYRAN", price: 15.00, category: "İÇECEK" },
    { id: 3005, name: "ÇAY", price: 10.00, category: "İÇECEK" },
    { id: 3006, name: "GAZOZ", price: 25.00, category: "İÇECEK" },
    { id: 4001, name: "EV BAKLAVASI - KG", price: 400.00, category: "TATLI" },
    { id: 4002, name: "EV BAKLAVASI - 500 GRAM", price: 200.00, category: "TATLI" },
    { id: 4003, name: "EV BAKLAVASI - PORSİYON", price: 75.00, category: "TATLI" },
    { id: 4004, name: "AŞURE - 500 GRAM", price: 100.00, category: "TATLI" },
    { id: 4005, name: "HÖŞMERİM - 500 GRAM", price: 100.00, category: "TATLI" },
    { id: 4006, name: "DİĞER PASTA ÇEŞİTLERİ", price: 50.00, category: "TATLI" },
    { id: 4007, name: "YAĞLI GÖZLEME", price: 50.00, category: "TATLI" },
    { id: 4008, name: "İÇLİ GÖZLEME", price: 60.00, category: "TATLI" },
    { id: 5001, name: "KELLE PAÇA ÇORBA", price: 60.00, category: "ÇORBA" },
    { id: 5002, name: "TARHANA ÇORBA", price: 60.00, category: "ÇORBA" }
];
let nextProductId = 6000;

let tables = [
    { id: 'masa-1', name: 'Masa 1', status: 'boş', order: [], total: 0, waiterUsername: null, type: 'standart' },
    { id: 'masa-2', name: 'Masa 2', status: 'boş', order: [], total: 0, waiterUsername: null, type: 'standart' },
    { id: 'kamelya-1', name: 'Kamelya 1', status: 'boş', order: [], total: 0, waiterUsername: null, type: 'kamelya' },
];
let nextTableIdNumeric = 3; 

let salesHistory = [];

function calculateTableTotal(tableId) {
    const table = tables.find(t => t.id === tableId);
    if (table) {
        table.total = table.order.reduce((sum, item) => sum + (item.priceAtOrder * item.quantity), 0);
    }
}

function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

function broadcastTablesUpdate() {
    broadcast({ type: 'tables_update', payload: { tables: tables } });
}

function broadcastProductsUpdate() {
    broadcast({ type: 'products_update', payload: { products: products } });
}

wss.on('connection', (ws) => {
    console.log('Yeni bir istemci bağlandı.');
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (message) => {
        let parsedMessage;
        try {
            parsedMessage = JSON.parse(message);
            console.log('Alınan mesaj:', parsedMessage);
        } catch (e) {
            console.error('Geçersiz JSON mesajı:', message);
            ws.send(JSON.stringify({ type: 'error', payload: { message: 'Geçersiz JSON formatı.' } }));
            return;
        }

        const { type, payload } = parsedMessage;
        let user = users.find(u => u.id === ws.userId);

        switch (type) {
            case 'login':
                const foundUser = users.find(u => u.username === payload.username && u.password === payload.password);
                if (foundUser) {
                    ws.userId = foundUser.id;
                    ws.username = foundUser.username;
                    ws.role = foundUser.role;
                    ws.send(JSON.stringify({ type: 'login_success', payload: { user: {id: foundUser.id, username: foundUser.username, role: foundUser.role }, tables: tables, products: products } }));
                } else {
                    ws.send(JSON.stringify({ type: 'login_fail', payload: { error: 'Kullanıcı adı veya şifre hatalı.' } }));
                }
                break;

            case 'reauthenticate':
                if (payload && payload.user && payload.user.id) {
                    const reauthFoundUser = users.find(u => u.id === payload.user.id && u.username === payload.user.username );
                     if (reauthFoundUser) {
                        ws.userId = reauthFoundUser.id;
                        ws.username = reauthFoundUser.username;
                        ws.role = reauthFoundUser.role;
                        ws.send(JSON.stringify({ type: 'login_success', payload: { user: {id: reauthFoundUser.id, username: reauthFoundUser.username, role: reauthFoundUser.role }, tables: tables, products: products }}));
                     } else {
                         ws.send(JSON.stringify({ type: 'login_fail', payload: { error: 'Oturum geçersiz, lütfen tekrar giriş yapın.' } }));
                     }
                }
                break;

            case 'logout':
                ws.userId = null;
                ws.username = null;
                ws.role = null;
                console.log('Kullanıcı çıkış yaptı.');
                break;

            case 'add_order_item':
                if (!ws.userId) { ws.send(JSON.stringify({ type: 'order_update_fail', payload: { error: 'Giriş yapılmamış.' }})); break; }
                const tableToAdd = tables.find(t => t.id === payload.tableId);
                const productToAdd = products.find(p => p.id === payload.productId);
                if (tableToAdd && productToAdd) {
                    const existingItem = tableToAdd.order.find(item => item.productId === payload.productId && item.description === (payload.description || ''));
                    if (existingItem) {
                        existingItem.quantity += payload.quantity;
                    } else {
                        tableToAdd.order.push({
                            productId: payload.productId,
                            name: productToAdd.name,
                            priceAtOrder: productToAdd.price,
                            quantity: payload.quantity,
                            description: payload.description || '',
                            waiterUsername: ws.username,
                            timestamp: Date.now()
                        });
                    }
                    tableToAdd.status = 'dolu';
                    if(!tableToAdd.waiterUsername && ws.role === 'waiter') tableToAdd.waiterUsername = ws.username;
                    else if (!tableToAdd.waiterUsername && ws.role === 'cashier') tableToAdd.waiterUsername = ws.username;

                    calculateTableTotal(payload.tableId);
                    broadcastTablesUpdate();
                } else {
                     ws.send(JSON.stringify({ type: 'order_update_fail', payload: { error: 'Masa veya ürün bulunamadı.' }}));
                }
                break;
            
            case 'add_manual_order_item':
                if (!ws.userId || ws.role !== 'cashier') { ws.send(JSON.stringify({ type: 'manual_order_update_fail', payload: { error: 'Yetkiniz yok veya giriş yapılmamış.' }})); break; }
                const tableForManual = tables.find(t => t.id === payload.tableId);
                if (tableForManual) {
                     tableForManual.order.push({
                        productId: `manual-${Date.now()}`, 
                        name: payload.name,
                        priceAtOrder: parseFloat(payload.price),
                        quantity: parseInt(payload.quantity),
                        description: payload.description || '',
                        waiterUsername: ws.username,
                        timestamp: Date.now()
                    });
                    tableForManual.status = 'dolu';
                    if(!tableForManual.waiterUsername) tableForManual.waiterUsername = ws.username;
                    calculateTableTotal(payload.tableId);
                    broadcastTablesUpdate();
                } else {
                    ws.send(JSON.stringify({ type: 'manual_order_update_fail', payload: { error: 'Masa bulunamadı.' }}));
                }
                break;

            case 'remove_order_item':
                if (!ws.userId) { ws.send(JSON.stringify({ type: 'order_update_fail', payload: { error: 'Giriş yapılmamış.' }})); break; }
                const tableFromRemove = tables.find(t => t.id === payload.tableId);
                if (tableFromRemove) {
                    const itemIndex = tableFromRemove.order.findIndex(item =>
                        (payload.productId && item.productId === payload.productId || payload.productId && item.productId === parseInt(payload.productId)) &&
                        item.description === (payload.description || '') &&
                        (!payload.name || item.name === payload.name)
                    );
                    if (itemIndex > -1) {
                        tableFromRemove.order.splice(itemIndex, 1);
                        if (tableFromRemove.order.length === 0) {
                            tableFromRemove.status = 'boş';
                            tableFromRemove.waiterUsername = null;
                        }
                        calculateTableTotal(payload.tableId);
                        broadcastTablesUpdate();
                    } else {
                         ws.send(JSON.stringify({ type: 'order_update_fail', payload: { error: 'Sipariş kalemi bulunamadı.' }}));
                    }
                } else {
                    ws.send(JSON.stringify({ type: 'order_update_fail', payload: { error: 'Masa bulunamadı.' }}));
                }
                break;

            case 'close_table':
                if (!ws.userId || ws.role !== 'cashier') { ws.send(JSON.stringify({ type: 'table_operation_fail', payload: { error: 'Yetkiniz yok.' }})); break; }
                const tableToClose = tables.find(t => t.id === payload.tableId);
                if (tableToClose) {
                    if (tableToClose.order && tableToClose.order.length > 0) {
                        tableToClose.order.forEach(item => {
                            salesHistory.push({
                                ...item,
                                tableName: tableToClose.name,
                                closingTimestamp: Date.now(),
                                closedBy: ws.username
                            });
                        });
                    }
                    tableToClose.order = [];
                    tableToClose.status = 'boş';
                    tableToClose.total = 0;
                    tableToClose.waiterUsername = null;
                    broadcastTablesUpdate();
                    ws.send(JSON.stringify({ type: 'table_operation_success', payload: { message: `${tableToClose.name} kapatıldı ve hesap tamamlandı.` }}));
                } else {
                    ws.send(JSON.stringify({ type: 'table_operation_fail', payload: { error: 'Masa bulunamadı.' }}));
                }
                break;
            
            case 'complete_quick_sale':
                if (!ws.userId || ws.role !== 'cashier') { ws.send(JSON.stringify({ type: 'quick_sale_fail', payload: { error: 'Yetkiniz yok.' }})); break; }
                if (payload.items && payload.items.length > 0) {
                    payload.items.forEach(item => {
                         salesHistory.push({
                            ...item,
                            tableName: "Hızlı Satış",
                            closingTimestamp: Date.now(),
                            closedBy: ws.username,
                            waiterUsername: payload.cashierUsername 
                        });
                    });
                    ws.send(JSON.stringify({ type: 'quick_sale_success', payload: { message: 'Hızlı satış tamamlandı.'}}));
                    console.log("Hızlı satış kaydedildi:", payload.items);
                } else {
                     ws.send(JSON.stringify({ type: 'quick_sale_fail', payload: { error: 'Sepet boş.' }}));
                }
                break;

            case 'get_sales_report':
                if (!ws.userId || ws.role !== 'cashier') { ws.send(JSON.stringify({ type: 'error', payload: { message: 'Yetkiniz yok.' }})); break; }
                ws.send(JSON.stringify({ type: 'sales_report_data', payload: { sales: salesHistory } }));
                break;

            case 'add_product_to_main_menu':
                if (!ws.userId || ws.role !== 'cashier') { ws.send(JSON.stringify({ type: 'error', payload: { message: 'Yetkiniz yok.' }})); break; }
                const newProduct = {
                    id: nextProductId++,
                    name: payload.name,
                    price: parseFloat(payload.price),
                    category: payload.category.toUpperCase()
                };
                products.push(newProduct);
                broadcastProductsUpdate();
                ws.send(JSON.stringify({ type: 'main_menu_product_added', payload: { message: `${newProduct.name} menüye eklendi.` }}));
                break;

            case 'update_main_menu_product':
                if (!ws.userId || ws.role !== 'cashier') { ws.send(JSON.stringify({ type: 'error', payload: { message: 'Yetkiniz yok.' }})); break; }
                const productIndexToUpdate = products.findIndex(p => p.id === payload.id);
                if (productIndexToUpdate > -1) {
                    products[productIndexToUpdate] = {
                        ...products[productIndexToUpdate],
                        name: payload.name,
                        price: parseFloat(payload.price),
                        category: payload.category.toUpperCase()
                    };
                    broadcastProductsUpdate();
                    ws.send(JSON.stringify({ type: 'main_menu_product_updated', payload: { message: `${payload.name} güncellendi.` }}));
                } else {
                     ws.send(JSON.stringify({ type: 'error', payload: { message: 'Güncellenecek ürün bulunamadı.' }}));
                }
                break;
            
            case 'add_table':
                if (!ws.userId || ws.role !== 'cashier') { ws.send(JSON.stringify({ type: 'table_operation_fail', payload: { error: 'Yetkiniz yok.' }})); break; }
                const newTableId = `masa-${nextTableIdNumeric++}`;
                tables.push({ id: newTableId, name: payload.name, status: 'boş', order: [], total: 0, waiterUsername: null, type: 'standart' });
                broadcastTablesUpdate();
                ws.send(JSON.stringify({ type: 'table_operation_success', payload: { message: `${payload.name} eklendi.` }}));
                break;

            case 'edit_table_name':
                if (!ws.userId || ws.role !== 'cashier') { ws.send(JSON.stringify({ type: 'table_operation_fail', payload: { error: 'Yetkiniz yok.' }})); break; }
                const tableToEdit = tables.find(t => t.id === payload.tableId);
                if (tableToEdit) {
                    tableToEdit.name = payload.newName;
                    broadcastTablesUpdate();
                    ws.send(JSON.stringify({ type: 'table_operation_success', payload: { message: `Masa adı güncellendi: ${payload.newName}` }}));
                } else {
                    ws.send(JSON.stringify({ type: 'table_operation_fail', payload: { error: 'Masa bulunamadı.' }}));
                }
                break;
            
            case 'delete_table':
                if (!ws.userId || ws.role !== 'cashier') { ws.send(JSON.stringify({ type: 'table_operation_fail', payload: { error: 'Yetkiniz yok.' }})); break; }
                const initialTableCount = tables.length;
                tables = tables.filter(t => t.id !== payload.tableId);
                if (tables.length < initialTableCount) {
                    broadcastTablesUpdate();
                    ws.send(JSON.stringify({ type: 'table_operation_success', payload: { message: `Masa silindi.` }}));
                } else {
                     ws.send(JSON.stringify({ type: 'table_operation_fail', payload: { error: 'Silinecek masa bulunamadı.' }}));
                }
                break;

            case 'get_waiters_list':
                 if (!ws.userId || ws.role !== 'cashier') { ws.send(JSON.stringify({ type: 'error', payload: { message: 'Yetkiniz yok.' }})); break; }
                 ws.send(JSON.stringify({ type: 'waiters_list', payload: { waiters: users.filter(u => u.role === 'waiter') }}));
                 break;
            
            case 'add_waiter':
                if (!ws.userId || ws.role !== 'cashier') { ws.send(JSON.stringify({ type: 'waiter_operation_fail', payload: { error: 'Yetkiniz yok.' }})); break; }
                if (users.find(u => u.username === payload.username)) {
                    ws.send(JSON.stringify({ type: 'waiter_operation_fail', payload: { error: 'Bu kullanıcı adı zaten mevcut.' }}));
                    break;
                }
                const newWaiter = { id: nextUserId++, username: payload.username, password: payload.password, role: 'waiter' };
                users.push(newWaiter);
                ws.send(JSON.stringify({ type: 'waiter_operation_success', payload: { message: `${payload.username} adlı garson eklendi.` }}));
                break;

            case 'edit_waiter_password':
                if (!ws.userId || ws.role !== 'cashier') { ws.send(JSON.stringify({ type: 'waiter_operation_fail', payload: { error: 'Yetkiniz yok.' }})); break; }
                const waiterToEdit = users.find(u => u.id === payload.userId && u.role === 'waiter');
                if (waiterToEdit) {
                    waiterToEdit.password = payload.newPassword;
                    ws.send(JSON.stringify({ type: 'waiter_operation_success', payload: { message: `${waiterToEdit.username} adlı garsonun şifresi güncellendi.` }}));
                } else {
                    ws.send(JSON.stringify({ type: 'waiter_operation_fail', payload: { error: 'Garson bulunamadı.' }}));
                }
                break;

            case 'delete_waiter':
                if (!ws.userId || ws.role !== 'cashier') { ws.send(JSON.stringify({ type: 'waiter_operation_fail', payload: { error: 'Yetkiniz yok.' }})); break; }
                const initialUserCount = users.length;
                users = users.filter(u => !(u.id === payload.userId && u.role === 'waiter'));
                 if (users.length < initialUserCount) {
                    ws.send(JSON.stringify({ type: 'waiter_operation_success', payload: { message: `Garson silindi.` }}));
                } else {
                    ws.send(JSON.stringify({ type: 'waiter_operation_fail', payload: { error: 'Silinecek garson bulunamadı veya silme yetkiniz yok (kasa silinemez).' }}));
                }
                break;

            default:
                console.log('Bilinmeyen mesaj tipi:', type);
                ws.send(JSON.stringify({ type: 'error', payload: { message: `Bilinmeyen istek tipi: ${type}` } }));
        }
    });

    ws.on('close', () => {
        console.log('İstemci bağlantısı kesildi.');
        ws.isAlive = false;
    });

    ws.on('error', (error) => {
        console.error('WebSocket hatası:', error);
    });
});

const interval = setInterval(function ping() {
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', function close() {
  clearInterval(interval);
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
    console.log(`HTTP ve WebSocket sunucusu ${PORT} portunda çalışıyor.`);
    console.log(`Uygulamaya http://localhost:${PORT} adresinden erişebilirsiniz.`);
    if (process.env.NODE_ENV === 'production') {
        console.log("Uygulama üretim modunda çalışıyor.");
        console.log("İstemciler wss://isabet-satis.onrender.com adresinden bağlanmalı (veya istemci tarafındaki URL güncellenmeli).");
    }
});
