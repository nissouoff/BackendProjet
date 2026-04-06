require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3001;

// Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase configuration');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://localhost:3001'];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes('*')) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (origin.includes('vercel.app') || origin.includes('localhost')) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Verify Firebase token (for backward compatibility)
async function verifyIdToken(idToken) {
  // For now, we'll use a simple user ID extraction
  // In production, verify with Firebase Admin SDK
  try {
    // Decode JWT to get user info (basic validation)
    const parts = idToken.split('.');
    if (parts.length !== 3) throw new Error('Invalid token format');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    return { uid: payload.sub || payload.user_id || idToken, email: payload.email };
  } catch (error) {
    console.error('Token verification failed:', error);
    throw new Error('Invalid token');
  }
}

// ============ LANDINGS ROUTES ============

// Get all landings
app.get('/api/landings', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const user = await verifyIdToken(token);
    const { type } = req.query;
    
    let query = supabase
      .from('landings')
      .select('*')
      .eq('user_id', user.uid);
    
    if (type === 'landing') {
      query = query.eq('is_landing', true);
    } else if (type === 'boutique') {
      query = query.eq('is_landing', false);
    }
    
    query = query.order('created_at', { ascending: false });
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    const landings = (data || []).map(landing => ({
      id: landing.id,
      ...landing,
      userId: landing.user_id,
      createdAt: landing.created_at,
      updatedAt: landing.updated_at,
      isPublished: landing.is_published,
      isLanding: landing.is_landing,
    }));
    
    res.json({ landings });
  } catch (error) {
    console.error('Get landings error:', error);
    res.status(500).json({ message: error.message || 'Failed to get landings' });
  }
});

// Create landing
app.post('/api/landings', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const user = await verifyIdToken(token);
    
    const { name, type, isLanding = true } = req.body;
    
    if (!name || !type) {
      return res.status(400).json({ message: 'Name and type are required' });
    }
    
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    
    const landingData = {
      name,
      type,
      slug,
      user_id: user.uid,
      is_landing: isLanding,
      content: {
        brandName: name,
        logo: '',
        heroTitle: 'Welcome to ' + name,
        heroSubtitle: 'Your trusted destination for quality products',
        ctaButton: 'Shop Now',
        contactEmail: user.email || '',
        footerText: '© 2026 ' + name + '. All rights reserved.',
      },
      products: [],
      is_published: false,
      views: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    const { data, error } = await supabase
      .from('landings')
      .insert(landingData)
      .select()
      .single();
    
    if (error) throw error;
    
    res.status(201).json({
      message: 'Landing page created',
      landing: { id: data.id, ...data },
    });
  } catch (error) {
    console.error('Create landing error:', error);
    res.status(500).json({ message: error.message || 'Failed to create landing' });
  }
});

// Get single landing
app.get('/api/landings/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const user = await verifyIdToken(token);
    
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from('landings')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error || !data) {
      return res.status(404).json({ message: 'Landing not found' });
    }
    
    if (data.user_id !== user.uid) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    res.json({ 
      landing: { 
        id: data.id, 
        ...data,
        userId: data.user_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        isPublished: data.is_published,
      } 
    });
  } catch (error) {
    console.error('Get landing error:', error);
    res.status(500).json({ message: error.message || 'Failed to get landing' });
  }
});

// Update landing
app.put('/api/landings/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const user = await verifyIdToken(token);
    
    const { id } = req.params;
    
    // Get existing landing
    const { data: existing, error: fetchError } = await supabase
      .from('landings')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fetchError || !existing) {
      return res.status(404).json({ message: 'Landing not found' });
    }
    
    if (existing.user_id !== user.uid) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    // Prepare update data
    const updates = { ...req.body, updated_at: new Date().toISOString() };
    delete updates.id;
    delete updates.user_id;
    delete updates.created_at;
    
    // Map snake_case to camelCase for DB
    if (updates.isPublished !== undefined) {
      updates.is_published = updates.isPublished;
      delete updates.isPublished;
    }
    if (updates.isLanding !== undefined) {
      updates.is_landing = updates.isLanding;
      delete updates.isLanding;
    }
    
    const { data, error } = await supabase
      .from('landings')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({
      message: 'Landing updated',
      landing: { id: data.id, ...data },
    });
  } catch (error) {
    console.error('Update landing error:', error);
    res.status(500).json({ message: error.message || 'Failed to update landing' });
  }
});

// Delete landing
app.delete('/api/landings/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const user = await verifyIdToken(token);
    
    const { id } = req.params;
    
    // Get existing landing
    const { data: existing, error: fetchError } = await supabase
      .from('landings')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fetchError || !existing) {
      return res.status(404).json({ message: 'Landing not found' });
    }
    
    if (existing.user_id !== user.uid) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    const { error } = await supabase
      .from('landings')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    
    res.json({ message: 'Landing deleted successfully' });
  } catch (error) {
    console.error('Delete landing error:', error);
    res.status(500).json({ message: error.message || 'Failed to delete landing' });
  }
});

