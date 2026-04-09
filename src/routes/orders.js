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

async function verifyIdToken(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token format');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
  return { uid: payload.sub || payload.user_id || payload.id || token, email: payload.email };
}

// Get all orders for user
router.get('/orders', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const user = await verifyIdToken(token);
    
    // Get user's landing IDs
    const { data: landings } = await supabase
      .from('landings')
      .select('id')
      .eq('user_id', user.uid);
    
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

// Create order (public endpoint)
router.post('/shop/:slug/order', async (req, res) => {
  try {
    const { productId, productName, productPrice, customerName, phone, wilaya, commune, address } = req.body;

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

    // Check and update stock
    if (landing.products && landing.products.length > 0) {
      let product = landing.products.find(p => p.id === productId);
      if (!product && productId && productId !== 'default') {
        product = landing.products.find(p => p.name === productName);
      }
      if (!product) {
        product = landing.products[0];
      }
      
      if (product && !product.unlimitedStock) {
        if (product.stock === 0) {
          return res.status(400).json({ 
            message: 'Désolé, ce produit est en rupture de stock.',
            outOfStock: true 
          });
        }
        
        // Decrement stock
        const updatedProducts = landing.products.map((p, index) => {
          const matches = (p.id === product.id) || 
                         (productId === 'default' && index === 0) ||
                         (!p.id && !product.id && index === 0);
          if (matches) {
            return { ...p, stock: Math.max(0, (p.stock || 0) - 1) };
          }
          return p;
        });
        
        await supabase
          .from('landings')
          .update({ products: updatedProducts })
          .eq('id', landingId);
        
        console.log('Stock decremented for product:', product.name);
        
        const updatedProduct = updatedProducts.find(p => p.id === product.id);
        if (updatedProduct && !updatedProduct.unlimitedStock && updatedProduct.stock <= 5 && updatedProduct.stock > 0) {
          console.log(`📦 Stock bas pour ${product.name}: ${updatedProduct.stock} restants`);
        }
        if (updatedProduct && !updatedProduct.unlimitedStock && updatedProduct.stock === 0) {
          console.log(`🚨 Rupture de stock pour ${product.name}!`);
        }
      }
    }

    const total = parseFloat(productPrice || 0);

    const { data, error } = await supabase
      .from('orders')
      .insert({
        landing_id: landingId,
        product_id: productId || null,
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
      message: 'Commande passée avec succès! Vous recevrez un appel pour confirmer.',
      order: { id: data.id, ...data },
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ message: error.message || 'Failed to create order' });
  }
});

// Update order status
router.put('/orders/:id/status', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const user = await verifyIdToken(token);

    const { status } = req.body;
    const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'returned', 'paid'];
    
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

    if (order.landing?.user_id !== user.uid) {
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

// Delete order
router.delete('/orders/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const user = await verifyIdToken(token);

    // Get order and verify ownership
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*, landing:landings(user_id)')
      .eq('id', req.params.id)
      .single();
    
    if (orderError || !order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.landing?.user_id !== user.uid) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    // Update status to deleted instead of hard delete
    const { error } = await supabase
      .from('orders')
      .update({ status: 'deleted', updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ message: 'Order deleted' });
  } catch (error) {
    console.error('Delete order error:', error);
    res.status(500).json({ message: error.message || 'Failed to delete order' });
  }
});

// Get stock status for a landing
router.get('/landing/:slug/stock', async (req, res) => {
  try {
    let landing = null;
    
    // Try to find by slug first
    const { data: landingBySlug, error: slugError } = await supabase
      .from('landings')
      .select('products')
      .eq('slug', req.params.slug)
      .single();

    if (!slugError && landingBySlug) {
      landing = landingBySlug;
    }

    // If not found by slug, try by ID directly
    if (!landing) {
      const { data: landingById, error: idError } = await supabase
        .from('landings')
        .select('products')
        .eq('id', req.params.slug)
        .single();
      
      if (!idError && landingById) {
        landing = landingById;
      }
    }

    if (!landing) {
      return res.status(404).json({ message: 'Landing not found' });
    }

    const products = landing.products || [];
    const stockStatus = products.map(p => ({
      id: p.id,
      name: p.name,
      stock: p.unlimitedStock ? null : (p.stock || 0),
      unlimitedStock: p.unlimitedStock,
      available: p.unlimitedStock || (p.stock || 0) > 0
    }));

    res.json({ stockStatus });
  } catch (error) {
    console.error('Get stock error:', error);
    res.status(500).json({ message: 'Failed to get stock' });
  }
});

// Get wilayas
router.get('/wilayas', (req, res) => {
  res.json({ wilayas: WILAYAS });
});

module.exports = router;
