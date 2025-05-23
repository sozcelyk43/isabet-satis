const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('Veritabanına bağlanırken hata oluştu:', err.stack);
    return;
  }
  if (client) {
    client.query('SELECT NOW()', (err, result) => {
      release();
      if (err) {
        return console.error('Veritabanı test sorgusu çalıştırılırken hata:', err.stack);
      }
      console.log('PostgreSQL veritabanına başarıyla bağlanıldı:', result.rows[0].now);
    });
  } else {
     console.error('Veritabanı istemcisi alınamadı (pool.connect).');
  }
});

let users = [
    { id: 1, username: 'kasa', password: 'kasa', role: 'cashier' },
    { id: 2, username: 'garson1', password: '1', role: 'waiter' },
];
let nextUserId = 3;

let products = [];
let nextProductIdInternal = 7000; // DB dışı yeni ürünler için (DB'den gelen max ID'ye göre ayarlanabilir)


let tables = [
    { id: 'masa-1', name: 'Masa 1', status: 'boş', order: [], total: 0, waiterUsername: null, type: 'standart' },
    { id: 'masa-2', name: 'Masa 2', status: 'boş', order: [], total: 0, waiterUsername: null, type: 'standart' },
    { id: 'kamelya-1', name: 'Kamelya 1', status: 'boş', order: [], total: 0, waiterUsername: null, type: 'kamelya' },
];
let nextTableIdNumeric = 3;

async function loadProductsFromDB() {
    try {
        const { rows } = await pool.query('SELECT * FROM products ORDER BY category, name');
        products = rows.map(p => ({
            ...p,
            price: parseFloat(p.price)
        }));
        console.log(`${products.length} ürün veritabanından yüklendi.`);
        if (products.length > 0) {
            const maxId = products.reduce((max, p) => p.id > max ? p.id : max, 0);
            nextProductIdInternal = maxId + 1; // DB'deki en büyük ID'den devam et
        }
        broadcastProductsUpdate();
    } catch (error) {
        console.error('Ürünler veritabanından yüklenirken hata:', error);
        products = [ /* Acil durum için varsayılan ürün listesi buraya eklenebilir */ ];
    }
}

function calculateTableTotal(tableId) {
    const table = tables.find(t => t.id === tableId);
    if (table) {
        table.total = table.order.reduce((sum, item) => sum + (item.priceAtOrder * item.quantity), 0);
    }
}

