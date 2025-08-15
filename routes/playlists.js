const express = require("express");
const Playlist = require("../models/Playlist");
const Song = require("../models/Song");
const User = require("../models/User");
const auth = require("../middleware/auth");
const { uploadPlaylistCover } = require("../config/cloudinary");
const { body, validationResult } = require("express-validator");

const router = express.Router();

// @desc    Get all playlists with filters
// @route   GET /api/playlists
// @access  Public
router.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      category,
      privacy = "public",
      sortBy = "playCount",
      sortOrder = "desc",
    } = req.query;

    const filters = { privacy };
    if (category) filters.category = category;

    const playlists = await Playlist.searchPlaylists(search, filters)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ [sortBy]: sortOrder === "desc" ? -1 : 1 });

    const total = await Playlist.countDocuments({
      ...filters,
      status: "active",
      ...(search && { $text: { $search: search } }),
    });

    res.json({
      success: true,
      data: {
        playlists,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
          hasNext: page * limit < total,
          hasPrev: page > 1,
        },
      },
    });
  } catch (error) {
    console.error("Get playlists error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch playlists",
      error: error.message,
    });
  }
});

// @desc    Get featured playlists
// @route   GET /api/playlists/featured
// @access  Public
router.get("/featured", async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const playlists = await Playlist.getFeatured(parseInt(limit));

    res.json({
      success: true,
      data: { playlists },
    });
  } catch (error) {
    console.error("Get featured playlists error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch featured playlists",
      error: error.message,
    });
  }
});

// @desc    Get user playlists
// @route   GET /api/playlists/user/:userId
// @access  Public
router.get("/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { includePrivate = false } = req.query;

    // Check if requesting user can see private playlists
    const canSeePrivate =
      req.user && (req.user.userId === userId || req.user.role === "admin");

    const playlists = await Playlist.getUserPlaylists(
      userId,
      canSeePrivate && includePrivate === "true"
    );

    res.json({
      success: true,
      data: { playlists },
    });
  } catch (error) {
    console.error("Get user playlists error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user playlists",
      error: error.message,
    });
  }
});

// @desc    Get playlist by ID
// @route   GET /api/playlists/:id
// @access  Public
router.get("/:id", async (req, res) => {
  try {
    const playlist = await Playlist.findById(req.params.id)
      .populate(
        "owner",
        "username profile.firstName profile.lastName profile.avatar"
      )
      .populate(
        "collaborators.user",
        "username profile.firstName profile.lastName profile.avatar"
      )
      .populate({
        path: "songs.song",
        populate: {
          path: "uploadedBy",
          select: "username profile.avatar",
        },
      })
      .populate("followers.user", "username profile.avatar");

    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: "Playlist not found",
      });
    }

    // Check if user has permission to view
    const hasPermission = req.user
      ? playlist.hasPermission(req.user.userId, "view")
      : playlist.privacy === "public";

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: "Access denied to this playlist",
      });
    }

    res.json({
      success: true,
      data: { playlist },
    });
  } catch (error) {
    console.error("Get playlist error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch playlist",
      error: error.message,
    });
  }
});

// @desc    Create playlist
// @route   POST /api/playlists
// @access  Private
router.post(
  "/",
  [
    auth,
    uploadPlaylistCover.single("coverImage"),
    [
      body("name").notEmpty().withMessage("Playlist name is required").trim(),
      body("description").optional().trim(),
      body("privacy").optional().isIn(["public", "private", "unlisted"]),
      body("category")
        .optional()
        .isIn([
          "personal",
          "mood",
          "genre",
          "activity",
          "collaborative",
          "auto-generated",
        ]),
    ],
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const playlistData = {
        ...req.body,
        owner: req.user.userId,
      };

      // Handle cover image upload
      if (req.file) {
        playlistData.coverImage = {
          cloudinaryId: req.file.public_id,
          url: req.file.url,
          secureUrl: req.file.secure_url,
          size: req.file.bytes,
          format: req.file.format,
        };
      }

      // Parse arrays if they're strings
      if (playlistData.tags && typeof playlistData.tags === "string") {
        playlistData.tags = JSON.parse(playlistData.tags);
      }

      const playlist = await Playlist.create(playlistData);

      // Update user's playlist count
      await User.findByIdAndUpdate(req.user.userId, {
        $inc: { "activity.playlistsCreated": 1 },
      });

      await playlist.populate(
        "owner",
        "username profile.firstName profile.lastName profile.avatar"
      );

      res.status(201).json({
        success: true,
        message: "Playlist created successfully",
        data: { playlist },
      });
    } catch (error) {
      console.error("Create playlist error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create playlist",
        error: error.message,
      });
    }
  }
);

// @desc    Update playlist
// @route   PUT /api/playlists/:id
// @access  Private
router.put("/:id", [auth, uploadPlaylistCover.single("coverImage")], async (req, res) => {
  try {
    const playlist = await Playlist.findById(req.params.id);

    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: "Playlist not found",
      });
    }

    // Check permissions
    if (!playlist.hasPermission(req.user.userId, "edit")) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const updates = { ...req.body };

    // Handle cover image upload
    if (req.file) {
      updates.coverImage = {
        cloudinaryId: req.file.public_id,
        url: req.file.url,
        secureUrl: req.file.secure_url,
        size: req.file.bytes,
        format: req.file.format,
      };
    }

    // Parse arrays if they're strings
    if (updates.tags && typeof updates.tags === "string") {
      updates.tags = JSON.parse(updates.tags);
    }

    const updatedPlaylist = await Playlist.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    ).populate(
      "owner",
      "username profile.firstName profile.lastName profile.avatar"
    );

    res.json({
      success: true,
      message: "Playlist updated successfully",
      data: { playlist: updatedPlaylist },
    });
  } catch (error) {
    console.error("Update playlist error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update playlist",
      error: error.message,
    });
  }
});

