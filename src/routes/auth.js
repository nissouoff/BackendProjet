const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verifyIdToken(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token format');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
  return { uid: payload.sub || payload.user_id || payload.id || token, email: payload.email };
}

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Create user with hashed password
    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
    
    const { data, error } = await supabase
      .from('users')
      .insert({
        email: email,
        password: hashedPassword,
        name: name || '',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    // Create a simple token
    const token = Buffer.from(JSON.stringify({
      sub: data.id,
      email: data.email,
      iat: Date.now()
    })).toString('base64');

    res.status(201).json({
      message: 'User registered successfully',
      user: { id: data.id, email: data.email, name: data.name },
      token: token
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: error.message || 'Failed to register' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .eq('password', hashedPassword)
      .single();

    if (error || !data) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Create a simple token
    const token = Buffer.from(JSON.stringify({
      sub: data.id,
      email: data.email,
      iat: Date.now()
    })).toString('base64');

    res.json({
      message: 'Login successful',
      user: { id: data.id, email: data.email, name: data.name },
      token: token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: error.message || 'Failed to login' });
  }
});

// Get current user
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const user = await verifyIdToken(token);

    const { data, error } = await supabase
      .from('users')
      .select('id, email, name, created_at')
      .eq('id', user.uid)
      .single();

    if (error || !data) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user: data });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Failed to get user' });
  }
});

// Update user
router.put('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const user = await verifyIdToken(token);

    const { name, email } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (email) updates.email = email;

    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', user.uid)
      .select()
      .single();

    if (error) throw error;

    res.json({ message: 'User updated', user: data });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Failed to update user' });
  }
});

// Delete user account
router.delete('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const user = await verifyIdToken(token);

    // Delete user's landings first
    const { data: landings } = await supabase
      .from('landings')
      .select('id')
      .eq('user_id', user.uid);

    if (landings && landings.length > 0) {
      const landingIds = landings.map(l => l.id);
      
      // Delete orders for these landings
      await supabase
        .from('orders')
        .delete()
        .in('landing_id', landingIds);
      
      // Delete landings
      await supabase
        .from('landings')
        .delete()
        .eq('user_id', user.uid);
    }

    // Delete user
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', user.uid);

    if (error) throw error;

    res.json({ message: 'Account deleted' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Failed to delete account' });
  }
});

module.exports = router;
