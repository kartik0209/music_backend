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
  const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/flac', 'audio/m4a', 'audio/ogg'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid audio file type. Allowed: MP3, WAV, FLAC, M4A, OGG'), false);
  }
};

const imageFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid image file type. Allowed: JPEG, JPG, PNG, WEBP'), false);
  }
};

// Multer configurations
const uploadAudio = multer({
  storage: audioStorage,
  fileFilter: audioFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  }
});

const uploadImage = multer({
  storage: imageStorage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

const uploadAvatar = multer({
  storage: avatarStorage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB
  }
});

const uploadPlaylistCover = multer({
  storage: playlistStorage,
  fileFilter: imageFilter,
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