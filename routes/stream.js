const express = require('express');
const Song = require('../models/Song');
const User = require('../models/User');
const Playlist = require('../models/Playlist');
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

    // Return Cloudinary streaming URL with proper headers
    res.json({
      success: true,
      data: {
        streamUrl: song.audioFile.secureUrl,
        song: {
          id: song._id,
          title: song.title,
          artist: song.artist,
          duration: song.duration,
          coverUrl: song.coverUrl
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

// @desc    Get streaming URL with quality options
// @route   GET /api/stream/url/:id
// @access  Private
router.get('/url/:id', auth, async (req, res) => {
  try {
    const songId = req.params.id;
    const { quality = 'auto' } = req.query;

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

    // Generate streaming URL with quality parameter
    let streamUrl = song.audioFile.secureUrl;
    
    // Add quality transformation if needed
    if (quality !== 'auto' && quality !== 'original') {
      const qualityMap = {
        'low': 'br_64',
        'medium': 'br_128',
        'high': 'br_320'
      };
      
      if (qualityMap[quality]) {
        // Insert quality parameter in Cloudinary URL
        streamUrl = song.audioFile.secureUrl.replace('/upload/', `/upload/q_auto,${qualityMap[quality]}/`);
      }
    }

    res.json({
      success: true,
      data: {
        streamUrl,
        originalUrl: song.audioFile.secureUrl,
        quality,
        song: {
          id: song._id,
          title: song.title,
          artist: song.artist,
          duration: song.duration,
          formattedDuration: song.formattedDuration,
          coverUrl: song.coverUrl,
          genre: song.genre,
          language: song.language
        }
      }
    });
  } catch (error) {
    console.error('Get stream URL error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get stream URL',
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
    const { size = 'medium' } = req.query;

    const song = await Song.findById(songId);
    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Song not found'
      });
    }

    let coverUrl = song.coverUrl;
    
    // Apply size transformation
    if (song.coverImage && song.coverImage.secureUrl) {
      const sizeMap = {
        'small': 'w_150,h_150,c_fill',
        'medium': 'w_300,h_300,c_fill', 
        'large': 'w_500,h_500,c_fill',
        'original': ''
      };

      if (sizeMap[size] && size !== 'original') {
        coverUrl = song.coverImage.secureUrl.replace('/upload/', `/upload/${sizeMap[size]}/`);
      }
    }

    res.json({
      success: true,
      data: {
        coverUrl,
        originalUrl: song.coverImage?.secureUrl || song.coverUrl
      }
    });
  } catch (error) {
    console.error('Stream cover error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get cover image',
      error: error.message
    });
  }
});

// @desc    Get audio metadata for player
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

    // Check if user has liked this song
    const user = await User.findById(req.user.userId);
    const isLiked = user && user.likedSongs.some(like => like.song.toString() === songId);

    // Get user's rating for this song
    const userRating = user && user.ratings.find(rating => rating.song.toString() === songId);

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
        mood: song.mood,
        coverUrl: song.coverUrl,
        streamUrl: song.audioFile.secureUrl,
        playCount: song.playCount,
        likeCount: song.likeCount,
        isLiked,
        userRating: userRating ? userRating.rating : null,
        ratings: song.ratings,
        uploadedBy: song.uploadedBy,
        metadata: song.metadata,
        lyrics: song.lyrics
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

    // Increment download count
    await song.incrementDownloadCount();

    // Generate download URL with proper filename
    const filename = `${song.title} - ${song.artist}`.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    let downloadUrl = song.audioFile.secureUrl;
    
    // Add download flag to Cloudinary URL
    downloadUrl = downloadUrl.replace('/upload/', '/upload/fl_attachment/');

    res.json({
      success: true,
      message: 'Download link generated',
      data: {
        downloadUrl,
        filename: `${filename}.${song.audioFile.format}`,
        size: song.audioFile.size,
        format: song.audioFile.format,
        downloadCount: song.downloadCount
      }
    });
  } catch (error) {
    console.error('Download audio error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate download link',
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

    // Available quality options with Cloudinary transformations
    const qualityOptions = [
      {
        quality: 'low',
        label: 'Low (64 kbps)',
        bitrate: 64,
        url: song.audioFile.secureUrl.replace('/upload/', '/upload/q_auto,br_64/'),
        size: Math.round(song.audioFile.size * 0.3) // Approximate
      },
      {
        quality: 'medium',
        label: 'Medium (128 kbps)',
        bitrate: 128,
        url: song.audioFile.secureUrl.replace('/upload/', '/upload/q_auto,br_128/'),
        size: Math.round(song.audioFile.size * 0.6) // Approximate
      },
      {
        quality: 'high',
        label: 'High (320 kbps)',
        bitrate: 320,
        url: song.audioFile.secureUrl.replace('/upload/', '/upload/q_auto,br_320/'),
        size: Math.round(song.audioFile.size * 0.9) // Approximate
      },
      {
        quality: 'original',
        label: 'Original',
        bitrate: song.audioFile.bitrate || 'Unknown',
        url: song.audioFile.secureUrl,
        size: song.audioFile.size
      }
    ];

    res.json({
      success: true,
      data: {
        available: qualityOptions,
        recommended: qualityOptions[1], // Medium quality
        currentFormat: song.audioFile.format
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

// @desc    Report playback progress/completion
// @route   POST /api/stream/progress/:id
// @access  Private
router.post('/progress/:id', auth, async (req, res) => {
  try {
    const songId = req.params.id;
    const { currentTime, duration, percentage, completed = false } = req.body;

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

    // Update or create listening history entry
    const recentEntry = user.listeningHistory.find(h => 
      h.song.toString() === songId && 
      h.playedAt > new Date(Date.now() - 10 * 60 * 1000) // Within last 10 minutes
    );

    if (recentEntry) {
      recentEntry.duration = currentTime || recentEntry.duration;
      recentEntry.completed = completed || (percentage >= 80);
    } else {
      // Create new entry if none exists recently
      user.addToHistory(songId, currentTime || 0, completed);
    }

    await user.save();

    res.json({
      success: true,
      message: 'Progress updated',
      data: {
        currentTime,
        percentage,
        completed: completed || (percentage >= 80)
      }
    });
  } catch (error) {
    console.error('Update progress error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update progress',
      error: error.message
    });
  }
});

// @desc    Get playlist stream data
// @route   GET /api/stream/playlist/:id
// @access  Private
router.get('/playlist/:id', auth, async (req, res) => {
  try {
    const playlistId = req.params.id;
    const { shuffle = false } = req.query;
    
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

    // Filter out null songs (inactive songs) and prepare stream data
    let validSongs = playlist.songs.filter(item => item.song);

    // Shuffle if requested
    if (shuffle === 'true') {
      validSongs = validSongs.sort(() => Math.random() - 0.5);
    }

    const streamData = validSongs.map((item, index) => ({
      id: item.song._id,
      title: item.song.title,
      artist: item.song.artist,
      album: item.song.album,
      duration: item.song.duration,
      formattedDuration: item.song.formattedDuration,
      genre: item.song.genre,
      language: item.song.language,
      coverUrl: item.song.coverUrl,
      streamUrl: item.song.audioFile.secureUrl,
      playCount: item.song.playCount,
      uploadedBy: item.song.uploadedBy,
      position: shuffle === 'true' ? index + 1 : item.position,
      addedAt: item.addedAt,
      addedBy: item.addedBy
    }));

    // Increment playlist play count
    await playlist.incrementPlayCount();

    res.json({
      success: true,
      data: {
        playlist: {
          id: playlist._id,
          name: playlist.name,
          description: playlist.description,
          coverUrl: playlist.coverUrl,
          totalDuration: playlist.metadata.totalDuration,
          formattedDuration: playlist.formattedDuration,
          songCount: streamData.length,
          playCount: playlist.playCount,
          owner: playlist.owner
        },
        songs: streamData,
        shuffled: shuffle === 'true'
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

// @desc    Get next song in playlist
// @route   GET /api/stream/playlist/:playlistId/next/:currentSongId
// @access  Private
router.get('/playlist/:playlistId/next/:currentSongId', auth, async (req, res) => {
  try {
    const { playlistId, currentSongId } = req.params;
    
    const playlist = await Playlist.findById(playlistId)
      .populate({
        path: 'songs.song',
        match: { status: 'active' }
      });

    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: 'Playlist not found'
      });
    }

    if (!playlist.hasPermission(req.user.userId, 'view')) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const validSongs = playlist.songs.filter(item => item.song);
    const currentIndex = validSongs.findIndex(item => 
      item.song._id.toString() === currentSongId
    );

    if (currentIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Current song not found in playlist'
      });
    }

    // Get next song (loop to beginning if at end)
    const nextIndex = (currentIndex + 1) % validSongs.length;
    const nextSong = validSongs[nextIndex].song;

    res.json({
      success: true,
      data: {
        song: {
          id: nextSong._id,
          title: nextSong.title,
          artist: nextSong.artist,
          duration: nextSong.duration,
          coverUrl: nextSong.coverUrl,
          streamUrl: nextSong.audioFile.secureUrl
        },
        position: nextIndex + 1,
        hasNext: nextIndex < validSongs.length - 1,
        isLoop: nextIndex === 0 && currentIndex === validSongs.length - 1
      }
    });
  } catch (error) {
    console.error('Get next song error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get next song',
      error: error.message
    });
  }
});

// @desc    Get previous song in playlist
// @route   GET /api/stream/playlist/:playlistId/previous/:currentSongId  
// @access  Private
router.get('/playlist/:playlistId/previous/:currentSongId', auth, async (req, res) => {
  try {
    const { playlistId, currentSongId } = req.params;
    
    const playlist = await Playlist.findById(playlistId)
      .populate({
        path: 'songs.song',
        match: { status: 'active' }
      });

    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: 'Playlist not found'
      });
    }

    if (!playlist.hasPermission(req.user.userId, 'view')) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const validSongs = playlist.songs.filter(item => item.song);
    const currentIndex = validSongs.findIndex(item => 
      item.song._id.toString() === currentSongId
    );

    if (currentIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Current song not found in playlist'
      });
    }

    // Get previous song (loop to end if at beginning)
    const prevIndex = currentIndex === 0 ? validSongs.length - 1 : currentIndex - 1;
    const prevSong = validSongs[prevIndex].song;

    res.json({
      success: true,
      data: {
        song: {
          id: prevSong._id,
          title: prevSong.title,
          artist: prevSong.artist,
          duration: prevSong.duration,
          coverUrl: prevSong.coverUrl,
          streamUrl: prevSong.audioFile.secureUrl
        },
        position: prevIndex + 1,
        hasPrevious: prevIndex > 0,
        isLoop: prevIndex === validSongs.length - 1 && currentIndex === 0
      }
    });
  } catch (error) {
    console.error('Get previous song error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get previous song',
      error: error.message
    });
  }
});

module.exports = router;