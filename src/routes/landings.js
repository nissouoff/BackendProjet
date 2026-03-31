const express = require('express');
const router = express.Router();
const { db } = require('../firebase');
const { verifyToken } = require('../middleware/auth');

router.get('/landings', verifyToken, async (req, res) => {
  try {
    const landingsSnapshot = await db.collection('landings')
      .where('userId', '==', req.user.uid)
      .orderBy('createdAt', 'desc')
      .get();

    const landings = [];
    landingsSnapshot.forEach(doc => {
      landings.push({ id: doc.id, ...doc.data() });
    });

    res.json({ landings });
  } catch (error) {
    console.error('Get landings error:', error);
    res.status(500).json({ message: 'Failed to get landings' });
  }
});

router.post('/landings', verifyToken, async (req, res) => {
  try {
    const { name, type } = req.body;
    
    if (!name || !type) {
      return res.status(400).json({ message: 'Name and type are required' });
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    
    const landingData = {
      name,
      type,
      slug,
      userId: req.user.uid,
      content: {
        brandName: name,
        logo: '',
        heroTitle: 'Welcome to ' + name,
        heroSubtitle: 'Your trusted destination for quality products',
        ctaButton: 'Shop Now',
        contactEmail: req.user.email,
        footerText: '© 2026 ' + name + '. All rights reserved.',
      },
      products: [],
      isPublished: false,
      views: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const docRef = await db.collection('landings').add(landingData);

    res.status(201).json({
      message: 'Landing page created',
      landing: { id: docRef.id, ...landingData },
    });
  } catch (error) {
    console.error('Create landing error:', error);
    res.status(500).json({ message: 'Failed to create landing' });
  }
});

router.get('/landings/:id', verifyToken, async (req, res) => {
  try {
    const landingDoc = await db.collection('landings').doc(req.params.id).get();
    
    if (!landingDoc.exists || landingDoc.data().userId !== req.user.uid) {
      return res.status(404).json({ message: 'Landing not found' });
    }

    res.json({ landing: { id: landingDoc.id, ...landingDoc.data() } });
  } catch (error) {
    console.error('Get landing error:', error);
    res.status(500).json({ message: 'Failed to get landing' });
  }
});

router.get('/public/landing/:id', async (req, res) => {
  try {
    const landingDoc = await db.collection('landings').doc(req.params.id).get();
    
    if (!landingDoc.exists) {
      return res.status(404).json({ message: 'Landing not found' });
    }

    res.json({ landing: { id: landingDoc.id, ...landingDoc.data() } });
  } catch (error) {
    console.error('Get public landing error:', error);
    res.status(500).json({ message: 'Failed to get landing' });
  }
});

router.put('/landings/:id', verifyToken, async (req, res) => {
  try {
    const landingRef = db.collection('landings').doc(req.params.id);
    const landingDoc = await landingRef.get();
    
    if (!landingDoc.exists || landingDoc.data().userId !== req.user.uid) {
      return res.status(404).json({ message: 'Landing not found' });
    }

    const updates = {
      ...req.body,
      updatedAt: new Date().toISOString(),
    };
    delete updates.id;
    delete updates.userId;
    delete updates.createdAt;

    await landingRef.update(updates);

    const updatedDoc = await landingRef.get();
    res.json({
      message: 'Landing updated',
      landing: { id: updatedDoc.id, ...updatedDoc.data() },
    });
  } catch (error) {
    console.error('Update landing error:', error);
    res.status(500).json({ message: 'Failed to update landing' });
  }
});

router.delete('/landings/:id', verifyToken, async (req, res) => {
  try {
    const landingRef = db.collection('landings').doc(req.params.id);
    const landingDoc = await landingRef.get();
    
    if (!landingDoc.exists || landingDoc.data().userId !== req.user.uid) {
      return res.status(404).json({ message: 'Landing not found' });
    }

    await landingRef.delete();
    res.json({ message: 'Landing deleted' });
  } catch (error) {
    console.error('Delete landing error:', error);
    res.status(500).json({ message: 'Failed to delete landing' });
  }
});

router.post('/landings/:id/publish', verifyToken, async (req, res) => {
  try {
    const landingRef = db.collection('landings').doc(req.params.id);
    const landingDoc = await landingRef.get();
    
    if (!landingDoc.exists || landingDoc.data().userId !== req.user.uid) {
      return res.status(404).json({ message: 'Landing not found' });
    }

    await landingRef.update({ isPublished: true, updatedAt: new Date().toISOString() });
    res.json({ message: 'Landing published' });
  } catch (error) {
    console.error('Publish landing error:', error);
    res.status(500).json({ message: 'Failed to publish landing' });
  }
});

router.post('/landings/:id/unpublish', verifyToken, async (req, res) => {
  try {
    const landingRef = db.collection('landings').doc(req.params.id);
    const landingDoc = await landingRef.get();
    
    if (!landingDoc.exists || landingDoc.data().userId !== req.user.uid) {
      return res.status(404).json({ message: 'Landing not found' });
    }

    await landingRef.update({ isPublished: false, updatedAt: new Date().toISOString() });
    res.json({ message: 'Landing unpublished' });
  } catch (error) {
    console.error('Unpublish landing error:', error);
    res.status(500).json({ message: 'Failed to unpublish landing' });
  }
});

router.get('/shop/:slug', async (req, res) => {
  try {
    const landingsSnapshot = await db.collection('landings')
      .where('slug', '==', req.params.slug)
      .where('isPublished', '==', true)
      .limit(1)
      .get();

    if (landingsSnapshot.empty) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    const landingDoc = landingsSnapshot.docs[0];
    res.json({ landing: { id: landingDoc.id, ...landingDoc.data() } });
  } catch (error) {
    console.error('Get shop error:', error);
    res.status(500).json({ message: 'Failed to get shop' });
  }
});

router.post('/shop/:slug/view', async (req, res) => {
  try {
    const { ip } = req.body;
    
    const landingsSnapshot = await db.collection('landings')
      .where('slug', '==', req.params.slug)
      .limit(1)
      .get();

    if (landingsSnapshot.empty) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    const landingDoc = landingsSnapshot.docs[0];
    const landingRef = db.collection('landings').doc(landingDoc.id);
    
    const existingViewSnapshot = await db.collection('landingViews')
      .where('landingId', '==', landingDoc.id)
      .where('ip', '==', ip || 'unknown')
      .limit(1)
      .get();

    if (existingViewSnapshot.empty) {
      await db.collection('landingViews').add({
        landingId: landingDoc.id,
        ip: ip || 'unknown',
        timestamp: new Date().toISOString(),
      });

      await landingRef.update({
        views: (landingDoc.data().views || 0) + 1,
      });
    }

    res.json({ message: 'View tracked' });
  } catch (error) {
    console.error('Track view error:', error);
    res.status(500).json({ message: 'Failed to track view' });
  }
});

router.post('/shop/:slug/review', async (req, res) => {
  try {
    const { name, rating, comment } = req.body;
    
    if (!name || !rating) {
      return res.status(400).json({ message: 'Name and rating are required' });
    }

    const landingsSnapshot = await db.collection('landings')
      .where('slug', '==', req.params.slug)
      .limit(1)
      .get();

    if (landingsSnapshot.empty) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    const landingDoc = landingsSnapshot.docs[0];

    await db.collection('reviews').add({
      landingId: landingDoc.id,
      name,
      rating: parseInt(rating),
      comment: comment || '',
      createdAt: new Date().toISOString(),
    });

    res.status(201).json({ message: 'Review added' });
  } catch (error) {
    console.error('Add review error:', error);
    res.status(500).json({ message: 'Failed to add review' });
  }
});

module.exports = router;