// @desc    Delete playlist
// @route   DELETE /api/playlists/:id
// @access  Private
router.delete("/:id", auth, async (req, res) => {
  try {
    const playlist = await Playlist.findById(req.params.id);

    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: "Playlist not found",
      });
    }

    // Check permissions (owner or admin)
    if (playlist.owner.toString() !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Soft delete
    playlist.status = 'deleted';
    await playlist.save();

    // Update user's playlist count
    await User.findByIdAndUpdate(playlist.owner, {
      $inc: { "activity.playlistsCreated": -1 },
    });

    res.json({
      success: true,
      message: "Playlist deleted successfully",
    });
  } catch (error) {
    console.error("Delete playlist error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete playlist",
      error: error.message,
    });
  }
});

// @desc    Add song to playlist
// @route   POST /api/playlists/:id/songs
// @access  Private
router.post('/:id/songs', [
  auth,
  [
    body('songId').notEmpty().withMessage('Song ID is required')
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

    const { songId } = req.body;
    const playlistId = req.params.id;

    const playlist = await Playlist.findById(playlistId);
    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: 'Playlist not found'
      });
    }

    // Check permissions
    if (!playlist.hasPermission(req.user.userId, 'edit')) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Check if song exists
    const song = await Song.findById(songId);
    if (!song || song.status !== 'active') {
      return res.status(404).json({
        success: false,
        message: 'Song not found or inactive'
      });
    }

    // Add song to playlist
    await playlist.addSong(songId, req.user.userId);

    // Populate the added song
    await playlist.populate({
      path: 'songs.song',
      populate: {
        path: 'uploadedBy',
        select: 'username profile.avatar'
      }
    });

    res.json({
      success: true,
      message: 'Song added to playlist',
      data: { playlist }
    });
  } catch (error) {
    if (error.message === 'Song already exists in playlist') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    console.error('Add song to playlist error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add song to playlist',
      error: error.message
    });
  }
});

// @desc    Remove song from playlist
// @route   DELETE /api/playlists/:id/songs/:songId
// @access  Private
router.delete('/:id/songs/:songId', auth, async (req, res) => {
  try {
    const { id: playlistId, songId } = req.params;

    const playlist = await Playlist.findById(playlistId);
    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: 'Playlist not found'
      });
    }

    // Check permissions
    if (!playlist.hasPermission(req.user.userId, 'edit')) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Remove song from playlist
    await playlist.removeSong(songId);

    res.json({
      success: true,
      message: 'Song removed from playlist'
    });
  } catch (error) {
    if (error.message === 'Song not found in playlist') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    console.error('Remove song from playlist error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove song from playlist',
      error: error.message
    });
  }
});

// @desc    Reorder songs in playlist
// @route   PUT /api/playlists/:id/songs/:songId/position
// @access  Private
router.put('/:id/songs/:songId/position', [
  auth,
  [
    body('position').isInt({ min: 1 }).withMessage('Position must be a positive integer')
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

    const { id: playlistId, songId } = req.params;
    const { position } = req.body;

    const playlist = await Playlist.findById(playlistId);
    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: 'Playlist not found'
      });
    }

    // Check permissions
    if (!playlist.hasPermission(req.user.userId, 'edit')) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Reorder songs
    await playlist.reorderSongs(songId, parseInt(position));

    res.json({
      success: true,
      message: 'Song position updated',
      data: { playlist }
    });
  } catch (error) {
    if (error.message === 'Song not found in playlist') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    console.error('Reorder playlist songs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reorder songs',
      error: error.message
    });
  }
});

// @desc    Follow/Unfollow playlist
// @route   POST /api/playlists/:id/follow
// @access  Private
router.post('/:id/follow', auth, async (req, res) => {
  try {
    const playlist = await Playlist.findById(req.params.id);

    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: 'Playlist not found'
      });
    }

    // Can't follow your own playlist
    if (playlist.owner.toString() === req.user.userId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot follow your own playlist'
      });
    }

    const result = playlist.toggleFollow(req.user.userId);
    await playlist.save();

    res.json({
      success: true,
      message: `Playlist ${result.action}`,
      data: {
        action: result.action,
        followerCount: playlist.followers.length
      }
    });
  } catch (error) {
    console.error('Follow playlist error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to follow/unfollow playlist',
      error: error.message
    });
  }
});

// @desc    Play playlist (increment play count)
// @route   POST /api/playlists/:id/play
// @access  Private
router.post('/:id/play', auth, async (req, res) => {
  try {
    const playlist = await Playlist.findById(req.params.id);

    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: 'Playlist not found'
      });
    }

    // Check if user has permission to play
    if (!playlist.hasPermission(req.user.userId, 'view')) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this playlist'
      });
    }

    // Increment play count
    await playlist.incrementPlayCount();

    res.json({
      success: true,
      message: 'Playlist play count updated',
      data: { playCount: playlist.playCount }
    });
  } catch (error) {
    console.error('Play playlist error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update play count',
      error: error.message
    });
  }
});

module.exports = router;