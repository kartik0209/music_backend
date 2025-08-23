const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Audio files storage configuration
const audioStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'music-app/audio',
    resource_type: 'video', // Use 'video' for audio files
    allowed_formats: ['mp3', 'wav', 'flac', 'm4a', 'ogg'],
    transformation: [
      { quality: 'auto' },
      { fetch_format: 'auto' }
    ]
  }
});

// Cover images storage configuration
const imageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'music-app/covers',
    resource_type: 'image',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [
      { width: 500, height: 500, crop: 'fill' },
      { quality: 'auto' },
      { fetch_format: 'auto' }
    ]
  }
});

// Avatar images storage configuration
const avatarStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'music-app/avatars',
    resource_type: 'image',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [
      { width: 200, height: 200, crop: 'fill', gravity: 'face' },
      { quality: 'auto' },
      { fetch_format: 'auto' }
    ]
  }
});

// Playlist cover storage configuration
const playlistStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'music-app/playlists',
    resource_type: 'image',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [
      { width: 300, height: 300, crop: 'fill' },
      { quality: 'auto' },
      { fetch_format: 'auto' }
    ]
  }
});

// File filters
const audioFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'audio/mpeg', // for .mp3
    'audio/wav',
    'audio/flac',
    'audio/x-flac',
    'audio/mp4',   // for .m4a
    'audio/x-m4a',
    'audio/ogg'
  ];

  const fileExtension = file.originalname.split('.').pop().toLowerCase();
  const allowedExtensions = ['mp3', 'wav', 'flac', 'm4a', 'ogg'];

  if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
    // Accept the file
    cb(null, true);
  } else {
    // Reject the file
    cb(new Error('Invalid audio file type. Allowed: MP3, WAV, FLAC, M4A, OGG'), false);
  }
};

// This is the old, incorrect code
const imageFileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/webp']; // PNG is missing
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Image file format not allowed'), false);
  }
};
// Multer configurations
// A filter just for debugging
const audioFilter_DEBUG = (req, file, cb) => {
  console.log('--- DEBUGGING INCOMING FILE ---');
  console.log('Original Filename:', file.originalname);
  console.log('Detected MIME Type:', file.mimetype);
  console.log('-----------------------------');
  cb(null, true); // Accept the file to see the next error
};

const uploadAudio = multer({
  storage: audioStorage,
  fileFilter: audioFilter_DEBUG, // Use the debugging filter
  limits: {
    fileSize: 50 * 1024 * 1024
  }
});

const uploadImage = multer({
  storage: imageStorage,
  fileFilter:imageFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

const uploadAvatar = multer({
  storage: avatarStorage,
  fileFilter:imageFileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB
  }
});

const uploadPlaylistCover = multer({
  storage: playlistStorage,
  fileFilter:imageFileFilter,
  limits: {
    fileSize: 3 * 1024 * 1024 // 3MB
  }
});

// Helper functions
const deleteFromCloudinary = async (publicId, resourceType = 'image') => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType
    });
    return result;
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    throw error;
  }
};

const getCloudinaryUrl = (publicId, resourceType = 'image', transformation = {}) => {
  if (resourceType === 'video') {
    return cloudinary.url(publicId, {
      resource_type: 'video',
      ...transformation
    });
  }
  return cloudinary.url(publicId, {
    resource_type: 'image',
    ...transformation
  });
};

module.exports = {
  cloudinary,
  uploadAudio,
  uploadImage,
  uploadAvatar,
  uploadPlaylistCover,
  deleteFromCloudinary,
  getCloudinaryUrl
};