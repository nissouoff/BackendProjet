const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid token format');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    const uid = payload.sub || payload.user_id || payload.id;
    const email = payload.email;
    if (!uid) {
      console.error('Token payload missing user ID:', payload);
      throw new Error('Token payload missing user ID');
    }
    console.log('Token verified successfully for user:', uid);
    return { uid, email };
  } catch (error) {
    console.error('Token verification error:', error.message);
    throw error;
  }
}

// Get all landings
router.get('/landings', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    console.log('Token preview:', token?.substring(0, 50) + '...');
    const user = await await verifyIdToken(token);
    console.log('Verified user:', user);
    
    const { data, error } = await supabase
      .from('landings')
      .select('*')
      .eq('user_id', user.uid)
      .order('created_at', { ascending: false });
    
    console.log('Found landings:', data?.length || 0);
    
    if (error) throw error;
    
    const landings = (data || []).map(l => ({
      id: l.id,
      name: l.name || '',
      slug: l.slug || '',
      type: l.type || 'landing',
      isLanding: l.is_landing !== false,
      isPublished: l.is_published || false,
      views: l.views || 0,
      createdAt: l.created_at,
      updatedAt: l.updated_at,
    }));
    
    res.json({ landings });
  } catch (error) {
    console.error('Get landings error:', error);
    res.status(500).json({ message: 'Failed to get landings' });
  }
});

// Create landing
router.post('/landings', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const user = await verifyIdToken(token);
    
    const { name, type } = req.body;
    
    if (!name || !type) {
      return res.status(400).json({ message: 'Name and type are required' });
    }
    
    let slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    
    // Check if slug exists and add unique suffix with timestamp
    const { data: existing } = await supabase
      .from('landings')
      .select('slug')
      .or(`slug.eq.${slug},slug.like.${slug}-%`);
    
    if (existing && existing.length > 0) {
      // Use timestamp to ensure uniqueness
      const timestamp = Date.now().toString(36);
      slug = `${slug}-${timestamp}`;
    }
    
    const landingData = {
      user_id: user.uid,
      name: name,
      type: type,
      slug: slug,
      is_landing: true,
      content: {
        brandName: name,
        logo: '',
        heroTitle: 'Bienvenue chez ' + name,
        heroTitleAr: 'مرحبا بكم في ' + name,
        heroSubtitle: 'Votre destination de confiance pour des produits de qualité',
        heroSubtitleAr: 'وجهتك الموثوقة لمنتجات عالية الجودة',
        ctaButton: 'Commander maintenant',
        ctaButtonAr: 'اطلب الآن',
        footerText: '© 2026 ' + name + ' - Tous droits réservés',
        footerTextAr: '© 2026 ' + name + ' - جميع الحقوق محفوظة',
        trustBarText: 'Paiement sécurisé • Livraison rapide • Support 24/7',
        trustBarTextAr: 'دفع آمن • توصيل سريع • دعم على مدار الساعة',
        contactEmail: user.email || '',
        contactWhatsapp: '',
        contactInstagram: '',
        contactFacebook: '',
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

// Get landing by ID
router.get('/landings/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const user = await verifyIdToken(token);
    
    const { data, error } = await supabase
      .from('landings')
      .select('*')
      .eq('id', req.params.id)
      .single();
    
    if (error || !data) {
      return res.status(404).json({ message: 'Landing not found' });
    }
    
    if (data.user_id !== user.uid) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    res.json({ landing: { id: data.id, ...data } });
  } catch (error) {
    console.error('Get landing error:', error);
    res.status(500).json({ message: 'Failed to get landing' });
  }
});

// Get public landing
router.get('/public/landing/:id', async (req, res) => {
  try {
    // Try by slug first
    let { data, error } = await supabase
      .from('landings')
      .select('*')
      .eq('slug', req.params.id)
      .single();
    
    // If not found by slug, try by ID
    if (error || !data) {
      ({ data, error } = await supabase
        .from('landings')
        .select('*')
        .eq('id', req.params.id)
        .single());
    }
    
    if (error || !data) {
      return res.status(404).json({ message: 'Landing not found' });
    }
    
    // Check if published OR if it's being accessed in preview/edit mode
    const isPreview = req.query.preview === 'true' || req.query.editMode === 'true';
    if (!data.is_published && !isPreview) {
      return res.status(403).json({ message: 'Landing is not published' });
    }
    
    // Increment views only for published landings
    if (data.is_published) {
      await supabase
        .from('landings')
        .update({ views: (data.views || 0) + 1 })
        .eq('id', data.id);
    }
    
    res.json({ landing: { id: data.id, ...data } });
  } catch (error) {
    console.error('Get public landing error:', error);
    res.status(500).json({ message: 'Failed to get landing' });
  }
});

// Update landing
router.put('/landings/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const user = await verifyIdToken(token);
    
    const { data: existing, error: fetchError } = await supabase
      .from('landings')
      .select('*')
      .eq('id', req.params.id)
      .single();
    
    if (fetchError || !existing) {
      return res.status(404).json({ message: 'Landing not found' });
    }
    
    if (existing.user_id !== user.uid) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    const updates = { ...req.body, updated_at: new Date().toISOString() };
    delete updates.id;
    delete updates.user_id;
    delete updates.created_at;
    
    if (updates.isPublished !== undefined) {
      updates.is_published = updates.isPublished;
      delete updates.isPublished;
    }
    
    const { data, error } = await supabase
      .from('landings')
      .update(updates)
      .eq('id', req.params.id)
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
router.delete('/landings/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const user = await verifyIdToken(token);
    
    const { data: existing, error: fetchError } = await supabase
      .from('landings')
      .select('*')
      .eq('id', req.params.id)
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
      .eq('id', req.params.id);
    
    if (error) throw error;
    
    res.json({ message: 'Landing deleted' });
  } catch (error) {
    console.error('Delete landing error:', error);
    res.status(500).json({ message: 'Failed to delete landing' });
  }
});

