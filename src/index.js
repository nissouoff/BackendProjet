require('dotenv').config();

const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 3001;
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'bottg-edbb0';
const BASE_URL = `https://${PROJECT_ID}-default-rtdb.firebaseio.com/`;

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
  databaseURL: `https://${PROJECT_ID}-default-rtdb.firebaseio.com`,
});

const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://localhost:3001'];

const vercelPatterns = [
  'alphafront',
  'alphafront-ncsdtg9ze'
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes('*')) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (vercelPatterns.some(p => origin.includes(p))) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.raw({ type: 'multipart/form-data', limit: '50mb' }));

async function rtdbRequest(path, method = 'GET', body = null) {
  const url = `${BASE_URL}${path}.json`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };
  
  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(url, options);
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || 'Realtime Database error');
  }
  
  return data;
}

async function verifyIdToken(idToken) {
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    console.error('Token verification failed:', error);
    throw new Error('Invalid token');
  }
}

app.post('/api/upload', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    await verifyIdToken(token);
    
    if (!req.body || !req.body.image) {
      return res.status(400).json({ message: 'No image provided' });
    }
    
    res.json({ 
      success: true,
      message: 'Image received' 
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: error.message || 'Upload failed' });
  }
});

app.get('/api/images/:path(*)', async (req, res) => {
  try {
    const path = req.params.path.replace(/\//g, '%2F');
    const data = await rtdbRequest(`/images/${req.params.path}`);
    
    if (!data || !data.data) {
      return res.status(404).json({ message: 'Image not found' });
    }
    
    res.json({ data: data.data });
  } catch (error) {
    res.status(404).json({ message: 'Image not found' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }
    
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName: name, returnSecureToken: true }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return res.status(400).json({ message: data.error?.message || 'Registration failed' });
    }
    
    await rtdbRequest(`/users/${data.localId}`, 'PUT', {
      uid: data.localId,
      name: name,
      email: email,
      createdAt: new Date().toISOString(),
    });
    
    res.status(201).json({
      message: 'Registration successful',
      user: {
        uid: data.localId,
        name,
        email,
      },
      token: data.idToken,
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: error.message || 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return res.status(401).json({ message: data.error?.message || 'Invalid credentials' });
    }
    
    res.json({
      message: 'Login successful',
      user: {
        uid: data.localId,
        email: data.email,
        name: data.displayName || '',
      },
      token: data.idToken,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: error.message || 'Login failed' });
  }
});

app.get('/api/landings/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const user = await verifyIdToken(token);
    
    const { id } = req.params;
    const landing = await rtdbRequest(`/landings/${id}`);
    
    if (!landing) {
      return res.status(404).json({ message: 'Landing not found' });
    }
    
    if (landing.userId !== user.uid) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    res.json({ landing: { id, ...landing } });
  } catch (error) {
    console.error('Get landing error:', error);
    res.status(500).json({ message: error.message || 'Failed to get landing' });
  }
});

app.put('/api/landings/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const user = await verifyIdToken(token);
    
    const { id } = req.params;
    const existing = await rtdbRequest(`/landings/${id}`);
    
    if (!existing) {
      return res.status(404).json({ message: 'Landing not found' });
    }
    
    if (existing.userId !== user.uid) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    const updates = { ...req.body, updatedAt: new Date().toISOString() };
    delete updates.id;
    
    await rtdbRequest(`/landings/${id}`, 'PATCH', updates);
    
    res.json({ message: 'Landing updated successfully' });
  } catch (error) {
    console.error('Update landing error:', error);
    res.status(500).json({ message: error.message || 'Failed to update landing' });
  }
});

app.delete('/api/landings/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const user = await verifyIdToken(token);
    
    const { id } = req.params;
    const existing = await rtdbRequest(`/landings/${id}`);
    
    if (!existing) {
      return res.status(404).json({ message: 'Landing not found' });
    }
    
    if (existing.userId !== user.uid) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    await rtdbRequest(`/landings/${id}`, 'DELETE');
    
    res.json({ message: 'Landing deleted successfully' });
  } catch (error) {
    console.error('Delete landing error:', error);
    res.status(500).json({ message: error.message || 'Failed to delete landing' });
  }
});

app.post('/api/landings/:id/publish', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const user = await verifyIdToken(token);
    
    const { id } = req.params;
    const existing = await rtdbRequest(`/landings/${id}`);
    
    if (!existing) {
      return res.status(404).json({ message: 'Landing not found' });
    }
    
    if (existing.userId !== user.uid) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    await rtdbRequest(`/landings/${id}`, 'PATCH', {
      isPublished: true,
      updatedAt: new Date().toISOString(),
    });
    
    res.json({ message: 'Landing published successfully' });
  } catch (error) {
    console.error('Publish landing error:', error);
    res.status(500).json({ message: error.message || 'Failed to publish landing' });
  }
});

