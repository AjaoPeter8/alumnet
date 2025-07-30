import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import multer from 'multer';
import cookieParser from 'cookie-parser';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken, authorizeSocket } from './auth.js';
import pool from './db.js';




const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5000'],
    credentials: true
  },
  path: '/socket.io'
});

// const pool = mysql.createPool({
//   host: 'localhost',
//   user: 'root',
//   password: '',
//   database: 'alumnet',
//   port: 3306
// });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, `${uuidv4()}-${file.originalname}`)
});
const upload = multer({ storage });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

io.use(authorizeSocket);
io.on('connection', (socket) => {
  console.log(`User ${socket.user.username} connected via WebSocket`);
  socket.on('register', (userId) => socket.join(userId));
  socket.on('typing', ({ to }) => {
    socket.to(to).emit('typing', socket.user.user_id);
  });
  socket.on('disconnect', () => console.log(`Socket ${socket.id} disconnected`));
});

app.get('/login', (req, res) => res.render('login'));

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const [users] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    if (users.length === 0) return res.status(401).json({ message: 'Invalid credentials' });

    const user = users[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ user_id: user.user_id, username: user.username }, 'your_jwt_secret_key', { expiresIn: '1h' });
    res.cookie('token', token, { httpOnly: true });
    res.json({ token });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/', authenticateToken, (req, res) => {
  res.render('home', { user: req.user });
});

app.get('/chat', authenticateToken, async (req, res) => {
  try {
    const [users] = await pool.query('SELECT user_id, username, job_title FROM users WHERE username != ?', [req.user.username]);
    const avatars = {
      sophia: '/images/sophia.jpg',
      ethan: '/images/ethan.jpg',
      liam: '/images/liam.jpg',
      olivia: '/images/olivia.jpg',
      noah: '/images/noah.jpg',
      ava: '/images/ava.jpg',
      jackson: '/images/jackson.jpg'
    };
    res.render('chat', {
      user: req.user.username,
      user_id: req.user.user_id,
      users,
      avatars,
      defaultAvatar: '/images/default-avatar.jpg',
      nonce: Buffer.from(Date.now().toString()).toString('base64')
    });
  } catch (err) {
    res.status(500).send('Server error');
  }
});

