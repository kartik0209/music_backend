const express = require('express');
const Song = require('../models/Song');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// @desc    Stream audio file (Cloudinary URL)
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

    // Throttled play count increment (prevent abuse)
    const user = await User.findById(req.user.userId);
    if (user) {
      const lastPlay = user.listeningHistory?.find(h => 
        h.song.toString() === songId &&
        h.playedAt > new Date(Date.now() - 30000) // 30 seconds ago
      );
      
      if (!lastPlay) {
        // Add to listening history
        if (user.addToHistory) {
          user.addToHistory(songId, song.duration, false);
        } else {
          // Fallback if addToHistory method doesn't exist
          user.listeningHistory = user.listeningHistory || [];
          user.listeningHistory.push({
            song: songId,
            playedAt: new Date(),
            duration: 0,
            completed: false
          });
        }
        await user.save();
        
        // Increment song play count
        if (song.incrementPlayCount) {
          await song.incrementPlayCount();
        } else {
          // Fallback if incrementPlayCount method doesn't exist
          song.playCount = (song.playCount || 0) + 1;
          await song.save();
        }
      }
    }

    // Return the Cloudinary URL directly - let the frontend handle streaming
    const streamUrl = song.audioFile?.secureUrl || song.audioFile?.url;
    
    if (!streamUrl) {
      return res.status(404).json({
        success: false,
        message: 'Audio file not found'
      });
    }

    res.json({
      success: true,
      data: {
        streamUrl: streamUrl,
        song: {
          id: song._id,
          title: song.title,
          artist: song.artist,
          duration: song.duration,
          coverUrl: song.coverImage?.secureUrl || song.coverImage?.url || song.coverUrl
        }
      }
    });

  } catch (error) {
    console.error('Stream audio error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stream audio',
      error: error.message
    });
  }
});

// @desc    Report song completion
// @route   POST /api/stream/complete/:id
// @access  Private
router.post('/complete/:id', auth, async (req, res) => {
  try {
    const songId = req.params.id;
    const { duration, percentage } = req.body;

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update listening history
    const historyItem = user.listeningHistory?.find(h => 
      h.song.toString() === songId &&
      h.playedAt > new Date(Date.now() - 300000) // 5 minutes ago
    );

    if (historyItem) {
      historyItem.duration = duration;
      historyItem.completed = percentage >= 80; // Consider completed if 80% played
      await user.save();
    }

    res.json({
      success: true,
      message: 'Completion reported successfully'
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

// @desc    Get streaming stats
// @route   GET /api/stream/stats
// @access  Private (Admin only)
router.get('/stats', auth, async (req, res) => {
  try {
    // You can implement streaming statistics here
    const stats = {
      totalStreams: 0,
      activeStreams: 0,
      bandwidth: 0
    };

    res.json({
      success: true,
      data: { stats }
    });

  } catch (error) {
    console.error('Get streaming stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get streaming stats',
      error: error.message
    });
  }
});

module.exports = router;