function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(JSON.stringify(data));
            } catch (e) {
                console.error("Broadcast sırasında JSON.stringify hatası veya gönderme hatası:", e);
            }
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

    ws.on('message', async (message) => {
        let parsedMessage;
        try {
            parsedMessage = JSON.parse(message);
        } catch (e) {
            console.error('Geçersiz JSON mesajı:', message, e);
            try {
                ws.send(JSON.stringify({ type: 'error', payload: { message: 'Geçersiz JSON formatı.' } }));
            } catch (sendError) {
                console.error("İstemciye hata mesajı gönderilemedi (Geçersiz JSON):", sendError);
            }
            return;
        }

        const { type, payload } = parsedMessage;
        try {
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
                    break;

                case 'add_order_item':
                    if (!ws.userId) { ws.send(JSON.stringify({ type: 'order_update_fail', payload: { error: 'Giriş yapılmamış.' }})); break; }
                    const tableToAdd = tables.find(t => t.id === payload.tableId);
                    const productDataForOrder = products.find(p => p.id === payload.productId);
                    if (tableToAdd && productDataForOrder) {
                        const existingItem = tableToAdd.order.find(item => item.productId === payload.productId && item.description === (payload.description || ''));
                        if (existingItem) {
                            existingItem.quantity += payload.quantity;
                        } else {
                            tableToAdd.order.push({
                                productId: payload.productId,
                                name: productDataForOrder.name,
                                priceAtOrder: productDataForOrder.price,
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
                            (payload.productId && item.productId === payload.productId || payload.productId && String(item.productId) === String(payload.productId)) &&
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
                            const closingTime = new Date();
                            for (const item of tableToClose.order) {
                                try {
                                    await pool.query(
                                        `INSERT INTO sales_log (product_id, name, quantity, price_at_order, description, table_name, waiter_username, closed_by, original_item_timestamp, closing_timestamp)
                                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                                        [String(item.productId), item.name, item.quantity, item.priceAtOrder, item.description, tableToClose.name, item.waiterUsername, ws.username, new Date(item.timestamp), closingTime]
                                    );
                                } catch (dbError) {
                                    console.error('Satış loguna yazma hatası (close_table):', dbError);
                                }
                            }
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
                        const closingTime = new Date();
                        for (const item of payload.items) {
                             try {
                                await pool.query(
                                    `INSERT INTO sales_log (product_id, name, quantity, price_at_order, description, table_name, waiter_username, closed_by, original_item_timestamp, closing_timestamp)
                                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                                    [String(item.productId), item.name, item.quantity, item.priceAtOrder, item.description, "Hızlı Satış", item.waiterUsername, ws.username, new Date(item.timestamp), closingTime]
                                );
                            } catch (dbError) {
                                console.error('Satış loguna yazma hatası (quick_sale):', dbError);
                            }
                        }
                        ws.send(JSON.stringify({ type: 'quick_sale_success', payload: { message: 'Hızlı satış tamamlandı.'}}));
                    } else {
                         ws.send(JSON.stringify({ type: 'quick_sale_fail', payload: { error: 'Sepet boş.' }}));
                    }
                    break;

                case 'get_sales_report':
                    if (!ws.userId || ws.role !== 'cashier') { 
                        ws.send(JSON.stringify({ type: 'error', payload: { message: 'Yetkiniz yok.' }})); 
                        break; 
                    }
                    try {
                        const { rows } = await pool.query('SELECT * FROM sales_log ORDER BY closing_timestamp DESC');
                        const reportData = rows.map(row => ({
                            productId: row.product_id,
                            name: row.name,
                            quantity: row.quantity,
                            priceAtOrder: parseFloat(row.price_at_order),
                            description: row.description,
                            tableName: row.table_name,
                            waiterUsername: row.waiter_username,
                            closedBy: row.closed_by,
                            timestamp: row.original_item_timestamp,
                            closingTimestamp: row.closing_timestamp
                        }));
                        ws.send(JSON.stringify({ type: 'sales_report_data', payload: { sales: reportData } }));
                    } catch (dbError) {
                        console.error('Satış raporu alınırken veritabanı hatası:', dbError);
                        ws.send(JSON.stringify({ type: 'error', payload: { message: 'Rapor alınırken sunucu hatası.' }}));
                    }
                    break;

                case 'add_product_to_main_menu':
                    if (!ws.userId || ws.role !== 'cashier') { ws.send(JSON.stringify({ type: 'error', payload: { message: 'Yetkiniz yok.' }})); break; }
                    const newProductData = {
                        id: payload.id || nextProductIdInternal++, // İstemciden ID gelmiyorsa veya güvenilmiyorsa yeni ID ata
                        name: payload.name,
                        price: parseFloat(payload.price),
                        category: payload.category.toUpperCase()
                    };
                    try {
                        await pool.query('INSERT INTO products (id, name, price, category) VALUES ($1, $2, $3, $4)', 
                            [newProductData.id, newProductData.name, newProductData.price, newProductData.category]);
                        products.push(newProductData); // Hafızaya da ekle
                        if (newProductData.id >= nextProductIdInternal) nextProductIdInternal = newProductData.id + 1;
                        broadcastProductsUpdate();
                        ws.send(JSON.stringify({ type: 'main_menu_product_added', payload: { message: `${newProductData.name} menüye eklendi.` }}));
                    } catch (dbError) {
                        console.error("Ürün DB'ye eklenirken hata:", dbError);
                        ws.send(JSON.stringify({ type: 'error', payload: { message: 'Ürün veritabanına eklenirken hata.' }}));
                    }
                    break;

                case 'update_main_menu_product':
                    if (!ws.userId || ws.role !== 'cashier') { ws.send(JSON.stringify({ type: 'error', payload: { message: 'Yetkiniz yok.' }})); break; }
                    try {
                        const result = await pool.query('UPDATE products SET name = $1, price = $2, category = $3 WHERE id = $4 RETURNING *', 
                            [payload.name, parseFloat(payload.price), payload.category.toUpperCase(), payload.id]);
                        
                        if (result.rowCount > 0) {
                            const productIndexToUpdate = products.findIndex(p => p.id === payload.id);
                            if (productIndexToUpdate > -1) {
                                products[productIndexToUpdate] = {
                                    id: payload.id,
                                    name: payload.name,
                                    price: parseFloat(payload.price),
                                    category: payload.category.toUpperCase()
                                };
                            } else { // Hafızada yoksa ekle (normalde olmamalı)
                                products.push({id: payload.id, name: payload.name, price: parseFloat(payload.price), category: payload.category.toUpperCase()});
                            }
                            broadcastProductsUpdate();
                            ws.send(JSON.stringify({ type: 'main_menu_product_updated', payload: { message: `${payload.name} güncellendi.` }}));
                        } else {
                             ws.send(JSON.stringify({ type: 'error', payload: { message: 'Güncellenecek ürün veritabanında bulunamadı.' }}));
                        }
                    } catch (dbError) {
                        console.error("Ürün DB'de güncellenirken hata:", dbError);
                        ws.send(JSON.stringify({ type: 'error', payload: { message: 'Ürün veritabanında güncellenirken hata.' }}));
                    }
                    break;
                
                case 'bulk_update_products':
                    if (!ws.userId || ws.role !== 'cashier') {
                        ws.send(JSON.stringify({ type: 'error', payload: { message: 'Yetkiniz yok.' } }));
                        break;
                    }
                    const newProductList = payload.products;
                    if (!Array.isArray(newProductList)) {
                        ws.send(JSON.stringify({ type: 'error', payload: { message: 'Geçersiz ürün listesi formatı.' } }));
                        break;
                    }
                    const clientDB = await pool.connect();
                    try {
                        await clientDB.query('BEGIN');
                        await clientDB.query('DELETE FROM products');
                        let maxIdInNewList = 0;
                        for (const product of newProductList) {
                            if (!product.id || !product.name || product.price == null || !product.category) {
                                console.warn('Toplu güncellemede eksik ürün bilgisi, atlanıyor:', product);
                                continue; 
                            }
                            await clientDB.query(
                                'INSERT INTO products (id, name, price, category) VALUES ($1, $2, $3, $4)',
                                [product.id, product.name, parseFloat(product.price), product.category.toUpperCase()]
                            );
                            if (product.id > maxIdInNewList) maxIdInNewList = product.id;
                        }
                        await clientDB.query('COMMIT');
                        products = newProductList.map(p => ({ 
                            ...p,
                            price: parseFloat(p.price),
                            category: p.category.toUpperCase()
                        }));
                        nextProductIdInternal = maxIdInNewList + 1;
                        broadcastProductsUpdate();
                        ws.send(JSON.stringify({ type: 'bulk_update_success', payload: { message: 'Menü başarıyla güncellendi ve veritabanına kaydedildi.' } }));
                    } catch (dbError) {
                        await clientDB.query('ROLLBACK');
                        console.error('Toplu ürün güncelleme sırasında veritabanı hatası:', dbError);
                        ws.send(JSON.stringify({ type: 'error', payload: { message: 'Menü güncellenirken sunucu hatası oluştu.' } }));
                    } finally {
                        clientDB.release();
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
                    ws.send(JSON.stringify({ type: 'error', payload: { message: `Bilinmeyen istek tipi: ${type}` } }));
            }
        } catch (error) {
            console.error(`Mesaj işlenirken hata (${type}):`, error);
            try {
                ws.send(JSON.stringify({ type: 'error', payload: { message: 'Sunucu tarafında bir hata oluştu.' } }));
            } catch (sendError) {
                console.error("İstemciye hata mesajı gönderilemedi (Genel Hata):", sendError);
            }
        }
    });

    ws.on('close', () => {
        console.log('İstemci bağlantısı kesildi: ', ws.username || 'Bilinmeyen');
        ws.isAlive = false;
    });

    ws.on('error', (error) => {
        console.error('WebSocket hatası:', ws.username || 'Bilinmeyen', error);
    });
});

const interval = setInterval(function ping() {
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) {
        console.log("Aktif olmayan istemci sonlandırılıyor:", ws.username || 'Bilinmeyen');
        return ws.terminate();
    }
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

server.listen(PORT, async () => {
    console.log(`HTTP ve WebSocket sunucusu ${PORT} portunda çalışıyor.`);
    await loadProductsFromDB();
    if (process.env.NODE_ENV === 'production') {
        console.log("Uygulama üretim modunda çalışıyor.");
    } else {
        console.log("Uygulama geliştirme modunda çalışıyor.");
    }
    console.log(`Statik dosyalar '${path.join(__dirname, 'public')}' klasöründen sunuluyor.`);
});
