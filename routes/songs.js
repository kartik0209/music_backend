const express = require('express');
const Song = require('../models/Song');
const User = require('../models/User');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const { uploadAudio, uploadImage } = require('../config/cloudinary');
const { body, validationResult } = require('express-validator');

const router = express.Router();





// @desc    Get song statistics (Admin only)
// @route   GET /api/songs/stats
// @access  Private (Admin)
router.get('/stats', [auth, adminAuth], async (req, res) => {
    try {
        const [total, active, featured, totalPlaysResult] = await Promise.all([
            Song.countDocuments(),
            Song.countDocuments({ status: 'active' }),
            Song.countDocuments({ featured: true }),
            Song.aggregate([{ $group: { _id: null, totalPlays: { $sum: '$playCount' } } }])
        ]);

        const totalPlays = totalPlaysResult.length > 0 ? totalPlaysResult[0].totalPlays : 0;

        res.json({
            success: true,
            data: { total, active, featured, totalPlays }
        });
    } catch (error) {
        console.error('Get song stats error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});


// @desc    Get all songs with filtering and pagination
// @route   GET /api/songs
// @access  Private (Admin)
router.get('/', [auth], async (req, res) => {
    try {
        const {
            page = 1, limit = 10, search, genre, language,
            status, featured, sortBy = 'uploadDate', sortOrder = 'desc'
        } = req.query;

        const query = {};
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { artist: { $regex: search, $options: 'i' } },
                { 'album.name': { $regex: search, $options: 'i' } }
            ];
        }
        if (genre) query.genre = genre;
        if (language) query.language = language;
        if (status) query.status = status;
        if (featured) query.featured = featured === 'true';

        const sortOptions = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

        const songs = await Song.find(query)
            .populate('uploadedBy', 'username profile.avatar')
            .sort(sortOptions)
            .skip((parseInt(page) - 1) * parseInt(limit))
            .limit(parseInt(limit));

        const total = await Song.countDocuments(query);

        res.json({
            success: true,
            data: {
                songs,
                pagination: {
                    total,
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        console.error('Get songs error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch songs' });
    }
});

// @desc    Toggle featured status
// @route   PUT /api/songs/:id/featured
// @access  Private (Admin)
router.put('/:id/featured', [auth], async (req, res) => {
    try {
        const song = await Song.findById(req.params.id);
        if (!song) {
            return res.status(404).json({ success: false, message: 'Song not found' });
        }
        song.featured = !song.featured;
        await song.save();
        res.json({
            success: true,
            message: `Song ${song.featured ? 'featured' : 'unfeatured'} successfully.`,
            data: { song }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update featured status' });
    }
});


// @desc    Delete song (soft delete)
// @route   DELETE /api/songs/:id
// @access  Private (Admin)
router.delete('/:id', [auth, adminAuth], async (req, res) => {
    try {
        const song = await Song.findByIdAndUpdate(req.params.id, { status: 'inactive' });
        if (!song) {
            return res.status(404).json({ success: false, message: 'Song not found' });
        }
        res.json({ success: true, message: 'Song deleted successfully.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to delete song' });
    }
});


// @desc    Get trending songs
// @route   GET /api/songs/trending
// @access  Public
router.get('/trending', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    const songs = await Song.getTrending(parseInt(limit));

    res.json({
      success: true,
      data: { songs }
    });
  } catch (error) {
    console.error('Get trending songs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch trending songs',
      error: error.message
    });
  }
});

// @desc    Get featured songs
// @route   GET /api/songs/featured
// @access  Public
router.get('/featured', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    const songs = await Song.getFeatured(parseInt(limit));

    res.json({
      success: true,
      data: { songs }
    });
  } catch (error) {
    console.error('Get featured songs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch featured songs',
      error: error.message
    });
  }
});

// @desc    Get song by ID
// @route   GET /api/songs/:id
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const song = await Song.findById(req.params.id)
      .populate('uploadedBy', 'username profile.firstName profile.lastName profile.avatar');

    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Song not found'
      });
    }

    res.json({
      success: true,
      data: { song }
    });
  } catch (error) {
    console.error('Get song error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch song',
      error: error.message
    });
  }
});

  // @desc    Upload song
  // @route   POST /api/songs
  // @access  Private (Admin only)
  const handleUpload = (req, res, next) => {
    const upload = uploadAudio.fields([
      { name: 'audio', maxCount: 1 },
      { name: 'cover', maxCount: 1 }
    ]);

    upload(req, res, function (err) {
      // This catches errors from the fileFilter (like wrong file type)
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      // If no errors, proceed to the next middleware in the chain
      next();
    });
  };

  router.post('/', [
    auth,
    adminAuth,
    handleUpload,
    
      body('title').notEmpty().withMessage('Title is required').trim(),
      body('artist').notEmpty().withMessage('Artist is required').trim(),
      body('duration').isNumeric().withMessage('Duration must be a number'),
      body('genre').notEmpty().withMessage('At least one genre is required'),
      body('language').notEmpty().withMessage('Language is required').trim()
    
  ], async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }


    
      // ADD THIS NEW CHECK
      if (!req.files || !req.files.audio || !req.files.audio[0].path) {
        return res.status(400).json({
          success: false,
          message: 'Audio file is required and failed to upload. Please check server logs.'
        });
      }
      const {
        title,
        artist,
        album,
        duration,
        genre,
        subGenre,
        mood,
        language,
        lyrics,
        metadata,
        tags
      } = req.body;


      console.log('Cloudinary Upload Result:', JSON.stringify(req.files, null, 2));

      // Prepare song data
      const songData = {
        title,
        artist,
        duration: parseInt(duration),
        genre: Array.isArray(genre) ? genre : [genre],
      songLanguage: language,
        uploadedBy: req.user.userId,
        audioFile: {
        cloudinaryId: req.files.audio[0].filename,      // Use .filename for the ID
        url: req.files.audio[0].path,             // Use .path for the URL
        secureUrl: req.files.audio[0].path,          // Use .path for the secure URL
        originalName: req.files.audio[0].originalname,
        size: req.files.audio[0].size,                // Use .size instead of .bytes
        format: req.files.audio[0].mimetype.split('/')[1] // Get format from mimetype
      }
      };

      // Optional fields
      if (album) songData.album = typeof album === 'string' ? JSON.parse(album) : album;
      if (subGenre) songData.subGenre = Array.isArray(subGenre) ? subGenre : [subGenre];
      if (mood) songData.mood = Array.isArray(mood) ? mood : [mood];
      if (lyrics) songData.lyrics = typeof lyrics === 'string' ? JSON.parse(lyrics) : lyrics;
      if (metadata) songData.metadata = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
      if (tags) songData.tags = Array.isArray(tags) ? tags : [tags];

      // Handle cover image
      if (req.files.cover) {
        songData.coverImage = {
          cloudinaryId: req.files.cover[0].public_id,
          url: req.files.cover[0].url,
          secureUrl: req.files.cover[0].secure_url,
          size: req.files.cover[0].bytes,
          format: req.files.cover[0].format
        };
      }

      const song = await Song.create(songData);
      await song.populate('uploadedBy', 'username profile.avatar');

      res.status(201).json({
        success: true,
        message: 'Song uploaded successfully',
        data: { song }
      });
    } catch (error) {
      console.error('Upload song error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to upload song',
        error: error.message
      });
    }
  });