app.post('/api/landings/:id/unpublish', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const user = await verifyIdToken(token);
    
    const { id } = req.params;
    const existing = await rtdbRequest(`/landings/${id}`);
    
    if (!existing) {
      return res.status(404).json({ message: 'Landing not found' });
    }
    
    if (existing.userId !== user.uid) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    await rtdbRequest(`/landings/${id}`, 'PATCH', {
      isPublished: false,
      updatedAt: new Date().toISOString(),
    });
    
    res.json({ message: 'Landing unpublished successfully' });
  } catch (error) {
    console.error('Unpublish landing error:', error);
    res.status(500).json({ message: error.message || 'Failed to unpublish landing' });
  }
});

app.get('/api/landings', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const user = await verifyIdToken(token);
    const { type } = req.query;
    
    const data = await rtdbRequest('/landings');
    const landings = [];
    
    if (data) {
      for (const [id, landing] of Object.entries(data)) {
        if (landing.userId === user.uid) {
          if (type === 'landing' && landing.isLanding === true) {
            landings.push({ id, ...landing });
          } else if (type === 'boutique' && landing.isLanding === false) {
            landings.push({ id, ...landing });
          } else if (!type) {
            landings.push({ id, ...landing });
          }
        }
      }
    }
    
    res.json({ landings });
  } catch (error) {
    console.error('Get landings error:', error);
    res.status(500).json({ message: error.message || 'Failed to get landings' });
  }
});

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
    const id = slug + '-' + Date.now();
    
    const defaultProduct = isLanding ? [{
      id: 'product_1',
      name: name,
      price: '0',
      description: '',
      biography: '',
      photos: [],
      mainPhoto: 0,
      stock: 100,
      unlimitedStock: true,
    }] : [];
    
    const landingData = {
      name,
      type,
      isLanding,
      slug,
      userId: user.uid,
      content: {
        brandName: name,
        logo: '',
        heroTitle: isLanding ? 'Découvrez ' + name : 'Bienvenue chez ' + name,
        heroSubtitle: isLanding ? 'Un produit de qualité pour vous' : 'Votre destination pour des produits de qualité',
        ctaButton: isLanding ? 'Commander maintenant' : 'Découvrir la collection',
        contactEmail: user.email,
        footerText: '© 2026 ' + name + '. All rights reserved.',
      },
      products: defaultProduct,
      isPublished: false,
      views: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await rtdbRequest(`/landings/${id}`, 'PUT', landingData);
    
    res.status(201).json({
      message: 'Landing page created',
      landing: { id, ...landingData },
    });
  } catch (error) {
    console.error('Create landing error:', error);
    res.status(500).json({ message: error.message || 'Failed to create landing' });
  }
});

app.get('/api/public/landing/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const landing = await rtdbRequest(`/landings/${id}`);
    
    if (!landing) {
      return res.status(404).json({ message: 'Landing not found' });
    }
    
    // Get reviews for this landing
    const reviewsData = await rtdbRequest(`/reviews/${id}`);
    const reviews = [];
    if (reviewsData) {
      for (const [reviewId, review] of Object.entries(reviewsData)) {
        reviews.push({ id: reviewId, ...review });
      }
    }
    reviews.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    // Get orders count for this landing
    const ordersData = await rtdbRequest('/orders');
    let ordersCount = 0;
    if (ordersData) {
      for (const [orderId, order] of Object.entries(ordersData)) {
        const orderData = order;
        if (orderData.landingId === id || orderData.landingSlug === id) {
          ordersCount++;
        }
      }
    }
    
    res.json({ landing: { id, ...landing, reviews, ordersCount } });
  } catch (error) {
    console.error('Get public landing error:', error);
    res.status(500).json({ message: error.message || 'Failed to get landing' });
  }
});

app.get('/api/shop/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    
    const data = await rtdbRequest('/landings');
    let landing = null;
    let landingId = null;
    
    if (data) {
      for (const [id, doc] of Object.entries(data)) {
        if (doc.slug === slug && doc.isPublished === true) {
          landingId = id;
          landing = doc;
          break;
        }
      }
    }
    
    if (!landing) {
      return res.status(404).json({ message: 'Shop not found' });
    }
    
    res.json({ landing: { id: landingId, ...landing } });
  } catch (error) {
    console.error('Get shop error:', error);
    res.status(500).json({ message: error.message || 'Failed to get shop' });
  }
});