// Publish landing
router.post('/landings/:id/publish', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const user = await verifyIdToken(token);
    
    const { data: existing, error } = await supabase
      .from('landings')
      .select('*')
      .eq('id', req.params.id)
      .single();
    
    if (error || !existing) {
      return res.status(404).json({ message: 'Landing not found' });
    }
    
    if (existing.user_id !== user.uid) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    await supabase
      .from('landings')
      .update({ is_published: true, updated_at: new Date().toISOString() })
      .eq('id', req.params.id);
    
    res.json({ message: 'Landing published', url: `/${existing.slug}` });
  } catch (error) {
    console.error('Publish landing error:', error);
    res.status(500).json({ message: 'Failed to publish landing' });
  }
});

// Unpublish landing
router.post('/landings/:id/unpublish', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const user = await verifyIdToken(token);
    
    const { data: existing, error } = await supabase
      .from('landings')
      .select('*')
      .eq('id', req.params.id)
      .single();
    
    if (error || !existing) {
      return res.status(404).json({ message: 'Landing not found' });
    }
    
    if (existing.user_id !== user.uid) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    await supabase
      .from('landings')
      .update({ is_published: false, updated_at: new Date().toISOString() })
      .eq('id', req.params.id);
    
    res.json({ message: 'Landing unpublished' });
  } catch (error) {
    console.error('Unpublish landing error:', error);
    res.status(500).json({ message: 'Failed to unpublish landing' });
  }
});

// Get landing by slug for public view
router.get('/landing/:slug', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('landings')
      .select('*')
      .eq('slug', req.params.slug)
      .single();
    
    if (error || !data) {
      return res.status(404).json({ message: 'Landing not found' });
    }
    
    res.json({ landing: { id: data.id, ...data } });
  } catch (error) {
    console.error('Get landing by slug error:', error);
    res.status(500).json({ message: 'Failed to get landing' });
  }
});

// Submit review
router.post('/landing/:id/review', async (req, res) => {
  try {
    const { name, rating, comment } = req.body;
    
    if (!name || !rating || !comment) {
      return res.status(400).json({ message: 'Name, rating and comment are required' });
    }
    
    // Try to find landing by slug or ID
    let landing;
    const { data: bySlug, error: slugError } = await supabase
      .from('landings')
      .select('id')
      .eq('slug', req.params.id)
      .single();
    
    if (!slugError && bySlug) {
      landing = bySlug;
    } else {
      const { data: byId, error: idError } = await supabase
        .from('landings')
        .select('id')
        .eq('id', req.params.id)
        .single();
      landing = byId;
    }
    
    if (!landing) {
      return res.status(404).json({ message: 'Landing not found' });
    }
    
    const review = {
      id: Date.now().toString(),
      name,
      rating: parseInt(rating),
      comment,
      createdAt: new Date().toISOString(),
    };
    
    const { data: landingData, error: landingError } = await supabase
      .from('landings')
      .select('reviews')
      .eq('id', landing.id)
      .single();
    
    if (landingError) throw landingError;
    
    const reviews = [...(landingData.reviews || []), review];
    
    await supabase
      .from('landings')
      .update({ reviews, updated_at: new Date().toISOString() })
      .eq('id', landing.id);
    
    res.status(201).json({ message: 'Review submitted', review });
  } catch (error) {
    console.error('Submit review error:', error);
    res.status(500).json({ message: 'Failed to submit review' });
  }
});

// Get wilayas list
router.get('/wilayas', (req, res) => {
  res.json({ wilayas: WILAYAS });
});

module.exports = router;
