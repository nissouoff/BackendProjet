const express = require('express');
const router = express.Router();

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

router.get('/orders', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const parts = token.split('.');
    let userId = '';
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      userId = payload.sub || payload.user_id || '';
    }
    
    const { data: landings } = await supabase
      .from('landings')
      .select('id')
      .eq('user_id', userId);
    
    const landingIds = landings?.map(l => l.id) || [];
    
    if (landingIds.length === 0) {
      return res.json({ orders: [] });
    }
    
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .in('landing_id', landingIds)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    const orders = (data || []).map(order => ({
      id: order.id,
      landingId: order.landing_id,
      landingSlug: order.landing_id,
      productId: order.product_id || '',
      productName: order.product_name || '',
      quantity: order.quantity || 1,
      total: order.total || 0,
      customerName: order.customer_name || '',
      customerPhone: order.customer_phone || '',
      customerWilaya: order.customer_wilaya || '',
      customerCommune: order.customer_commune || '',
      customerAddress: order.customer_address || '',
      phone: order.customer_phone || '',
      wilaya: order.customer_wilaya || '',
      commune: order.customer_commune || '',
      address: order.customer_address || '',
      status: order.status || 'pending',
      createdAt: order.created_at,
      updatedAt: order.updated_at,
    }));

    res.json({ orders });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ message: 'Failed to get orders' });
  }
});

router.post('/shop/:slug/order', async (req, res) => {
  try {
    const { productName, productPrice, customerName, phone, wilaya, commune, address } = req.body;

    if (!customerName || !phone || !wilaya) {
      return res.status(400).json({ message: 'Name, phone and wilaya are required' });
    }

    let landing = null;
    let landingId = req.params.slug;
    
    // Try to find by slug first
    const { data: landingBySlug, error: slugError } = await supabase
      .from('landings')
      .select('*')
      .eq('slug', req.params.slug)
      .single();

    if (!slugError && landingBySlug) {
      landing = landingBySlug;
      landingId = landingBySlug.id;
    }

    // If not found by slug, try by ID directly
    if (!landing) {
      const { data: landingById, error: idError } = await supabase
        .from('landings')
        .select('*')
        .eq('id', req.params.slug)
        .single();
      
      if (!idError && landingById) {
        landing = landingById;
        landingId = landingById.id;
      }
    }

    // If still not found, return error
    if (!landing) {
      return res.status(404).json({ message: 'Shop not found: ' + req.params.slug });
    }

    const total = parseFloat(productPrice || 0);

    const { data, error } = await supabase
      .from('orders')
      .insert({
        landing_id: landingId,
        product_name: productName || '',
        quantity: 1,
        total: total,
        customer_name: customerName,
        customer_phone: phone,
        customer_wilaya: wilaya,
        customer_commune: commune || '',
        customer_address: address || '',
        status: 'pending',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      message: 'Order placed successfully! You will receive a call to confirm.',
      order: { id: data.id, ...data },
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ message: error.message || 'Failed to create order' });
  }
});

router.put('/orders/:id/status', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const parts = token.split('.');
    let userId = '';
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      userId = payload.sub || payload.user_id || '';
    }

    const { status } = req.body;
    const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    // Get order and verify ownership
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*, landing:landings(user_id)')
      .eq('id', req.params.id)
      .single();
    
    if (orderError || !order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.landing?.user_id !== userId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { error } = await supabase
      .from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ message: 'Order status updated', status });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ message: error.message || 'Failed to update order status' });
  }
});

router.get('/wilayas', (req, res) => {
  res.json({ wilayas: WILAYAS });
});

module.exports = router;