app.post('/api/shop/:slug/view', async (req, res) => {
  try {
    const { slug } = req.params;
    const { ip } = req.body;
    
    const data = await rtdbRequest('/landings');
    let landingId = null;
    let landing = null;
    
    if (data) {
      for (const [id, doc] of Object.entries(data)) {
        if (doc.slug === slug) {
          landingId = id;
          landing = doc;
          break;
        }
      }
    }
    
    if (!landing) {
      return res.status(404).json({ message: 'Shop not found' });
    }
    
    const viewsData = await rtdbRequest('/landingViews');
    let alreadyViewed = false;
    
    if (viewsData) {
      for (const [viewId, view] of Object.entries(viewsData)) {
        if (view.landingId === landingId && view.ip === ip) {
          alreadyViewed = true;
          break;
        }
      }
    }
    
    if (!alreadyViewed) {
      const viewId = 'view-' + Date.now();
      await rtdbRequest(`/landingViews/${viewId}`, 'PUT', {
        landingId,
        ip: ip || 'direct',
        timestamp: new Date().toISOString(),
      });
      
      const currentViews = landing.views || 0;
      await rtdbRequest(`/landings/${landingId}`, 'PATCH', {
        views: currentViews + 1,
      });
    }
    
    res.json({ message: 'View tracked', alreadyViewed });
  } catch (error) {
    console.error('Track view error:', error);
    res.status(500).json({ message: error.message || 'Failed to track view' });
  }
});

app.post('/api/shop/:slug/order', async (req, res) => {
  try {
    const { slug } = req.params;
    const { productId, productName, productPrice, productPhoto, quantity, customerName, customer_firstname, phone, wilaya, commune, address, note, landingId } = req.body;
    
    if (!customerName || !phone || !wilaya) {
      return res.status(400).json({ message: 'Name, phone and wilaya are required' });
    }
    
    // Find the actual landing to get its slug
    let actualSlug = slug;
    if (landingId) {
      const landingData = await rtdbRequest(`/landings/${landingId}`);
      if (landingData && landingData.slug) {
        actualSlug = landingData.slug;
      }
    }
    
    const orderId = 'order-' + Date.now();
    const orderData = {
      landingSlug: actualSlug,
      landingId: landingId || slug,
      productId: productId || '',
      productName: productName || '',
      productPrice: productPrice || '0',
      productPhoto: productPhoto || null,
      quantity: quantity || 1,
      customerName,
      customer_firstname: customer_firstname || '',
      phone,
      wilaya,
      commune: commune || '',
      address: address || '',
      note: note || '',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    
    await rtdbRequest(`/orders/${orderId}`, 'PUT', orderData);
    
    res.status(201).json({
      message: 'Order placed successfully! You will receive a call to confirm.',
      order: { id: orderId, ...orderData },
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ message: error.message || 'Failed to create order' });
  }
});

// Submit a review for a landing
app.post('/api/landing/:id/review', async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, rating, comment } = req.body;
    
    if (!firstName || !lastName || !rating || !comment) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    
    const reviewId = 'review-' + Date.now();
    const reviewData = {
      id: reviewId,
      firstName,
      lastName,
      name: `${firstName} ${lastName}`,
      rating: parseInt(rating),
      comment,
      createdAt: new Date().toISOString(),
    };
    
    // Save to reviews collection
    await rtdbRequest(`/reviews/${id}/${reviewId}`, 'PUT', reviewData);
    
    res.status(201).json({
      message: 'Review submitted successfully!',
      review: reviewData,
    });
  } catch (error) {
    console.error('Create review error:', error);
    res.status(500).json({ message: error.message || 'Failed to create review' });
  }
});

const WILAYAS = [
  'Adrar', 'Chlef', 'Laghouat', 'Oum El Bouaghi', 'Batna', 'Bejaia', 'Biskra',
  'Bechar', 'Blida', 'Bouira', 'Tamanrasset', 'Tebessa', 'Tlemcen', 'Tiaret',
  'Tizi Ouzou', 'Alger', 'Djelfa', 'Jijel', 'Setif', 'Saida', 'Skikda',
  'Sidi Bel Abbes', 'Annaba', 'Guelma', 'Constantine', 'Medea', 'Mostaganem',
  'Msila', 'Mascara', 'Ouargla', 'Oran', 'El Bayadh', 'Illizi', 'Bordj Bou Arreridj',
  'Mila', 'Tissemsilt', 'El Oued', 'Khenchela', 'Souk Ahras',
  'Tipaza', 'Ain Defla', 'Naama', 'Ain Temouchent', 'Relizane'
];

