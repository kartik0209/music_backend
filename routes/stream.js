const express = require('express');
const fs = require('fs');
const path = require('path');
const Song = require('../models/Song');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// @desc    Stream audio file
// @route   GET /api/stream/audio/:id
// @access  Private
router.get('/audio/:id', auth, async (req, res) => {
  try {
    const songId = req.params.id;
    const song = await Song.findById(songId);

    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Song not found'
      });
    }

    if (song.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Song is not available for streaming'
      });
    }

    const audioPath = path.join(__dirname, '..', song.audioFile.path);

    // Check if file exists
    if (!fs.existsSync(audioPath)) {
      return res.status(404).json({
        success: false,
        message: 'Audio file not found'
      });
    }

    const stat = fs.statSync(audioPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      // Handle range requests for seeking
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      
      const file = fs.createReadStream(audioPath, { start, end });
      
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': `audio/${song.audioFile.format}`,
        'Cache-Control': 'public, max-age=3600'
      };
      
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      // Regular streaming
      const head = {
        'Content-Length': fileSize,
        'Content-Type': `audio/${song.audioFile.format}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600'
      };
      
      res.writeHead(200, head);
      fs.createReadStream(audioPath).pipe(res);
    }

    // Increment play count (throttled to prevent abuse)
    const user = await User.findById(req.user.userId);
    if (user) {
      const lastPlay = user.listeningHistory.find(h => 
        h.song.toString() === songId && 
        h.playedAt > new Date(Date.now() - 30000) // 30 seconds ago
      );
      
      if (!lastPlay) {
        // Add to listening history
        user.addToHistory(songId, song.duration, false);
        await user.save();
        
        // Increment song play count
        await song.incrementPlayCount();
      }
    }
  } catch (error) {
    console.error('Stream audio error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stream audio',
      error: error.message
    });
  }
});

// @desc    Stream cover image
// @route   GET /api/stream/cover/:id
// @access  Public
router.get('/cover/:id', async (req, res) => {
  try {
    const songId = req.params.id;
    const song = await Song.findById(songId);

    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Song not found'
      });
    }

    let imagePath;
    if (song.coverImage && song.coverImage.path) {
      imagePath = path.join(__dirname, '..', song.coverImage.path);
    } else {
      // Return default cover
      imagePath = path.join(__dirname, '..', 'uploads', 'covers', 'default-cover.jpg');
    }

    // Check if file exists
    if (!fs.existsSync(imagePath)) {
      imagePath = path.join(__dirname, '..', 'uploads', 'covers', 'default-cover.jpg');
    }

    const stat = fs.statSync(imagePath);
    const ext = path.extname(imagePath).toLowerCase();
    let contentType = 'image/jpeg';

    switch (ext) {
      case '.png':
        contentType = 'image/png';
        break;
      case '.webp':
        contentType = 'image/webp';
        break;
      case '.gif':
        contentType = 'image/gif';
        break;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours

    fs.createReadStream(imagePath).pipe(res);
  } catch (error) {
    console.error('Stream cover error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stream cover image',
      error: error.message
    });
  }
});

// @desc    Get audio metadata
// @route   GET /api/stream/metadata/:id
// @access  Private
router.get('/metadata/:id', auth, async (req, res) => {
  try {
    const songId = req.params.id;
    const song = await Song.findById(songId)
      .populate('uploadedBy', 'username profile.avatar');

    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Song not found'
      });
    }

    if (song.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Song is not available'
      });
    }

    res.json({
      success: true,
      data: {
        id: song._id,
        title: song.title,
        artist: song.artist,
        album: song.album,
        duration: song.duration,
        formattedDuration: song.formattedDuration,
        genre: song.genre,
        language: song.language,
        coverUrl: song.coverUrl,
        audioUrl: song.audioUrl,
        playCount: song.playCount,
        ratings: song.ratings,
        uploadedBy: song.uploadedBy,
        metadata: song.metadata
      }
    });
  } catch (error) {
    console.error('Get metadata error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get metadata',
      error: error.message
    });
  }
});

// @desc    Download audio file
// @route   GET /api/stream/download/:id
// @access  Private
router.get('/download/:id', auth, async (req, res) => {
  try {
    const songId = req.params.id;
    const song = await Song.findById(songId);

    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Song not found'
      });
    }

    if (song.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Song is not available for download'
      });
    }

    const audioPath = path.join(__dirname, '..', song.audioFile.path);

    // Check if file exists
    if (!fs.existsSync(audioPath)) {
      return res.status(404).json({
        success: false,
        message: 'Audio file not found'
      });
    }

    // Increment download count
    await song.incrementDownloadCount();

    const stat = fs.statSync(audioPath);
    const filename = `${song.title} - ${song.artist}.${song.audioFile.format}`;

    res.setHeader('Content-Type', `audio/${song.audioFile.format}`);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    fs.createReadStream(audioPath).pipe(res);
  } catch (error) {
    console.error('Download audio error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download audio',
      error: error.message
    });
  }
});

// @desc    Get streaming quality options
// @route   GET /api/stream/quality/:id
// @access  Private
router.get('/quality/:id', auth, async (req, res) => {
  try {
    const songId = req.params.id;
    const song = await Song.findById(songId);

    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Song not found'
      });
    }

    // In a real implementation, you might have multiple quality versions
    const qualityOptions = [
      {
        quality: song.audioFile.quality || 'medium',
        bitrate: song.audioFile.bitrate || 128,
        format: song.audioFile.format,
        size: song.audioFile.size,
        url: `/api/stream/audio/${songId}`
      }
    ];

    res.json({
      success: true,
      data: {
        available: qualityOptions,
        recommended: qualityOptions[0]
      }
    });
  } catch (error) {
    console.error('Get quality options error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get quality options',
      error: error.message
    });
  }
});

// @desc    Report playback completion
// @route   POST /api/stream/complete/:id
// @access  Private
router.post('/complete/:id', auth, async (req, res) => {
  try {
    const songId = req.params.id;
    const { duration, percentage } = req.body;

    const song = await Song.findById(songId);
    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Song not found'
      });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Find the latest listening history entry for this song
    const historyEntry = user.listeningHistory.find(h => 
      h.song.toString() === songId && 
      h.playedAt > new Date(Date.now() - 10 * 60 * 1000) // Within last 10 minutes
    );

    if (historyEntry) {
      historyEntry.duration = duration || historyEntry.duration;
      historyEntry.completed = percentage >= 80; // Consider completed if 80% played
      await user.save();
    }

    res.json({
      success: true,
      message: 'Playback completion recorded'
    });
  } catch (error) {
    console.error('Report completion error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to report completion',
      error: error.message
    });
  }
});

// @desc    Get playlist stream URLs
// @route   GET /api/stream/playlist/:id
// @access  Private
router.get('/playlist/:id', auth, async (req, res) => {
  try {
    const playlistId = req.params.id;
    const Playlist = require('../models/Playlist');
    
    const playlist = await Playlist.findById(playlistId)
      .populate({
        path: 'songs.song',
        match: { status: 'active' },
        populate: {
          path: 'uploadedBy',
          select: 'username profile.avatar'
        }
      });

    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: 'Playlist not found'
      });
    }

    // Check permissions
    if (!playlist.hasPermission(req.user.userId, 'view')) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this playlist'
      });
    }

    // Filter out null songs (inactive songs)
    const validSongs = playlist.songs.filter(item => item.song);

    const streamData = validSongs.map(item => ({
      id: item.song._id,
      title: item.song.title,
      artist: item.song.artist,
      duration: item.song.duration,
      formattedDuration: item.song.formattedDuration,
      coverUrl: item.song.coverUrl,
      audioUrl: item.song.audioUrl,
      position: item.position,
      addedAt: item.addedAt
    }));

    res.json({
      success: true,
      data: {
        playlist: {
          id: playlist._id,
          name: playlist.name,
          totalDuration: playlist.metadata.totalDuration
        },
        songs: streamData
      }
    });
  } catch (error) {
    console.error('Get playlist stream error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get playlist stream data',
      error: error.message
    });
  }
});

module.exports = router;