// @desc    Update song
// @route   PUT /api/songs/:id 
// @access  Private (Admin only)
// @desc    Update song
// @route   PUT /api/songs/:id
// @access  Private (Admin only)
router.put('/:id', [
    auth,
    adminAuth,
    uploadAudio.single('cover') // Assuming 'uploadAudio' is your configured multer instance
], async (req, res) => {
    try {
        const {
            title, artist, duration, language, albumName,
            genre, mood, tags, featured
        } = req.body;

        const updates = {
            title, artist, duration, language, featured
        };

        // Handle arrays correctly, whether one or many are sent from the form
        if (genre) updates.genre = Array.isArray(genre) ? genre : [genre];
        if (mood) updates.mood = Array.isArray(mood) ? mood : [mood];
        if (tags) updates.tags = Array.isArray(tags) ? tags : [tags];

        // Handle nested album object
        if (albumName) {
            updates.album = { name: albumName };
        }

        // Handle new cover image upload
        if (req.file) {
            updates.coverUrl = req.file.path; // Correctly update the 'coverUrl' field
        }

        // Find and update the song in a single operation
        const updatedSong = await Song.findByIdAndUpdate(
            req.params.id,
            { $set: updates },
            { new: true, runValidators: true }
        ).populate('uploadedBy', 'username profile.avatar');

        if (!updatedSong) {
            return res.status(404).json({
                success: false,
                message: 'Song not found'
            });
        }

        res.json({
            success: true,
            message: 'Song updated successfully',
            data: { song: updatedSong }
        }); 
    } catch (error) {
        console.error('Update song error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update song',
            error: error.message
        });
    }
});

// @desc    Play song (increment play count)
// @route   POST /api/songs/:id/play
// @access  Private
router.post('/:id/play', auth, async (req, res) => {
  try {
    const song = await Song.findById(req.params.id);

    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Song not found'
      });
    }

    // Increment play count
    await song.incrementPlayCount();

    // Add to user's listening history
    const user = await User.findById(req.user.userId);
    if (user) {
      user.addToHistory(song._id, song.duration, true);
      await user.save();
    }

    res.json({
      success: true,
      message: 'Play count updated',
      data: { playCount: song.playCount }
    });
  } catch (error) {
    console.error('Play song error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update play count',
      error: error.message
    });
  }
});

