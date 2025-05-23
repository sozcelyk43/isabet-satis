const path = require('path');
const express = require('express');
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('Veritabanına bağlanırken hata oluştu:', err.stack);
    // Uygulamanın çökmesini engellemek için burada process.exit() KULLANILMAMALIDIR
    // Bunun yerine, uygulama başlangıçta veritabanı olmadan çalışmaya devam edebilir
    // veya periyodik olarak yeniden bağlanmayı deneyebilir.
    // Ancak bu örnek için basit bir loglama yapıyoruz.
    return;
  }
  client.query('SELECT NOW()', (err, result) => {
    release();
    if (err) {
      return console.error('Test sorgusu çalıştırılırken hata:', err.stack);
    }
    console.log('PostgreSQL veritabanına başarıyla bağlanıldı:', result.rows[0].now);
  });
});

const programAdi = "İsabet Satış Programı";
const masaSayisi = 2;

async function logActivity(action, details) {
  const query = `
    INSERT INTO activity_log (action, details, timestamp)
    VALUES ($1, $2, NOW()) RETURNING id;
  `;
  try {
    const res = await pool.query(query, [action, JSON.stringify(details)]);
    console.log('Aktivite loglandı, ID:', res.rows[0].id);
  } catch (err) {
    console.error('Aktivite loglama hatası:', err.stack);
  }
}

async function logSale(saleData) {
  const query = `
    INSERT INTO sales_log (items, total_amount, table_number, payment_type, timestamp)
    VALUES ($1, $2, $3, $4, NOW()) RETURNING id;
  `;
  try {
    const res = await pool.query(query, [JSON.stringify(saleData.items), saleData.total, saleData.tableId, saleData.paymentType]);
    console.log('Satış loglandı, ID:', res.rows[0].id);
    await logActivity('SALE_COMPLETED', { saleId: res.rows[0].id, total: saleData.total, tableId: saleData.tableId });
  } catch (err) {
    console.error('Satış loglama hatası:', err.stack);
  }
}

app.get('/api/info', (req, res) => {
  res.json({
    programAdi: programAdi,
    masaSayisi: masaSayisi,
    version: "1.0.0"
  });
});

app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products WHERE is_deleted = FALSE ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    await logActivity('ERROR_FETCHING_PRODUCTS', { error: err.message });
    res.status(500).send("Sunucu hatası: Ürünler alınamadı.");
  }
});

app.post('/api/products', async (req, res) => {
  const { name, price, description, stock } = req.body;
  if (!name || price === undefined) {
    return res.status(400).json({ message: "Ürün adı ve fiyatı zorunludur." });
  }
  try {
    const result = await pool.query(
      'INSERT INTO products (name, price, description, stock) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, parseFloat(price), description, parseInt(stock, 10) || 0]
    );
    await logActivity('PRODUCT_ADDED', { productId: result.rows[0].id, name: name });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    await logActivity('ERROR_ADDING_PRODUCT', { error: err.message, productData: req.body });
    res.status(500).send("Sunucu hatası: Ürün eklenemedi.");
  }
});

app.put('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  const { name, price, description, stock } = req.body;
  try {
    const result = await pool.query(
      'UPDATE products SET name = $1, price = $2, description = $3, stock = $4, updated_at = NOW() WHERE id = $5 AND is_deleted = FALSE RETURNING *',
      [name, parseFloat(price), description, parseInt(stock, 10), parseInt(id, 10)]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Güncellenecek ürün bulunamadı veya zaten silinmiş." });
    }
    await logActivity('PRODUCT_UPDATED', { productId: id, updatedData: req.body });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    await logActivity('ERROR_UPDATING_PRODUCT', { error: err.message, productId: id });
    res.status(500).send("Sunucu hatası: Ürün güncellenemedi.");
  }
});

app.delete('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'UPDATE products SET is_deleted = TRUE, updated_at = NOW() WHERE id = $1 AND is_deleted = FALSE RETURNING id',
      [parseInt(id, 10)]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Silinecek ürün bulunamadı veya zaten silinmiş." });
    }
    await logActivity('PRODUCT_DELETED', { productId: id });
    res.status(200).json({ message: "Ürün başarıyla silindi (işaretlendi).", productId: id });
  } catch (err) {
    console.error(err.message);
    await logActivity('ERROR_DELETING_PRODUCT', { error: err.message, productId: id });
    res.status(500).send("Sunucu hatası: Ürün silinemedi.");
  }
});

app.post('/api/sales', async (req, res) => {
  const { items, total, tableId, paymentType } = req.body;

  if (!items || !items.length || total === undefined || tableId === undefined) {
    return res.status(400).json({ message: "Eksik satış bilgisi: items, total ve tableId zorunludur." });
  }
  if (tableId < 1 || tableId > masaSayisi) {
     return res.status(400).json({ message: `Geçersiz masa numarası. Masa sayısı: ${masaSayisi}` });
  }

  try {
    await logSale({ items, total: parseFloat(total), tableId: parseInt(tableId, 10), paymentType: paymentType || 'Nakit' });
    res.status(201).json({
      message: "Satış başarıyla kaydedildi.",
      receiptData: {
        programAdi: programAdi,
        timestamp: new Date().toISOString(),
        table: tableId,
        items: items,
        totalAmount: total,
        paymentType: paymentType || 'Nakit'
      }
    });
  } catch (err) {
    console.error("Satış işlemi sırasında hata:", err.message);
    await logActivity('ERROR_PROCESSING_SALE', { error: err.message, saleData: req.body });
    res.status(500).send("Satış işlemi sırasında sunucu hatası.");
  }
});

app.get('/api/logs/sales', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const result = await pool.query('SELECT * FROM sales_log ORDER BY timestamp DESC LIMIT $1 OFFSET $2', [parseInt(limit, 10), parseInt(offset, 10)]);
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Sunucu hatası: Satış logları alınamadı.");
  }
});

app.get('/api/logs/activity', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const result = await pool.query('SELECT * FROM activity_log ORDER BY timestamp DESC LIMIT $1 OFFSET $2', [parseInt(limit, 10), parseInt(offset, 10)]);
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Sunucu hatası: Aktivite logları alınamadı.");
  }
});

app.get('/', (req, res) => {
  res.send(`${programAdi} sunucusuna hoş geldiniz! Masa Sayısı: ${masaSayisi}. Bağlantı durumu: ${pool.totalCount > 0 ? 'Bağlı' : 'Bağlı Değil (Kontrol Edin)'}`);
});

app.listen(PORT, () => {
  console.log(`${programAdi} sunucusu http://localhost:${PORT} adresinde çalışıyor`);
  if (process.env.NODE_ENV === 'production') {
    console.log("Uygulama üretim modunda çalışıyor.");
  } else {
    console.log("Uygulama geliştirme modunda çalışıyor.");
  }
  console.log(`Mevcut Masa Sayısı: ${masaSayisi}`);
});