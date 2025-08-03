const express = require('express');
const Song = require('../models/Song');
const User = require('../models/User');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const upload = require('../middleware/upload');
const { body, validationResult } = require('express-validator');

const router = express.Router();

// @desc    Get all songs with filters and pagination
// @route   GET /api/songs
// @access  Public
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      genre,
      language,
      mood,
      artist,
      minRating,
      sortBy = 'playCount',
      sortOrder = 'desc'
    } = req.query;

    const filters = {};
    
    // Build filters
    if (genre) filters.genre = genre.split(',');
    if (language) filters.language = language;
    if (mood) filters.mood = mood.split(',');
    if (artist) filters.artist = artist;
    if (minRating) filters.minRating = parseFloat(minRating);

    // Search songs
    const songs = await Song.searchSongs(search, filters);

    // Apply sorting
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    const paginatedSongs = await Song.aggregate([
      { $match: { _id: { $in: songs.map(s => s._id) } } },
      { $sort: sortOptions },
      { $skip: (page - 1) * parseInt(limit) },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: 'users',
          localField: 'uploadedBy',
          foreignField: '_id',
          as: 'uploadedBy',
          pipeline: [
            { $project: { username: 1, 'profile.avatar': 1 } }
          ]
        }
      },
      { $unwind: '$uploadedBy' }
    ]);

    // Get total count for pagination
    const total = songs.length;

    res.json({
      success: true,
      data: {
        songs: paginatedSongs,
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
    console.error('Get songs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch songs',
      error: error.message
    });
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
router.post('/', [
  auth,
  adminAuth,
  upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'cover', maxCount: 1 }
  ]),
  [
    body('title').notEmpty().withMessage('Title is required').trim(),
    body('artist').notEmpty().withMessage('Artist is required').trim(),
    body('duration').isNumeric().withMessage('Duration must be a number'),
    //body('genre').isArray({ min: 1 }).withMessage('At least one genre is required'),
    body('language').notEmpty().withMessage('Language is required').trim()
  ]
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

    if (!req.files || !req.files.audio) {
      return res.status(400).json({
        success: false,
        message: 'Audio file is required'
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

    // Prepare song data
    const songData = {
      title,
      artist,
      duration: parseInt(duration),
      genre: Array.isArray(genre) ? genre : [genre],
      language,
      uploadedBy: req.user.userId,
      audioFile: {
        filename: req.files.audio[0].filename,
        originalName: req.files.audio[0].originalname,
        path: req.files.audio[0].path,
        size: req.files.audio[0].size,
        format: req.files.audio[0].mimetype.split('/')[1]
      }
    };

    // Optional fields
    if (album) songData.album = JSON.parse(album);
    if (subGenre) songData.subGenre = Array.isArray(subGenre) ? subGenre : [subGenre];
    if (mood) songData.mood = Array.isArray(mood) ? mood : [mood];
    if (lyrics) songData.lyrics = JSON.parse(lyrics);
    if (metadata) songData.metadata = JSON.parse(metadata);
    if (tags) songData.tags = Array.isArray(tags) ? tags : [tags];

    // Handle cover image
    if (req.files.cover) {
      songData.coverImage = {
        filename: req.files.cover[0].filename,
        path: req.files.cover[0].path,
        size: req.files.cover[0].size,
        format: req.files.cover[0].mimetype.split('/')[1]
      };
    }

    const song = await Song.create(songData);

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
router.put('/:id', [
  auth,
  adminAuth,
  upload.single('cover')
], async (req, res) => {
  try {
    const song = await Song.findById(req.params.id);

    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Song not found'
      });
    }

    // Update fields
    const updates = { ...req.body };
    
    // Handle cover image upload
    if (req.file) {
      updates.coverImage = {
        filename: req.file.filename,
        path: req.file.path,
        size: req.file.size,
        format: req.file.mimetype.split('/')[1]
      };
    }

    // Parse JSON fields if they exist
    if (updates.album && typeof updates.album === 'string') {
      updates.album = JSON.parse(updates.album);
    }
    if (updates.lyrics && typeof updates.lyrics === 'string') {
      updates.lyrics = JSON.parse(updates.lyrics);
    }
    if (updates.metadata && typeof updates.metadata === 'string') {
      updates.metadata = JSON.parse(updates.metadata);
    }

    // Update the song
    const updatedSong = await Song.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    ).populate('uploadedBy', 'username profile.avatar');

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

// @desc    Delete song
// @route   DELETE /api/songs/:id
// @access  Private (Admin only)
router.delete('/:id', [auth, adminAuth], async (req, res) => {
  try {
    const song = await Song.findById(req.params.id);

    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Song not found'
      });
    }

    // Soft delete - change status instead of removing
    song.status = 'inactive';
    await song.save();

    res.json({
      success: true,
      message: 'Song deleted successfully'
    });
  } catch (error) {
    console.error('Delete song error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete song',
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

// @desc    Get song recommendations
// @route   GET /api/songs/recommendations
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
      message: 'Download count updated',
      data: {
        downloadUrl: song.audioUrl,
        downloadCount: song.downloadCount
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

module.exports = router;