// @desc    Like/Unlike song
// @route   POST /api/songs/:id/like
// @access  Private
router.post('/:id/like', auth, async (req, res) => {
  try {
    const songId = req.params.id;
    const userId = req.user.userId;

    const song = await Song.findById(songId);
    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Song not found'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const result = user.toggleLikeSong(songId);
    
    // Update song like count
    if (result.action === 'liked') {
      song.likeCount += 1;
    } else {
      song.likeCount = Math.max(0, song.likeCount - 1);
    }

    await Promise.all([user.save(), song.save()]);

    res.json({
      success: true,
      message: `Song ${result.action}`,
      data: {
        action: result.action,
        likeCount: song.likeCount
      }
    });
  } catch (error) {
    console.error('Like song error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to like/unlike song',
      error: error.message
    });
  }
});

// @desc    Get user's recommendation
// @route   GET /api/songs/user/recommendations
// @access  Private
router.get('/user/recommendations', auth, async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    const user = await User.findById(req.user.userId)
      .populate('listeningHistory.song')
      .populate('ratings.song');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get user preferences
    const preferences = await User.getUserRecommendations(user._id);
    
    // Get recommended songs
    const recommendations = await Song.getRecommendations(
      user._id,
      user.preferences,
      parseInt(limit)
    );

    res.json({
      success: true,
      data: { songs: recommendations }
    });
  } catch (error) {
    console.error('Get recommendations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get recommendations',
      error: error.message
    });
  }
});

// @desc    Toggle featured status
// @route   PUT /api/songs/:id/featured
// @access  Private (Admin only)
router.put('/:id/featured', [auth, adminAuth], async (req, res) => {
  try {
    const song = await Song.findById(req.params.id);

    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Song not found'
      });
    }

    song.featured = !song.featured;
    await song.save();

    res.json({
      success: true,
      message: `Song ${song.featured ? 'featured' : 'unfeatured'} successfully`,
      data: { featured: song.featured }
    });
  } catch (error) {
    console.error('Toggle featured error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle featured status',
      error: error.message
    });
  }
});

// @desc    Get songs by artist
// @route   GET /api/songs/artist/:artist
// @access  Public
router.get('/artist/:artist', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const artist = decodeURIComponent(req.params.artist);

    const songs = await Song.find({ 
      artist: new RegExp(artist, 'i'),
      status: 'active'
    })
      .populate('uploadedBy', 'username profile.avatar')
      .sort({ playCount: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Song.countDocuments({ 
      artist: new RegExp(artist, 'i'),
      status: 'active'
    });

    res.json({
      success: true,
      data: {
        songs,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
          hasNext: page * limit < total,
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Get songs by artist error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch songs by artist',
      error: error.message
    });
  }
});

// @desc    Download song
// @route   GET /api/songs/:id/download
// @access  Private
router.get('/:id/download', auth, async (req, res) => {
  try {
    const song = await Song.findById(req.params.id);

    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Song not found'
      });
    }

    // Increment download count
    await song.incrementDownloadCount();

    res.json({
      success: true,
      message: 'Download link generated',
      data: {
        downloadUrl: song.audioFile.secureUrl,
        downloadCount: song.downloadCount,
        title: song.title,
        artist: song.artist
      }
    });
  } catch (error) {
    console.error('Download song error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process download',
      error: error.message
    });
  }
});

// @desc    Get user's liked songs
// @route   GET /api/songs/user/liked
// @access  Private
router.get('/user/liked', auth, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const user = await User.findById(req.user.userId)
      .populate({
        path: 'likedSongs.song',
        populate: {
          path: 'uploadedBy',
          select: 'username profile.avatar'
        }
      });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Filter out deleted songs and paginate
    const validLikedSongs = user.likedSongs.filter(item => item.song);
    const total = validLikedSongs.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedLikedSongs = validLikedSongs.slice(startIndex, endIndex);

    const songs = paginatedLikedSongs.map(item => ({
      ...item.song.toObject(),
      likedAt: item.likedAt
    }));

    res.json({
      success: true,
      data: {
        songs,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
          hasNext: endIndex < total,
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Get liked songs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch liked songs',
      error: error.message
    });
  }
});

// @desc    Get listening history
// @route   GET /api/songs/user/history
// @access  Private
router.get('/user/history', auth, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const user = await User.findById(req.user.userId)
      .populate({
        path: 'listeningHistory.song',
        populate: {
          path: 'uploadedBy',
          select: 'username profile.avatar'
        }
      });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Filter out deleted songs and paginate
    const validHistory = user.listeningHistory.filter(item => item.song);
    const total = validHistory.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedHistory = validHistory.slice(startIndex, endIndex);

    const history = paginatedHistory.map(item => ({
      song: item.song,
      playedAt: item.playedAt,
      duration: item.duration,
      completed: item.completed
    }));

    res.json({
      success: true,
      data: {
        history,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
          hasNext: endIndex < total,
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Get listening history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch listening history',
      error: error.message
    });
  }
});





// Other routes from your file like POST, PUT for edits, etc., would remain here.


module.exports = router;