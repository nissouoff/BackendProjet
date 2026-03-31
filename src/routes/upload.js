const express = require('express');
const router = express.Router();
const multer = require('multer');
const { storage: firebaseStorage } = require('../firebase');
const { verifyToken } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

router.post('/upload', verifyToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const bucket = firebaseStorage.bucket();
    const fileName = `${req.user.uid}/${uuidv4()}-${req.file.originalname}`;
    const file = bucket.file(fileName);

    await file.save(req.file.buffer, {
      metadata: {
        contentType: req.file.mimetype,
      },
    });

    await file.makePublic();

    const url = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

    res.json({ url });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: 'Failed to upload file' });
  }
});

module.exports = router;
