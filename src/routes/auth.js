const express = require('express');
const router = express.Router();
const { auth, db } = require('../firebase');
const { verifyToken } = require('../middleware/auth');

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }

    const userRecord = await auth.createUser({
      email,
      password,
      displayName: name,
    });

    await db.collection('users').doc(userRecord.uid).set({
      name,
      email,
      createdAt: new Date().toISOString(),
    });

    const customToken = await auth.createCustomToken(userRecord.uid);

    res.status(201).json({
      message: 'Registration successful',
      user: {
        id: userRecord.uid,
        name,
        email,
      },
      token: customToken,
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(400).json({ message: error.message || 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    res.status(200).json({
      message: 'Login successful',
      user: {
        email,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(401).json({ message: 'Invalid credentials' });
  }
});

router.get('/user', verifyToken, async (req, res) => {
  try {
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user: { uid: req.user.uid, ...userDoc.data() } });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Failed to get user' });
  }
});

router.delete('/user/delete', verifyToken, async (req, res) => {
  try {
    await db.collection('users').doc(req.user.uid).delete();
    
    const landings = await db.collection('landings')
      .where('userId', '==', req.user.uid)
      .get();
    
    const batch = db.batch();
    landings.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    await auth.deleteUser(req.user.uid);

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Failed to delete account' });
  }
});

module.exports = router;