app.get('/messages', authenticateToken, async (req, res) => {
  const { sender_id, receiver_id } = req.query;
  try {
    const [messages] = await pool.query(`
      SELECT m.*, u1.username AS sender, u2.username AS receiver
      FROM messages m
      JOIN users u1 ON m.sender_id = u1.user_id
      JOIN users u2 ON m.receiver_id = u2.user_id
      WHERE (m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?)
      ORDER BY m.timestamp ASC
    `, [sender_id, receiver_id, receiver_id, sender_id]);

    // Avatar mapping (should match /chat route)
    const avatars = {
      sophia: '/images/sophia.jpg',
      ethan: '/images/ethan.jpg',
      liam: '/images/liam.jpg',
      olivia: '/images/olivia.jpg',
      noah: '/images/noah.jpg',
      ava: '/images/ava.jpg',
      jackson: '/images/jackson.jpg'
    };
    const defaultAvatar = '/images/default-avatar.jpg';

    // Attach avatar_url to each message (for sender)
    const messagesWithAvatars = messages.map(msg => ({
      ...msg,
      avatar_url: avatars[msg.sender?.toLowerCase()] || defaultAvatar
    }));
    res.json(messagesWithAvatars);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/send', authenticateToken, upload.single('file'), async (req, res) => {
  const { sender_id, receiver_id, content } = req.body;
  const file = req.file;
  try {
    const file_url = file ? `/uploads/${file.filename}` : null;
    const file_name = file ? file.originalname : null;

    await pool.query(
      'INSERT INTO messages (sender_id, receiver_id, content, file_url, file_name, timestamp) VALUES (?, ?, ?, ?, ?, NOW())',
      [sender_id, receiver_id, content || '', file_url, file_name]
    );

    // Emit to both sender and receiver with message data
    const messageData = {
      sender_id,
      receiver_id,
      content: content || '',
      file_url,
      file_name,
      timestamp: new Date()
    };

    io.to(sender_id).to(receiver_id).emit('privateMessage', messageData);
    res.json({ success: true });
  } catch (err) {
    console.error("error:", err);
    console.error('Send error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/news', authenticateToken, async (req, res) => {
  try {
    // Fetch news posts with author information
    const [newsPosts] = await pool.query(`
      SELECT n.*, u.username, u.full_name
      FROM news_posts n
      LEFT JOIN users u ON n.user_id = u.user_id
      ORDER BY n.is_featured DESC, n.created_at DESC
    `);

    // Fetch comments for each news post
    for (let post of newsPosts) {
      const [comments] = await pool.query(`
        SELECT c.*, u.username, u.full_name
        FROM news_comments c
        LEFT JOIN users u ON c.user_id = u.user_id
        WHERE c.news_id = ?
        ORDER BY c.created_at ASC
      `, [post.news_id]);
      post.comments = comments;
    }

    res.render('news', { user: req.user, newsPosts });
  } catch (err) {
    console.error('News fetch error:', err);
    res.status(500).send('Server error');
  }
});

// Add comment to news post
app.post('/news/:newsId/comment', authenticateToken, async (req, res) => {
  // Decode the newsId parameter to handle forward slashes
  const newsId = decodeURIComponent(req.params.newsId);
  const { content } = req.body;
  const userId = req.user.user_id;

  console.log('=== Comment POST Request ===');
  console.log('Raw params.newsId:', req.params.newsId);
  console.log('Decoded News ID:', newsId);
  console.log('Content:', content);
  console.log('User ID:', userId);
  console.log('User object:', req.user);

  try {
    // Validate input
    if (!content || !content.trim()) {
      console.log('Error: Empty content');
      return res.status(400).json({ success: false, message: 'Comment content is required' });
    }

    if (!newsId) {
      console.log('Error: Missing news ID');
      return res.status(400).json({ success: false, message: 'News ID is required' });
    }

    // Check if news post exists
    const [newsCheck] = await pool.query('SELECT news_id FROM news_posts WHERE news_id = ?', [newsId]);
    if (newsCheck.length === 0) {
      console.log('Error: News post not found');
      return res.status(404).json({ success: false, message: 'News post not found' });
    }

    const commentId = `COM/${Date.now()}`;
    console.log('Generated comment ID:', commentId);

    await pool.query(
      'INSERT INTO news_comments (comment_id, news_id, user_id, content) VALUES (?, ?, ?, ?)',
      [commentId, newsId, userId, content.trim()]
    );

    console.log('Comment inserted successfully');

    // Fetch the new comment with user info
    const [newComment] = await pool.query(`
      SELECT c.*, u.username, u.full_name
      FROM news_comments c
      LEFT JOIN users u ON c.user_id = u.user_id
      WHERE c.comment_id = ?
    `, [commentId]);

    console.log('New comment fetched:', newComment[0]);

    res.json({ success: true, comment: newComment[0] });
  } catch (err) {
    console.error('Comment error details:', err);
    console.error('Error stack:', err.stack);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// Get comments for a specific news post
app.get('/news/:newsId/comments', authenticateToken, async (req, res) => {
  const { newsId } = req.params;

  try {
    const [comments] = await pool.query(`
      SELECT c.*, u.username, u.full_name
      FROM news_comments c
      LEFT JOIN users u ON c.user_id = u.user_id
      WHERE c.news_id = ?
      ORDER BY c.created_at ASC
    `, [newsId]);

    res.json({ success: true, comments });
  } catch (err) {
    console.error('Comments fetch error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Create new news post
app.post('/news/create', authenticateToken, upload.single('image'), async (req, res) => {
  const { title, content, category } = req.body;
  const userId = req.user.user_id;
  const imageFile = req.file;

  console.log('=== Create Post Request ===');
  console.log('Title:', title);
  console.log('Content:', content);
  console.log('Category:', category);
  console.log('User ID:', userId);
  console.log('Image file:', imageFile);

  try {
    // Validate input
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Title is required' });
    }

    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Content is required' });
    }

    // Generate news ID
    const newsId = `NEWS/${Date.now()}`;
    const imageUrl = imageFile ? `/uploads/${imageFile.filename}` : null;

    // Insert news post
    await pool.query(
      'INSERT INTO news_posts (news_id, user_id, title, content, category, image_url, is_featured) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [newsId, userId, title.trim(), content.trim(), category || 'general', imageUrl, false]
    );

    console.log('News post created successfully:', newsId);

    // Log activity
    try {
      await pool.query(
        'INSERT INTO user_activities (user_id, activity_type, description) VALUES (?, ?, ?)',
        [userId, 'post_created', `Created news post: ${title.trim()}`]
      );
    } catch (activityErr) {
      console.warn('Failed to log activity:', activityErr.message);
    }

    res.json({ success: true, message: 'Post created successfully', newsId });
  } catch (err) {
    console.error('Create post error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// Delete news post (for post authors and admins)
app.delete('/news/:newsId/delete', authenticateToken, async (req, res) => {
  const newsId = decodeURIComponent(req.params.newsId);
  const userId = req.user.user_id;
  const userRole = req.user.role;

  console.log('=== Delete Post Request ===');
  console.log('News ID:', newsId);
  console.log('User ID:', userId);
  console.log('User Role:', userRole);

  try {
    // Check if post exists and get post details
    const [posts] = await pool.query(
      'SELECT * FROM news_posts WHERE news_id = ?',
      [newsId]
    );

    if (posts.length === 0) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const post = posts[0];

    // Check permissions: user must be the author or an admin
    if (post.user_id !== userId && userRole !== 'admin') {
      return res.status(403).json({ success: false, message: 'You can only delete your own posts' });
    }

    // Delete associated comments first
    await pool.query('DELETE FROM news_comments WHERE news_id = ?', [newsId]);

    // Delete the post
    await pool.query('DELETE FROM news_posts WHERE news_id = ?', [newsId]);

    console.log('Post deleted successfully:', newsId);

    // Log activity
    try {
      await pool.query(
        'INSERT INTO user_activities (user_id, activity_type, description) VALUES (?, ?, ?)',
        [userId, 'post_deleted', `Deleted news post: ${post.title}`]
      );
    } catch (activityErr) {
      console.warn('Failed to log activity:', activityErr.message);
    }

    res.json({ success: true, message: 'Post deleted successfully' });
  } catch (err) {
    console.error('Delete post error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

app.get('/jobs', authenticateToken, (req, res) => {
  res.render('jobs', { user: req.user });
});

app.get('/achievements', authenticateToken, (req, res) => {
  res.render('achievements', { user: req.user });
});

// Profile routes
app.get('/profile', authenticateToken, async (req, res) => {
  try {
    // Fetch complete user profile data from database
    const [userProfile] = await pool.query(`
      SELECT 
        user_id,
        username,
        email,
        full_name,
        phone,
        location,
        job_title,
        company,
        graduation_year,
        field_of_study,
        about,
        linkedin_url,
        github_url,
        profile_picture_url,
        cover_photo_url,
        created_at,
        updated_at
      FROM users 
      WHERE user_id = ?
    `, [req.user.user_id]);

    if (userProfile.length === 0) {
      return res.status(404).send('User not found');
    }

    const user = userProfile[0];

    // Fetch user's recent activities/achievements (optional)
    const [activities] = await pool.query(`
          SELECT 
            'news_post' as type,
            CONCAT('Posted a new article: "', SUBSTRING(title, 1, 50), '"') as description,
            created_at,
            'Created a news post' as action
          FROM news_posts 
          WHERE user_id = ?
          
          UNION ALL
          
          SELECT 
            'comment' as type,
            'Commented on a news post' as description,
            created_at,
            'Added a comment' as action
          FROM news_comments 
          WHERE user_id = ?
          
          ORDER BY created_at DESC 
          LIMIT 10
        `, [req.user.user_id, req.user.user_id]);

    res.render('profile', {
      user: user,
      activities: activities || []
    });
  } catch (err) {
    console.error('Profile fetch error:', err);
    res.status(500).send('Server error');
  }
});

// API endpoint to update profile
app.post('/api/profile/update', authenticateToken, async (req, res) => {
  const {
    fullName,
    email,
    phone,
    location,
    jobTitle,
    company,
    graduationYear,
    fieldOfStudy,
    about,
    linkedin,
    github
  } = req.body;

  const userId = req.user.user_id;

  console.log('=== Profile Update Request ===');
  console.log('User ID:', userId);
  console.log('Update data:', req.body);

  try {
    // Validate required fields
    if (!fullName || !fullName.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Full name is required'
      });
    }

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Check if email is already taken by another user
    const [emailCheck] = await pool.query(
      'SELECT user_id FROM users WHERE email = ? AND user_id != ?',
      [email.trim(), userId]
    );

    if (emailCheck.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Email is already taken by another user'
      });
    }

    // Update user profile in database
    await pool.query(`
      UPDATE users SET 
        full_name = ?,
        email = ?,
        phone = ?,
        location = ?,
        job_title = ?,
        company = ?,
        graduation_year = ?,
        field_of_study = ?,
        about = ?,
        linkedin_url = ?,
        github_url = ?,
        updated_at = NOW()
      WHERE user_id = ?
    `, [
      fullName.trim(),
      email.trim(),
      phone?.trim() || null,
      location?.trim() || null,
      jobTitle?.trim() || null,
      company?.trim() || null,
      graduationYear || null,
      fieldOfStudy?.trim() || null,
      about?.trim() || null,
      linkedin?.trim() || null,
      github?.trim() || null,
      userId
    ]);

    // Fetch updated user data
    const [updatedUser] = await pool.query(`
      SELECT 
        user_id,
        username,
        email,
        full_name,
        phone,
        location,
        job_title,
        company,
        graduation_year,
        field_of_study,
        about,
        linkedin_url,
        github_url,
        profile_picture_url,
        cover_photo_url,
        updated_at
      FROM users 
      WHERE user_id = ?
    `, [userId]);

    console.log('Profile updated successfully for user:', userId);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser[0]
    });

  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + err.message
    });
  }
});

// Create new news post
app.post('/news/create', authenticateToken, upload.single('image'), async (req, res) => {
  const { title, content, category } = req.body;
  const userId = req.user.user_id;
  const imageFile = req.file;

  console.log('=== Create News Post Request ===');
  console.log('Title:', title);
  console.log('Content:', content);
  console.log('Category:', category);
  console.log('User ID:', userId);
  console.log('Image file:', imageFile);

  try {
    // Validate input
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Title is required' });
    }

    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Content is required' });
    }

    // Generate news ID
    const newsId = `NEWS/${Date.now()}`;
    const imageUrl = imageFile ? `/uploads/${imageFile.filename}` : null;

    // Insert new news post
    await pool.query(
      'INSERT INTO news_posts (news_id, user_id, title, content, image_url, category) VALUES (?, ?, ?, ?, ?, ?)',
      [newsId, userId, title.trim(), content.trim(), imageUrl, category || 'general']
    );

    // Fetch the new post with user info
    const [newPost] = await pool.query(`
      SELECT n.*, u.username, u.full_name
      FROM news_posts n
      LEFT JOIN users u ON n.user_id = u.user_id
      WHERE n.news_id = ?
    `, [newsId]);

    // Add empty comments array
    newPost[0].comments = [];

    console.log('News post created successfully:', newsId);
    res.json({ success: true, post: newPost[0] });
  } catch (err) {
    console.error('Create news post error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// Admin middleware to check if user is admin
const isAdmin = async (req, res, next) => {
  try {
    const [user] = await pool.query(
      'SELECT role FROM users WHERE user_id = ?',
      [req.user.user_id]
    );
    
    if (user.length === 0 || user[0].role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }
    
    next();
  } catch (err) {
    console.error('Admin check error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Admin Dashboard Route
app.get('/admin', authenticateToken, isAdmin, async (req, res) => {
  try {
    // Get platform statistics
    const [userStats] = await pool.query('SELECT COUNT(*) as totalUsers FROM users');
    const [postStats] = await pool.query('SELECT COUNT(*) as totalPosts FROM news_posts');
    const [commentStats] = await pool.query('SELECT COUNT(*) as totalComments FROM news_comments');
    
    let activityStats = [{ totalActivities: 0 }];
    try {
      const [activities] = await pool.query('SELECT COUNT(*) as totalActivities FROM user_activities');
      activityStats = activities;
    } catch (activityErr) {
      console.warn('user_activities table might not exist:', activityErr.message);
    }

    // Get recent users
    const [users] = await pool.query(`
      SELECT user_id, username, email, full_name, role, created_at 
      FROM users 
      ORDER BY created_at DESC 
      LIMIT 50
    `);

    // Get recent posts with author info
    const [posts] = await pool.query(`
      SELECT np.news_id, np.title, np.content, np.category, np.created_at, u.username
      FROM news_posts np
      JOIN users u ON np.user_id = u.user_id
      ORDER BY np.created_at DESC
      LIMIT 50
    `);

    // Get recent comments with post and author info
    const [comments] = await pool.query(`
      SELECT nc.comment_id, nc.content, nc.created_at, u.username, np.title as post_title
      FROM news_comments nc
      JOIN users u ON nc.user_id = u.user_id
      JOIN news_posts np ON nc.news_id = np.news_id
      ORDER BY nc.created_at DESC
      LIMIT 50
    `);

    const stats = {
      totalUsers: userStats[0].totalUsers,
      totalPosts: postStats[0].totalPosts,
      totalComments: commentStats[0].totalComments,
      totalActivities: activityStats[0].totalActivities
    };

    res.render('admin', {
      user: req.user,
      stats,
      users,
      posts,
      comments
    });

  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.status(500).send('Server error');
  }
});

// Admin API Routes

// Add new user (admin only)
app.post('/admin/users/add', authenticateToken, isAdmin, async (req, res) => {
  const { username, email, full_name, password } = req.body;
  
  try {
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username, email, and password are required'
      });
    }

    // Check if user already exists
    const [existingUser] = await pool.query(
      'SELECT * FROM users WHERE username = ? OR email = ?',
      [username, email]
    );

    if (existingUser.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'User with this username or email already exists'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert new user
    const [result] = await pool.query(
      'INSERT INTO users (username, email, full_name, password, role) VALUES (?, ?, ?, ?, ?)',
      [username, email, full_name || null, hashedPassword, 'user']
    );

    // Log activity (with error handling)
    try {
      await pool.query(
        'INSERT INTO user_activities (user_id, activity_type, description) VALUES (?, ?, ?)',
        [req.user.user_id, 'admin_action', `Added new user: ${username}`]
      );
    } catch (activityErr) {
      console.warn('Failed to log activity:', activityErr.message);
    }

    res.json({
      success: true,
      message: 'User added successfully',
      userId: result.insertId
    });

  } catch (err) {
    console.error('Add user error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + err.message
    });
  }
});

// Delete user (admin only)
app.delete('/admin/users/delete/:userId', authenticateToken, isAdmin, async (req, res) => {
  let { userId } = req.params;
  
  console.log('=== DELETE USER REQUEST ===');
  console.log('Original User ID:', userId);
  console.log('User:', req.user);
  console.log('User role:', req.user?.role);
  
  try {
    // Don't allow admin to delete themselves
    if (parseInt(userId) === req.user.user_id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account'
      });
    }

    // Get user info before deletion
    const [user] = await pool.query('SELECT username FROM users WHERE user_id = ?', [userId]);
    
    if (user.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Delete related data first to avoid foreign key issues
    await pool.query('DELETE FROM news_comments WHERE user_id = ?', [userId]);
    await pool.query('DELETE FROM news_posts WHERE user_id = ?', [userId]);
    
    // Try to delete from user_skills and user_activities if tables exist
    try {
      await pool.query('DELETE FROM user_skills WHERE user_id = ?', [userId]);
      await pool.query('DELETE FROM user_activities WHERE user_id = ?', [userId]);
    } catch (tableErr) {
      console.warn('Some user-related tables might not exist:', tableErr.message);
    }

    // Delete user
    await pool.query('DELETE FROM users WHERE user_id = ?', [userId]);

    // Log activity
    try {
      await pool.query(
        'INSERT INTO user_activities (user_id, activity_type, description) VALUES (?, ?, ?)',
        [req.user.user_id, 'admin_action', `Deleted user: ${user[0].username}`]
      );
    } catch (activityErr) {
      console.warn('Failed to log activity:', activityErr.message);
    }

    res.json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + err.message
    });
  }
});

// Test route to verify admin routes are working
app.get('/admin/test', (req, res) => {
  res.json({ message: 'Admin routes are working!', timestamp: new Date() });
});

// Delete post (admin only) - Fixed version
app.delete('/admin/posts/delete/:postId', authenticateToken, isAdmin, async (req, res) => {
  let { postId } = req.params;
  
  try {
    console.log('=== DELETE POST REQUEST ===');
    console.log('Original Post ID:', postId);
    console.log('User:', req.user);
    console.log('User role:', req.user?.role);
    
    // Handle complex post IDs like NEWS/1753807097051
    // Extract the numeric part if it's in NEWS/number format
    if (postId.includes('/')) {
      const parts = postId.split('/');
      postId = parts[parts.length - 1]; // Get the last part (the number)
      console.log('Extracted numeric ID:', postId);
    }
    
    // Get post info before deletion
    const [post] = await pool.query('SELECT title FROM news_posts WHERE news_id = ? OR news_id = ?', [postId, req.params.postId]);
    
    if (post.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Delete related comments first (to avoid foreign key issues)
    await pool.query('DELETE FROM news_comments WHERE news_id = ? OR news_id = ?', [postId, req.params.postId]);
    console.log('Deleted comments for post:', postId);

    // Delete post
    await pool.query('DELETE FROM news_posts WHERE news_id = ? OR news_id = ?', [postId, req.params.postId]);
    console.log('Deleted post:', postId);

    // Log activity
    try {
      await pool.query(
        'INSERT INTO user_activities (user_id, activity_type, description) VALUES (?, ?, ?)',
        [req.user.user_id, 'admin_action', `Deleted post: ${post[0].title}`]
      );
    } catch (activityErr) {
      console.warn('Failed to log activity:', activityErr.message);
    }

    res.json({
      success: true,
      message: 'Post deleted successfully'
    });

  } catch (err) {
    console.error('Delete post error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + err.message
    });
  }
});

// Delete comment (admin only)
app.delete('/admin/comments/delete/:commentId', authenticateToken, isAdmin, async (req, res) => {
  let { commentId } = req.params;
  
  console.log('=== DELETE COMMENT REQUEST ===');
  console.log('Original Comment ID:', commentId);
  console.log('User:', req.user);
  console.log('User role:', req.user?.role);
  
  try {
    // Check if comment exists
    const [comment] = await pool.query('SELECT * FROM news_comments WHERE comment_id = ?', [commentId]);
    
    if (comment.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
    }

    // Delete comment
    await pool.query('DELETE FROM news_comments WHERE comment_id = ?', [commentId]);

    // Log activity
    try {
      await pool.query(
        'INSERT INTO user_activities (user_id, activity_type, description) VALUES (?, ?, ?)',
        [req.user.user_id, 'admin_action', `Deleted comment ID: ${commentId}`]
      );
    } catch (activityErr) {
      console.warn('Failed to log activity:', activityErr.message);
    }

    res.json({
      success: true,
      message: 'Comment deleted successfully'
    });

  } catch (err) {
    console.error('Delete comment error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + err.message
    });
  }
});

// Skills management endpoints
app.post('/api/profile/skills/add', authenticateToken, async (req, res) => {
  const { skill } = req.body;
  const userId = req.user.user_id;

  console.log('=== Add Skill Request ===');
  console.log('User ID:', userId);
  console.log('Skill:', skill);

  try {
    if (!skill || !skill.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Skill name is required'
      });
    }

    const skillName = skill.trim();

    // Check if user already has this skill
    const [existingSkill] = await pool.query(
      'SELECT * FROM user_skills WHERE user_id = ? AND skill_name = ?',
      [userId, skillName]
    );

    if (existingSkill.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'You already have this skill'
      });
    }

    // Add the skill
    const [skillResult] = await pool.query(
      'INSERT INTO user_skills (user_id, skill_name) VALUES (?, ?)',
      [userId, skillName]
    );

    console.log('Skill insert result:', skillResult);

    // Log activity (with error handling)
    try {
      await pool.query(
        'INSERT INTO user_activities (user_id, activity_type, description) VALUES (?, ?, ?)',
        [userId, 'skill_added', `Added skill: ${skillName}`]
      );
    } catch (activityErr) {
      console.warn('Failed to log activity:', activityErr.message);
      // Don't fail the request if activity logging fails
    }

    console.log(`Skill '${skillName}' added successfully for user:`, userId);
    res.json({
      success: true,
      message: 'Skill added successfully'
    });

  } catch (err) {
    console.error('Add skill error details:', {
      message: err.message,
      code: err.code,
      errno: err.errno,
      sqlState: err.sqlState,
      sqlMessage: err.sqlMessage
    });
    
    res.status(500).json({
      success: false,
      message: 'Server error: ' + err.message
    });
  }
});

app.post('/api/profile/skills/remove', authenticateToken, async (req, res) => {
  const { skill } = req.body;
  const userId = req.user.user_id;

  try {
    if (!skill || !skill.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Skill name is required'
      });
    }

    const skillName = skill.trim();

    // Remove the skill
    const [result] = await pool.query(
      'DELETE FROM user_skills WHERE user_id = ? AND skill_name = ?',
      [userId, skillName]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Skill not found'
      });
    }

    // Log activity
    try {
      await pool.query(
        'INSERT INTO user_activities (user_id, activity_type, description) VALUES (?, ?, ?)',
        [userId, 'skill_removed', `Removed skill: ${skillName}`]
      );
    } catch (activityErr) {
      console.warn('Failed to log activity:', activityErr.message);
    }

    console.log(`Skill '${skillName}' removed for user:`, userId);
    res.json({
      success: true,
      message: 'Skill removed successfully'
    });

  } catch (err) {
    console.error('Remove skill error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + err.message
    });
  }
});

