const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/database');
const errorHandler = require('./middleware/errorHandler');

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow Cloudinary resources
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "https://res.cloudinary.com", "https://via.placeholder.com", "https://ui-avatars.com"],
      mediaSrc: ["'self'", "https://res.cloudinary.com"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "https://res.cloudinary.com"]
    }
  }
}));

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  }
});
app.use('/api/', limiter);

// Streaming rate limit (more lenient)
const streamLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Allow more requests for streaming
  message: {
    success: false,
    message: 'Too many streaming requests, please try again later.'
  }
});
app.use('/api/stream/', streamLimiter);

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());
app.use(compression());

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/songs', require('./routes/songs'));
app.use('/api/users', require('./routes/users'));
app.use('/api/playlists', require('./routes/playlists'));
app.use('/api/ratings', require('./routes/ratings'));
app.use('/api/stream', require('./routes/stream'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Music Streaming API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV,
    features: {
      cloudinaryIntegration: true,
      streaming: true,
      playlists: true,
      ratings: true,
      userManagement: true
    }
  });
});

// API documentation endpoint
app.get('/api/docs', (req, res) => {
  res.json({
    success: true,
    message: 'Music Streaming API Documentation',
    version: '1.0.0',
    baseUrl: req.protocol + '://' + req.get('host') + '/api',
    endpoints: {
      auth: {
        register: 'POST /auth/register',
        login: 'POST /auth/login',
        profile: 'GET /auth/profile',
        logout: 'POST /auth/logout'
      },
      songs: {
        getAll: 'GET /songs',
        getById: 'GET /songs/:id',
        upload: 'POST /songs (Admin)',
        update: 'PUT /songs/:id (Admin)',
        delete: 'DELETE /songs/:id (Admin)',
        play: 'POST /songs/:id/play',
        like: 'POST /songs/:id/like',
        trending: 'GET /songs/trending',
        featured: 'GET /songs/featured',
        byArtist: 'GET /songs/artist/:artist',
        recommendations: 'GET /songs/user/recommendations',
        liked: 'GET /songs/user/liked',
        history: 'GET /songs/user/history'
      },
      playlists: {
        getAll: 'GET /playlists',
        getById: 'GET /playlists/:id',
        create: 'POST /playlists',
        update: 'PUT /playlists/:id',
        delete: 'DELETE /playlists/:id',
        addSong: 'POST /playlists/:id/songs',
        removeSong: 'DELETE /playlists/:id/songs/:songId',
        reorder: 'PUT /playlists/:id/songs/:songId/position',
        follow: 'POST /playlists/:id/follow',
        play: 'POST /playlists/:id/play',
        featured: 'GET /playlists/featured',
        userPlaylists: 'GET /playlists/user/:userId'
      },
      ratings: {
        rateSong: 'POST /ratings/:songId',
        getUserRating: 'GET /ratings/:songId/user',
        getSongRatings: 'GET /ratings/:songId',
        removeRating: 'DELETE /ratings/:songId',
        topRated: 'GET /ratings/top-rated',
        recent: 'GET /ratings/recent'
      },
      streaming: {
        getStreamUrl: 'GET /stream/url/:id',
        getCover: 'GET /stream/cover/:id',
        getMetadata: 'GET /stream/metadata/:id',
        download: 'GET /stream/download/:id',
        getQualityOptions: 'GET /stream/quality/:id',
        updateProgress: 'POST /stream/progress/:id',
        getPlaylistStream: 'GET /stream/playlist/:id',
        getNextSong: 'GET /stream/playlist/:playlistId/next/:currentSongId',
        getPreviousSong: 'GET /stream/playlist/:playlistId/previous/:currentSongId'
      }
    },
    authentication: {
      type: 'Bearer Token',
      header: 'Authorization: Bearer <token>',
      note: 'Most endpoints require authentication. Admin endpoints require admin role.'
    },
    cloudinary: {
      note: 'All media files are stored on Cloudinary',
      features: ['Audio streaming', 'Image optimization', 'Quality transformations', 'CDN delivery']
    }
  });
});

// Catch-all for undefined API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API route ${req.originalUrl} not found`,
    availableRoutes: [
      '/api/health',
      '/api/docs',
      '/api/auth/*',
      '/api/songs/*',
      '/api/users/*',
      '/api/playlists/*',
      '/api/ratings/*',
      '/api/stream/*'
    ]
  });
});

// Error handling middleware
app.use(errorHandler);

// Global 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    requestedUrl: req.originalUrl,
    method: req.method
  });
});

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
  console.log(`📚 API Documentation: http://localhost:${PORT}/api/docs`);
  console.log(`🏥 Health Check: http://localhost:${PORT}/api/health`);
  
  if (process.env.NODE_ENV === 'development') {
    console.log(`🎵 Music Streaming API Ready!`);
    console.log(`📁 Cloudinary Integration: ${process.env.CLOUDINARY_CLOUD_NAME ? '✅ Configured' : '❌ Not configured'}`);
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.log(`❌ Error: ${err.message}`);
  server.close(() => {
    process.exit(1);
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received');
  server.close(() => {
    console.log('✅ Process terminated gracefully');
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received');
  server.close(() => {
    console.log('✅ Process terminated gracefully');
  });
});

module.exports = app;