app.get('/api/orders', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const user = await verifyIdToken(token);
    const { limit = 100, landingSlug } = req.query;
    const limitNum = Math.min(parseInt(limit) || 100, 500);
    
    const landingsData = await rtdbRequest('/landings');
    const userLandings = new Map();
    
    if (landingsData) {
      for (const [id, doc] of Object.entries(landingsData)) {
        if (doc.userId === user.uid) {
          userLandings.set(doc.slug, id);
        }
      }
    }
    
    const ordersData = await rtdbRequest('/orders');
    const orders = [];
    
    if (ordersData) {
      for (const [id, doc] of Object.entries(ordersData)) {
        const orderLandingSlug = doc.landingSlug;
        if (userLandings.has(orderLandingSlug)) {
          if (!landingSlug || landingSlug === orderLandingSlug) {
            orders.push({ id, ...doc });
          }
        }
      }
    }
    
    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    const totalCount = orders.length;
    const paginatedOrders = orders.slice(0, limitNum);
    
    res.json({ 
      orders: paginatedOrders, 
      total: totalCount,
      hasMore: totalCount > limitNum 
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const user = await verifyIdToken(token);
    
    const { id } = req.params;
    const order = await rtdbRequest(`/orders/${id}`);
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    const landingsData = await rtdbRequest('/landings');
    let isOwner = false;
    
    if (landingsData) {
      for (const doc of Object.values(landingsData)) {
        if (doc.slug === order.landingSlug && doc.userId === user.uid) {
          isOwner = true;
          break;
        }
      }
    }
    
    if (!isOwner) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    res.json({ order: { id, ...order } });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ message: error.message || 'Failed to get order' });
  }
});

app.put('/api/orders/:id/status', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const user = await verifyIdToken(token);
    
    const { id } = req.params;
    const { status, returnLoss, blockReason } = req.body;
    
    const validStatuses = ['pending', 'processing', 'paid', 'returned'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    
    const order = await rtdbRequest(`/orders/${id}`);
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    const landingsData = await rtdbRequest('/landings');
    let isOwner = false;
    
    if (landingsData) {
      for (const doc of Object.values(landingsData)) {
        if (doc.slug === order.landingSlug && doc.userId === user.uid) {
          isOwner = true;
          break;
        }
      }
    }
    
    if (!isOwner) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    const updates = {
      status,
      updatedAt: new Date().toISOString(),
    };
    
    if (status === 'returned') {
      if (returnLoss) {
        updates.returnLoss = returnLoss;
      }
      if (blockReason) {
        updates.returnReason = blockReason;
      }
    }
    
    await rtdbRequest(`/orders/${id}`, 'PATCH', updates);
    
    res.json({ message: 'Order status updated successfully' });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ message: error.message || 'Failed to update order status' });
  }
});

app.get('/api/wilayas', (req, res) => {
  res.json({ wilayas: WILAYAS });
});

app.get('/api/analytics', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const user = await verifyIdToken(token);
    
    const landingsData = await rtdbRequest('/landings');
    const userLandings = [];
    const userLandingSlugs = [];
    
    if (landingsData) {
      for (const [id, doc] of Object.entries(landingsData)) {
        if (doc.userId === user.uid) {
          userLandings.push({ id, ...doc });
          userLandingSlugs.push(doc.slug);
        }
      }
    }
    
    const totalLandings = userLandings.length;
    const publishedLandings = userLandings.filter(doc => doc.isPublished === true).length;
    const totalViews = userLandings.reduce((sum, doc) => sum + (parseInt(doc.views) || 0), 0);
    
    const ordersData = await rtdbRequest('/orders');
    const userOrders = [];
    
    if (ordersData) {
      for (const [id, doc] of Object.entries(ordersData)) {
        if (userLandingSlugs.includes(doc.landingSlug)) {
          userOrders.push({ id, ...doc });
        }
      }
    }
    
    const totalOrders = userOrders.length;
    const pendingOrders = userOrders.filter(doc => doc.status === 'pending').length;
    const confirmedOrders = userOrders.filter(doc => ['confirmed', 'shipped', 'delivered'].includes(doc.status)).length;
    
    const revenue = userOrders
      .filter(doc => ['confirmed', 'shipped', 'delivered'].includes(doc.status))
      .reduce((sum, doc) => sum + (parseFloat(doc.productPrice || 0) * parseInt(doc.quantity || 1)), 0);
    
    const ordersByWilaya = {};
    userOrders.forEach(order => {
      if (order.wilaya) {
        ordersByWilaya[order.wilaya] = (ordersByWilaya[order.wilaya] || 0) + 1;
      }
    });
    
    const recentOrders = [...userOrders]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 10);
    
    res.json({
      stats: {
        totalLandings,
        publishedLandings,
        totalViews,
        totalOrders,
        pendingOrders,
        confirmedOrders,
        revenue,
      },
      ordersByWilaya,
      recentOrders,
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ message: error.message || 'Failed to get analytics' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api', (req, res) => {
  res.json({ 
    message: 'ShopLaunch API',
    version: '1.0.0',
    status: 'running',
    firebase: PROJECT_ID,
  });
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
  });
});

app.listen(PORT, () => {
  console.log(`ShopLaunch API running on port ${PORT}`);
  console.log(`Firebase Project: ${PROJECT_ID}`);
});

module.exports = app;