// Admin Routes

// Add new user (Admin only)
app.post('/admin/users/add', authenticateToken, isAdmin, async (req, res) => {
  const { username, email, password, full_name, role } = req.body;
  
  try {
    // Check if user already exists
    const [existingUser] = await pool.query(
      'SELECT * FROM users WHERE username = ? OR email = ?',
      [username, email]
    );
    
    if (existingUser.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'User with this username or email already exists'
      });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Insert user
    await pool.query(
      'INSERT INTO users (username, email, password, full_name, role) VALUES (?, ?, ?, ?, ?)',
      [username, email, hashedPassword, full_name, role || 'user']
    );
    
    // Log activity
    await pool.query(
      'INSERT INTO user_activities (user_id, activity_type, description) VALUES (?, ?, ?)',
      [req.user.user_id, 'admin_action', `Added new user: ${username}`]
    );
    
    res.json({ success: true, message: 'User added successfully' });
  } catch (err) {
    console.error('Add user error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// Delete user (Admin only)
app.delete('/admin/users/delete/:userId', authenticateToken, isAdmin, async (req, res) => {
  let { userId } = req.params;
  // Decode URL-encoded user ID
  userId = decodeURIComponent(userId);
  
  console.log('=== ADMIN DELETE USER REQUEST ===');
  console.log('Original User ID:', req.params.userId);
  console.log('Decoded User ID:', userId);
  console.log('Current User ID:', req.user.user_id);
  
  try {
    // Prevent admin from deleting themselves
    if (userId === req.user.user_id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account'
      });
    }
    
    // Get user info before deletion
    const [user] = await pool.query('SELECT username FROM users WHERE user_id = ?', [userId]);
    
    if (user.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Delete user (cascade will handle related records)
    await pool.query('DELETE FROM users WHERE user_id = ?', [userId]);
    
    // Log activity
    await pool.query(
      'INSERT INTO user_activities (user_id, activity_type, description) VALUES (?, ?, ?)',
      [req.user.user_id, 'admin_action', `Deleted user: ${user[0].username}`]
    );
    
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// Delete post (Admin only)
app.delete('/admin/posts/delete/:postId', authenticateToken, isAdmin, async (req, res) => {
  let { postId } = req.params;
  // Decode URL-encoded post ID
  postId = decodeURIComponent(postId);
  
  try {
    console.log('=== ADMIN DELETE POST REQUEST ===');
    console.log('Original Post ID:', postId);
    console.log('User:', req.user);
    console.log('User role:', req.user?.role);
    
    // Get post info before deletion
    const [post] = await pool.query('SELECT * FROM news_posts WHERE news_id = ?', [postId]);
    
    if (post.length === 0) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }
    
    // Delete associated comments first
    await pool.query('DELETE FROM news_comments WHERE news_id = ?', [postId]);
    console.log('Deleted comments for post:', postId);
    
    // Delete post
    await pool.query('DELETE FROM news_posts WHERE news_id = ?', [postId]);
    console.log('Deleted post:', postId);
    
    // Log activity
    try {
      await pool.query(
        'INSERT INTO user_activities (user_id, activity_type, description) VALUES (?, ?, ?)',
        [req.user.user_id, 'admin_action', `Deleted post: ${post[0].title}`]
      );
    } catch (activityErr) {
      console.warn('Failed to log activity:', activityErr.message);
    }
    
    res.json({ success: true, message: 'Post deleted successfully' });
  } catch (err) {
    console.error('Admin delete post error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// Delete comment (Admin only)
app.delete('/admin/comments/delete/:commentId', authenticateToken, isAdmin, async (req, res) => {
  let { commentId } = req.params;
  // Decode URL-encoded comment ID
  commentId = decodeURIComponent(commentId);
  
  console.log('=== ADMIN DELETE COMMENT REQUEST ===');
  console.log('Original Comment ID:', req.params.commentId);
  console.log('Decoded Comment ID:', commentId);
  console.log('User:', req.user);
  
  try {
    // Get comment info before deletion
    const [comment] = await pool.query('SELECT * FROM news_comments WHERE comment_id = ?', [commentId]);
    
    if (comment.length === 0) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }
    
    // Delete comment
    await pool.query('DELETE FROM news_comments WHERE comment_id = ?', [commentId]);
    
    // Log activity
    await pool.query(
      'INSERT INTO user_activities (user_id, activity_type, description) VALUES (?, ?, ?)',
      [req.user.user_id, 'admin_action', `Deleted comment: ${commentId}`]
    );
    
    res.json({ success: true, message: 'Comment deleted successfully' });
  } catch (err) {
    console.error('Delete comment error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// Admin test route
app.get('/admin/test', authenticateToken, isAdmin, (req, res) => {
  res.json({ success: true, message: 'Admin access confirmed', user: req.user });
});

server.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
  console.log('=== REGISTERED ROUTES ===');
  console.log('Admin routes registered:');
  console.log('- GET /admin/test');
  console.log('- GET /admin');
  console.log('- POST /admin/users/add');
  console.log('- DELETE /admin/users/delete/:userId');
  console.log('- DELETE /admin/posts/delete/:postId');
  console.log('- DELETE /admin/comments/delete/:commentId');
  console.log('========================');
});