// Publish landing
app.post('/api/landings/:id/publish', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const user = await verifyIdToken(token);
    
    const { id } = req.params;
    
    // Get existing landing
    const { data: existing, error: fetchError } = await supabase
      .from('landings')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fetchError || !existing) {
      return res.status(404).json({ message: 'Landing not found' });
    }
    
    if (existing.user_id !== user.uid) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    const { error } = await supabase
      .from('landings')
      .update({ is_published: true, updated_at: new Date().toISOString() })
      .eq('id', id);
    
    if (error) throw error;
    
    res.json({ message: 'Landing published successfully' });
  } catch (error) {
    console.error('Publish landing error:', error);
    res.status(500).json({ message: error.message || 'Failed to publish landing' });
  }
});

// Unpublish landing
app.post('/api/landings/:id/unpublish', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const user = await verifyIdToken(token);
    
    const { id } = req.params;
    
    // Get existing landing
    const { data: existing, error: fetchError } = await supabase
      .from('landings')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fetchError || !existing) {
      return res.status(404).json({ message: 'Landing not found' });
    }
    
    if (existing.user_id !== user.uid) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    const { error } = await supabase
      .from('landings')
      .update({ is_published: false, updated_at: new Date().toISOString() })
      .eq('id', id);
    
    if (error) throw error;
    
    res.json({ message: 'Landing unpublished successfully' });
  } catch (error) {
    console.error('Unpublish landing error:', error);
    res.status(500).json({ message: error.message || 'Failed to unpublish landing' });
  }
});

// ============ PUBLIC ROUTES ============

// Get public landing by slug
app.get('/api/public/landing/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from('landings')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error || !data) {
      return res.status(404).json({ message: 'Landing not found' });
    }

    // Get reviews for this landing
    const { data: reviews, error: reviewsError } = await supabase
      .from('reviews')
      .select('*')
      .eq('landing_id', id)
      .order('created_at', { ascending: false });
    
    res.json({ 
      landing: { 
        id: data.id, 
        ...data,
        userId: data.user_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        isPublished: data.is_published,
        reviews: reviews || [],
      } 
    });
  } catch (error) {
    console.error('Get public landing error:', error);
    res.status(500).json({ message: error.message || 'Failed to get landing' });
  }
});

// Add review to landing
app.post('/api/public/landing/:id/review', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, rating, comment } = req.body;

    if (!name || !comment) {
      return res.status(400).json({ message: 'Name and comment are required' });
    }

    // Check if landing exists
    const { data: landing, error: landingError } = await supabase
      .from('landings')
      .select('id')
      .eq('id', id)
      .single();

    if (landingError || !landing) {
      return res.status(404).json({ message: 'Landing not found' });
    }

    // Insert review
    const { data, error } = await supabase
      .from('reviews')
      .insert({
        landing_id: id,
        name: name,
        rating: rating || 5,
        comment: comment,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ 
      message: 'Review added successfully',
      review: data 
    });
  } catch (error) {
    console.error('Add review error:', error);
    res.status(500).json({ message: error.message || 'Failed to add review' });
  }
});

// Get shop by slug (published landing)
app.get('/api/shop/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    
    const { data, error } = await supabase
      .from('landings')
      .select('*')
      .eq('slug', slug)
      .eq('is_published', true)
      .single();
    
    if (error || !data) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    // Get reviews for this landing
    const { data: reviews, error: reviewsError } = await supabase
      .from('reviews')
      .select('*')
      .eq('landing_id', data.id)
      .order('created_at', { ascending: false });
    
    res.json({ 
      landing: { 
        id: data.id, 
        ...data,
        userId: data.user_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        isPublished: data.is_published,
        reviews: reviews || [],
      } 
    });
  } catch (error) {
    console.error('Get shop error:', error);
    res.status(500).json({ message: error.message || 'Failed to get shop' });
  }
});

// Track view
app.post('/api/shop/:slug/view', async (req, res) => {
  try {
    const { slug } = req.params;
    const { ip } = req.body;
    
    // Increment views
    const { data: landing } = await supabase
      .from('landings')
      .select('views')
      .eq('slug', slug)
      .single();
    
    if (landing) {
      await supabase
        .from('landings')
        .update({ views: (landing.views || 0) + 1 })
        .eq('slug', slug);
    }
    
    res.json({ message: 'View tracked' });
  } catch (error) {
    console.error('Track view error:', error);
    res.status(500).json({ message: error.message || 'Failed to track view' });
  }
});

// Get reviews for a shop
app.get('/api/shop/:slug/reviews', async (req, res) => {
  try {
    const { slug } = req.params;
    
    // Get landing
    const { data: landing, error: landingError } = await supabase
      .from('landings')
      .select('id')
      .eq('slug', slug)
      .single();
    
    if (landingError || !landing) {
      return res.status(404).json({ message: 'Shop not found' });
    }
    
    // Get reviews
    const { data: reviews, error: reviewsError } = await supabase
      .from('reviews')
      .select('*')
      .eq('landing_id', landing.id)
      .order('created_at', { ascending: false });
    
    if (reviewsError) throw reviewsError;
    
    const formattedReviews = (reviews || []).map(r => ({
      id: r.id,
      name: r.name,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.created_at,
    }));
    
    res.json({ reviews: formattedReviews });
  } catch (error) {
    console.error('Get reviews error:', error);
    res.status(500).json({ message: error.message || 'Failed to get reviews' });
  }
});

