const express = require('express');
const router = express.Router();
const { db } = require('../firebase');
const { verifyToken } = require('../middleware/auth');

const WILAYAS = [
  'Adrar', 'Chlef', 'Laghouat', 'Oum El Bouaghi', 'Batna', 'Bejaia', 'Biskra',
  'Bechar', 'Blida', 'Bouira', 'Tamanrasset', 'Tebessa', 'Tlemcen', 'Tiaret',
  'Tizi Ouzou', 'Alger', 'Djelfa', 'Jijel', 'Setif', 'Saida', 'Skikda',
  'Sidi Bel Abbes', 'Annaba', 'Guelma', 'Constantine', 'Medea', 'Mostaganem',
  'Msila', 'Mascara', 'Ouargla', 'Oran', 'El Bayadh', 'Illizi', 'Bordj Bou Arreridj',
  'Beni Ourtilane', 'Mila', 'Tissemsilt', 'El Oued', 'Khenchela', 'Souk Ahras',
  'Tipaza', 'Mila', 'Ain Defla', 'Naama', 'Ain Temouchent', 'El Bayadh',
  'Relizane', 'Timimoun', 'Bordj Badji Mokhtar', 'Ouled Djellal', 'Boukadir',
  'Telagh', 'In Salah', 'In Guezzam'
];

router.get('/orders', verifyToken, async (req, res) => {
  try {
    const ordersSnapshot = await db.collection('orders')
      .where('userId', '==', req.user.uid)
      .orderBy('createdAt', 'desc')
      .get();

    const orders = [];
    ordersSnapshot.forEach(doc => {
      orders.push({ id: doc.id, ...doc.data() });
    });

    res.json({ orders });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ message: 'Failed to get orders' });
  }
});

router.post('/shop/:slug/order', async (req, res) => {
  try {
    const { productId, productName, productPrice, quantity, customerName, phone, address, wilaya, commune, note } = req.body;

    if (!customerName || !phone || !wilaya) {
      return res.status(400).json({ message: 'Name, phone and wilaya are required' });
    }

    const landingsSnapshot = await db.collection('landings')
      .where('slug', '==', req.params.slug)
      .limit(1)
      .get();

    if (landingsSnapshot.empty) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    const landingDoc = landingsSnapshot.docs[0];

    const orderData = {
      landingId: landingDoc.id,
      landingName: landingDoc.data().name,
      userId: landingDoc.data().userId,
      productId: productId || '',
      productName: productName || '',
      productPrice: productPrice || '0',
      quantity: parseInt(quantity) || 1,
      total: (parseFloat(productPrice || 0) * (parseInt(quantity) || 1)).toString(),
      customerName,
      phone,
      wilaya,
      commune: commune || '',
      address: address || '',
      note: note || '',
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const docRef = await db.collection('orders').add(orderData);

    res.status(201).json({
      message: 'Order placed successfully! You will receive a call to confirm.',
      order: { id: docRef.id, ...orderData },
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ message: 'Failed to create order' });
  }
});

router.put('/orders/:id/status', verifyToken, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const orderRef = db.collection('orders').doc(req.params.id);
    const orderDoc = await orderRef.get();
    
    if (!orderDoc.exists || orderDoc.data().userId !== req.user.uid) {
      return res.status(404).json({ message: 'Order not found' });
    }

    await orderRef.update({ status, updatedAt: new Date().toISOString() });

    res.json({ message: 'Order status updated', status });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ message: 'Failed to update order status' });
  }
});

router.get('/wilayas', (req, res) => {
  res.json({ wilayas: WILAYAS });
});

module.exports = router;