// Add review
app.post('/api/shop/:slug/review', async (req, res) => {
  try {
    const { slug } = req.params;
    const { name, rating, comment } = req.body;
    
    if (!name || !rating) {
      return res.status(400).json({ message: 'Name and rating are required' });
    }
    
    // Get landing
    const { data: landing } = await supabase
      .from('landings')
      .select('id')
      .eq('slug', slug)
      .single();
    
    if (!landing) {
      return res.status(404).json({ message: 'Shop not found' });
    }
    
    const { data, error } = await supabase
      .from('reviews')
      .insert({
        landing_id: landing.id,
        name,
        rating: parseInt(rating),
        comment: comment || '',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();
    
    if (error) throw error;
    
    res.status(201).json({ 
      message: 'Review added',
      review: {
        id: data.id,
        name: data.name,
        rating: data.rating,
        comment: data.comment,
        createdAt: data.created_at,
      }
    });
  } catch (error) {
    console.error('Add review error:', error);
    res.status(500).json({ message: error.message || 'Failed to add review' });
  }
});

// ============ ORDERS ROUTES ============

// Get orders
app.get('/api/orders', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const user = await verifyIdToken(token);
    const { landing_id, status } = req.query;
    
    // Get user's landings
    const { data: landings } = await supabase
      .from('landings')
      .select('id')
      .eq('user_id', user.uid);
    
    const landingIds = landings?.map(l => l.id) || [];
    
    if (landingIds.length === 0) {
      return res.json({ orders: [] });
    }
    
    let query = supabase
      .from('orders')
      .select('*')
      .in('landing_id', landingIds)
      .order('created_at', { ascending: false });
    
    if (landing_id) {
      query = query.eq('landing_id', landing_id);
    }
    
    if (status) {
      query = query.eq('status', status);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    const orders = (data || []).map(order => ({
      id: order.id,
      landingId: order.landing_id,
      landingSlug: order.landing_id,
      productId: order.product_id || '',
      productName: order.product_name || '',
      productPrice: order.product_price || '',
      productPhoto: order.product_photo || '',
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
    res.status(500).json({ message: error.message || 'Failed to get orders' });
  }
});

// Create order
app.post('/api/orders', async (req, res) => {
  try {
    const { landingId, productId, productName, quantity, total, customer, shippingAddress } = req.body;
    
    if (!landingId || !customer || !total) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    
    const { data, error } = await supabase
      .from('orders')
      .insert({
        landing_id: landingId,
        product_id: productId || null,
        product_name: productName || '',
        quantity: quantity || 1,
        total: parseFloat(total),
        customer_name: customer.name,
        customer_phone: customer.phone,
        customer_wilaya: customer.wilaya || '',
        customer_commune: customer.commune || '',
        customer_address: customer.address || '',
        shipping_address: shippingAddress || '',
        status: 'pending',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();
    
    if (error) throw error;
    
    res.status(201).json({
      message: 'Order created successfully',
      order: { id: data.id, ...data },
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ message: error.message || 'Failed to create order' });
  }
});

// Create order via shop slug (for public landing pages)
app.post('/api/shop/:slug/order', async (req, res) => {
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
    console.error('Create shop order error:', error);
    res.status(500).json({ message: error.message || 'Failed to create order' });
  }
});

// Update order status
app.put('/api/orders/:id/status', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const user = await verifyIdToken(token);
    
    const { id } = req.params;
    const { status } = req.body;
    
    // Verify ownership
    const { data: order } = await supabase
      .from('orders')
      .select('*, landing:landings(user_id)')
      .eq('id', id)
      .single();
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    if (order.landing?.user_id !== user.uid) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    const { error } = await supabase
      .from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    
    if (error) throw error;
    
    res.json({ message: 'Order status updated' });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ message: error.message || 'Failed to update order status' });
  }
});

// Delete order
app.delete('/api/orders/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const user = await verifyIdToken(token);
    
    const { id } = req.params;
    
    // Get order and verify ownership
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*, landing:landings(user_id)')
      .eq('id', id)
      .single();
    
    if (orderError || !order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    if (order.landing?.user_id !== user.uid) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    const { error } = await supabase
      .from('orders')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    
    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    console.error('Delete order error:', error);
    res.status(500).json({ message: error.message || 'Failed to delete order' });
  }
});

// ============ UPLOAD ROUTE ============

app.post('/api/upload', async (req, res) => {
  try {
    const { image, folder = 'general' } = req.body;
    
    if (!image) {
      return res.status(400).json({ message: 'Image data is required' });
    }
    
    // For now, return the base64 image as URL
    // In production, upload to Supabase Storage
    const url = image;
    
    res.json({ url });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: error.message || 'Failed to upload' });
  }
});

// ============ HEALTH CHECK ============

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Supabase URL: ${supabaseUrl}`);
});

module.exports = app;
