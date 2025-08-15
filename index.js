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

// API route to get messages between two users
app.get('/api/messages/:receiverId', authenticateToken, async (req, res) => {
  try {
    const senderId = req.user.user_id;
    const { receiverId } = req.params;
    
    const [messages] = await pool.query(`
      SELECT m.*, 
             sender.username as sender_username,
             receiver.username as receiver_username
      FROM messages m
      JOIN users sender ON m.sender_id = sender.user_id
      JOIN users receiver ON m.receiver_id = receiver.user_id
      WHERE (m.sender_id = ? AND m.receiver_id = ?) 
         OR (m.sender_id = ? AND m.receiver_id = ?)
      ORDER BY m.timestamp ASC
    `, [senderId, receiverId, receiverId, senderId]);
    
    res.json({ success: true, messages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch messages' });
  }
});

// API route to send a message
app.post('/api/messages/send', authenticateToken, async (req, res) => {
  try {
    const senderId = req.user.user_id;
    const { receiverId, content } = req.body;
    
    if (!receiverId || !content) {
      return res.status(400).json({ success: false, error: 'Receiver ID and content are required' });
    }
    
    // Insert message with auto-increment message_id
    const [result] = await pool.query(`
      INSERT INTO messages (sender_id, receiver_id, content, timestamp, read_status)
      VALUES (?, ?, ?, NOW(), FALSE)
    `, [senderId, receiverId, content]);
    
    // Get the inserted message with user details
    const [newMessage] = await pool.query(`
      SELECT m.*, 
             sender.username as sender_username,
             receiver.username as receiver_username
      FROM messages m
      JOIN users sender ON m.sender_id = sender.user_id
      JOIN users receiver ON m.receiver_id = receiver.user_id
      WHERE m.message_id = ?
    `, [result.insertId]);
    
    // Emit the message to both users via Socket.IO
    const messageData = newMessage[0];
    io.to(`user_${senderId}`).emit('new_message', messageData);
    io.to(`user_${receiverId}`).emit('new_message', messageData);
    
    res.json({ success: true, message: messageData });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ success: false, error: 'Failed to send message' });
  }
});

// API route to mark messages as read
app.post('/api/messages/mark-read', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { senderId } = req.body;
    
    await pool.query(`
      UPDATE messages 
      SET read_status = TRUE 
      WHERE sender_id = ? AND receiver_id = ? AND read_status = FALSE
    `, [senderId, userId]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({ success: false, error: 'Failed to mark messages as read' });
  }
});

// Socket.IO connection handling
io.use(authorizeSocket);

io.on('connection', (socket) => {
  console.log(`User ${socket.user.username} connected with socket ID: ${socket.id}`);
  
  // Join user to their personal room
  socket.join(`user_${socket.user.user_id}`);
  
  // Handle sending messages via Socket.IO
  socket.on('send_message', async (data) => {
    try {
      const { receiverId, content } = data;
      const senderId = socket.user.user_id;
      
      if (!receiverId || !content) {
        socket.emit('error', { message: 'Receiver ID and content are required' });
        return;
      }
      
      // Insert message with auto-increment message_id
      const [result] = await pool.query(`
        INSERT INTO messages (sender_id, receiver_id, content, timestamp, read_status)
        VALUES (?, ?, ?, NOW(), FALSE)
      `, [senderId, receiverId, content]);
      
      // Get the inserted message with user details
      const [newMessage] = await pool.query(`
        SELECT m.*, 
               sender.username as sender_username,
               receiver.username as receiver_username
        FROM messages m
        JOIN users sender ON m.sender_id = sender.user_id
        JOIN users receiver ON m.receiver_id = receiver.user_id
        WHERE m.message_id = ?
      `, [result.insertId]);
      
      const messageData = newMessage[0];
      
      // Emit to both sender and receiver
      io.to(`user_${senderId}`).emit('new_message', messageData);
      io.to(`user_${receiverId}`).emit('new_message', messageData);
      
    } catch (error) {
      console.error('Socket message error:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });
  
  // Handle typing indicators
  socket.on('typing_start', (data) => {
    socket.to(`user_${data.receiverId}`).emit('user_typing', {
      userId: socket.user.user_id,
      username: socket.user.username
    });
  });
  
  socket.on('typing_stop', (data) => {
    socket.to(`user_${data.receiverId}`).emit('user_stopped_typing', {
      userId: socket.user.user_id
    });
  });
  
  // Handle user status updates
  socket.on('user_online', () => {
    socket.broadcast.emit('user_status_change', {
      userId: socket.user.user_id,
      username: socket.user.username,
      status: 'online'
    });
  });
  
  socket.on('disconnect', () => {
    console.log(`User ${socket.user.username} disconnected`);
    socket.broadcast.emit('user_status_change', {
      userId: socket.user.user_id,
      username: socket.user.username,
      status: 'offline'
    });
  });
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

// Jobs route moved to comprehensive implementation below

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
        bio,
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

    // Fetch user's skills
    let skills = [];
    try {
      const [userSkills] = await pool.query(`
        SELECT skill_name 
        FROM user_skills 
        WHERE user_id = ?
        ORDER BY created_at ASC
      `, [req.user.user_id]);
      skills = userSkills.map(skill => skill.skill_name);
    } catch (skillError) {
      console.log('Skills table may not exist yet:', skillError.message);
    }

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
      user: { ...user, skills: skills },
      activities: activities || []
    });
  } catch (err) {
    console.error('Profile fetch error:', err);
    res.status(500).send('Server error');
  }
});

// API endpoint to update profile (with file upload support)
app.post('/api/profile/update', authenticateToken, upload.single('profile_picture'), async (req, res) => {
  const {
    full_name,
    email,
    phone,
    location,
    job_title,
    company,
    graduation_year,
    field_of_study,
    bio,
    linkedin,
    github
  } = req.body;

  const userId = req.user.user_id;
  const profilePicture = req.file;

  console.log('=== Profile Update Request ===');
  console.log('User ID:', userId);
  console.log('Update data:', req.body);
  console.log('Profile picture:', profilePicture);

  try {
    // Validate required fields
    if (!full_name || !full_name.trim()) {
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

    // Handle profile picture upload
    let profilePictureUrl = null;
    if (profilePicture) {
      profilePictureUrl = `/uploads/${profilePicture.filename}`;
    }

    // Update user profile in database
    const updateQuery = `
      UPDATE users SET 
        full_name = ?,
        email = ?,
        phone = ?,
        location = ?,
        job_title = ?,
        company = ?,
        graduation_year = ?,
        field_of_study = ?,
        bio = ?,
        linkedin_url = ?,
        github_url = ?,
        ${profilePictureUrl ? 'profile_picture_url = ?,' : ''}
        updated_at = NOW()
      WHERE user_id = ?
    `;

    const updateParams = [
      full_name.trim(),
      email.trim(),
      phone?.trim() || null,
      location?.trim() || null,
      job_title?.trim() || null,
      company?.trim() || null,
      graduation_year || null,
      field_of_study?.trim() || null,
      bio?.trim() || null,
      linkedin?.trim() || null,
      github?.trim() || null
    ];

    if (profilePictureUrl) {
      updateParams.push(profilePictureUrl);
    }
    updateParams.push(userId);

    await pool.query(updateQuery, updateParams);

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

// ===== MENTORSHIP SYSTEM ROUTES =====

// Get mentorship statistics
app.get('/api/mentorship/stats', authenticateToken, async (req, res) => {
  try {
    // Get comprehensive mentorship statistics
    const [stats] = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM mentors WHERE is_active = TRUE) as total_mentors,
        (SELECT COUNT(*) FROM mentors WHERE is_active = TRUE AND availability_status = 'available') as active_mentors,
        (SELECT COUNT(*) FROM mentorship_requests) as total_requests,
        (SELECT COUNT(*) FROM mentorship_requests WHERE status = 'pending') as pending_requests,
        (SELECT COUNT(*) FROM mentorship_requests WHERE status = 'accepted') as accepted_requests,
        (SELECT COUNT(*) FROM active_mentorships WHERE status = 'active') as active_mentorships,
        (SELECT COUNT(*) FROM active_mentorships WHERE status = 'completed') as completed_mentorships
    `);
    
    res.json({ 
      success: true, 
      stats: stats[0] || {
        total_mentors: 0,
        active_mentors: 0,
        total_requests: 0,
        pending_requests: 0,
        accepted_requests: 0,
        active_mentorships: 0,
        completed_mentorships: 0
      }
    });
  } catch (err) {
    console.error('Get mentorship stats error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// (Consolidated below) Duplicate become-mentor route removed

// Save mentorship preferences
app.post('/api/mentorship/save-preferences', authenticateToken, async (req, res) => {
  const { preferred_skills, career_stage, preferred_mentor_experience, preferred_communication, preferred_meeting_frequency, specific_goals } = req.body;
  const userId = req.user.user_id;

  try {
    // Check if preferences already exist
    const [existing] = await pool.query('SELECT * FROM mentorship_matching_preferences WHERE user_id = ?', [userId]);
    
    if (existing.length > 0) {
      // Update existing preferences
      await pool.query(`
        UPDATE mentorship_matching_preferences 
        SET preferred_skills = ?, career_stage = ?, preferred_mentor_experience = ?, 
            preferred_communication = ?, preferred_meeting_frequency = ?, specific_goals = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `, [preferred_skills, career_stage, preferred_mentor_experience, preferred_communication, preferred_meeting_frequency, specific_goals, userId]);
    } else {
      // Insert new preferences
      await pool.query(`
        INSERT INTO mentorship_matching_preferences 
        (user_id, preferred_skills, career_stage, preferred_mentor_experience, preferred_communication, preferred_meeting_frequency, specific_goals)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [userId, preferred_skills, career_stage, preferred_mentor_experience, preferred_communication, preferred_meeting_frequency, specific_goals]);
    }

    res.json({ success: true, message: 'Preferences saved successfully!' });
  } catch (err) {
    console.error('Save preferences error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// Request mentorship
app.post('/api/mentorship/request', authenticateToken, async (req, res) => {
  const { mentor_id, request_message, goals, preferred_duration } = req.body;
  const menteeId = req.user.user_id;

  try {
    // Check if mentor exists and is available
    const [mentor] = await pool.query('SELECT * FROM mentors WHERE mentor_id = ? AND is_active = TRUE', [mentor_id]);
    
    if (mentor.length === 0) {
      return res.status(404).json({ success: false, message: 'Mentor not found or not available' });
    }

    // Check if user already has a pending or active request with this mentor
    const [existingRequest] = await pool.query(`
      SELECT * FROM mentorship_requests 
      WHERE mentee_id = ? AND mentor_id = ? AND status IN ('pending', 'accepted')
    `, [menteeId, mentor_id]);
    
    if (existingRequest.length > 0) {
      return res.status(400).json({ success: false, message: 'You already have a pending or active request with this mentor' });
    }

    // Check if mentor has capacity
    if (mentor[0].current_mentees >= mentor[0].max_mentees) {
      return res.status(400).json({ success: false, message: 'This mentor has reached their maximum capacity' });
    }

    // Insert mentorship request
    const [result] = await pool.query(`
      INSERT INTO mentorship_requests (mentee_id, mentor_id, request_message, goals, preferred_duration)
      VALUES (?, ?, ?, ?, ?)
    `, [menteeId, mentor_id, request_message, goals, preferred_duration]);

    // Log activity
    await pool.query(
      'INSERT INTO user_activities (user_id, activity_type, description) VALUES (?, ?, ?)',
      [menteeId, 'mentorship', `Requested mentorship from mentor ID: ${mentor_id}`]
    );

    res.json({ success: true, message: 'Mentorship request sent successfully!', request_id: result.insertId });
  } catch (err) {
    console.error('Request mentorship error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// Get user's mentorships (as mentor and mentee)
app.get('/api/mentorship/my-mentorships', authenticateToken, async (req, res) => {
  const userId = req.user.user_id;

  try {
    // Get mentorships where user is a mentor
    const [asMentor] = await pool.query(`
      SELECT 
        am.*,
        u.username as mentee_username,
        u.full_name as mentee_name,
        u.profile_picture_url as mentee_avatar,
        mr.request_message,
        mr.created_at as request_date
      FROM active_mentorships am
      JOIN mentors m ON am.mentor_id = m.mentor_id
      JOIN users u ON am.mentee_id = u.user_id
      LEFT JOIN mentorship_requests mr ON am.request_id = mr.request_id
      WHERE m.user_id = ?
      ORDER BY am.created_at DESC
    `, [userId]);

    // Get mentorships where user is a mentee
    const [asMentee] = await pool.query(`
      SELECT 
        am.*,
        u.username as mentor_username,
        u.full_name as mentor_name,
        u.profile_picture_url as mentor_avatar,
        m.bio as mentor_bio,
        mr.request_message,
        mr.created_at as request_date
      FROM active_mentorships am
      JOIN mentors m ON am.mentor_id = m.mentor_id
      JOIN users u ON m.user_id = u.user_id
      LEFT JOIN mentorship_requests mr ON am.request_id = mr.request_id
      WHERE am.mentee_id = ?
      ORDER BY am.created_at DESC
    `, [userId]);

    // Get pending requests (sent and received)
    const [sentRequests] = await pool.query(`
      SELECT 
        mr.*,
        u.username as mentor_username,
        u.full_name as mentor_name,
        m.bio as mentor_bio
      FROM mentorship_requests mr
      JOIN mentors m ON mr.mentor_id = m.mentor_id
      JOIN users u ON m.user_id = u.user_id
      WHERE mr.mentee_id = ? AND mr.status = 'pending'
      ORDER BY mr.created_at DESC
    `, [userId]);

    const [receivedRequests] = await pool.query(`
      SELECT 
        mr.*,
        u.username as mentee_username,
        u.full_name as mentee_name,
        u.profile_picture_url as mentee_avatar
      FROM mentorship_requests mr
      JOIN users u ON mr.mentee_id = u.user_id
      JOIN mentors m ON mr.mentor_id = m.mentor_id
      WHERE m.user_id = ? AND mr.status = 'pending'
      ORDER BY mr.created_at DESC
    `, [userId]);

    res.json({
      success: true,
      data: {
        asMentor,
        asMentee,
        sentRequests,
        receivedRequests
      }
    });
  } catch (err) {
    console.error('Get mentorships error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// Accept/Decline mentorship request (for mentors)
app.post('/api/mentorship/respond-request', authenticateToken, async (req, res) => {
  const { request_id, action } = req.body; // action: 'accept' or 'decline'
  const userId = req.user.user_id;

  try {
    // Verify the request belongs to this mentor
    const [request] = await pool.query(`
      SELECT mr.*, m.user_id as mentor_user_id, m.current_mentees, m.max_mentees
      FROM mentorship_requests mr
      JOIN mentors m ON mr.mentor_id = m.mentor_id
      WHERE mr.request_id = ? AND m.user_id = ? AND mr.status = 'pending'
    `, [request_id, userId]);

    if (request.length === 0) {
      return res.status(404).json({ success: false, message: 'Request not found or not authorized' });
    }

    const requestData = request[0];

    if (action === 'accept') {
      // Check mentor capacity
      if (requestData.current_mentees >= requestData.max_mentees) {
        return res.status(400).json({ success: false, message: 'You have reached your maximum mentee capacity' });
      }

      // Start transaction
      await pool.query('START TRANSACTION');

      try {
        // Update request status
        await pool.query('UPDATE mentorship_requests SET status = "accepted", updated_at = CURRENT_TIMESTAMP WHERE request_id = ?', [request_id]);

        // Create active mentorship
        const startDate = new Date().toISOString().split('T')[0];
        let expectedEndDate = null;
        
        if (requestData.preferred_duration !== 'ongoing') {
          const durationMonths = {
            '1_month': 1,
            '3_months': 3,
            '6_months': 6,
            '1_year': 12
          };
          
          const endDate = new Date();
          endDate.setMonth(endDate.getMonth() + durationMonths[requestData.preferred_duration]);
          expectedEndDate = endDate.toISOString().split('T')[0];
        }

        await pool.query(`
          INSERT INTO active_mentorships (mentor_id, mentee_id, request_id, start_date, expected_end_date, goals)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [requestData.mentor_id, requestData.mentee_id, request_id, startDate, expectedEndDate, requestData.goals]);

        // Update mentor's current mentee count
        await pool.query('UPDATE mentors SET current_mentees = current_mentees + 1 WHERE mentor_id = ?', [requestData.mentor_id]);

        // Log activities
        await pool.query(
          'INSERT INTO user_activities (user_id, activity_type, description) VALUES (?, ?, ?)',
          [userId, 'mentorship', `Accepted mentorship request from user ID: ${requestData.mentee_id}`]
        );
        
        await pool.query(
          'INSERT INTO user_activities (user_id, activity_type, description) VALUES (?, ?, ?)',
          [requestData.mentee_id, 'mentorship', `Mentorship request accepted by mentor ID: ${requestData.mentor_id}`]
        );

        await pool.query('COMMIT');
        res.json({ success: true, message: 'Mentorship request accepted successfully!' });
      } catch (error) {
        await pool.query('ROLLBACK');
        throw error;
      }
    } else if (action === 'decline') {
      // Update request status
      await pool.query('UPDATE mentorship_requests SET status = "declined", updated_at = CURRENT_TIMESTAMP WHERE request_id = ?', [request_id]);

      // Log activity
      await pool.query(
        'INSERT INTO user_activities (user_id, activity_type, description) VALUES (?, ?, ?)',
        [userId, 'mentorship', `Declined mentorship request from user ID: ${requestData.mentee_id}`]
      );

      res.json({ success: true, message: 'Mentorship request declined.' });
    } else {
      res.status(400).json({ success: false, message: 'Invalid action' });
    }
  } catch (err) {
    console.error('Respond to request error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// My Mentorships page (for mentees) - MUST come before parameterized routes
app.get('/mentorship/my-mentorships', authenticateToken, async (req, res) => {
  const userId = req.user.user_id;

  try {
    // Get user's mentorships as mentee
    const [asMentee] = await pool.query(`
      SELECT 
        am.*,
        u.username as mentor_username,
        u.full_name as mentor_name,
        u.profile_picture_url as mentor_avatar,
        u.job_title as mentor_job_title,
        u.company as mentor_company,
        m.bio as mentor_bio,
        m.expertise_areas,
        mr.request_message,
        mr.created_at as request_date
      FROM active_mentorships am
      JOIN mentors m ON am.mentor_id = m.mentor_id
      JOIN users u ON m.user_id = u.user_id
      LEFT JOIN mentorship_requests mr ON am.request_id = mr.request_id
      WHERE am.mentee_id = ?
      ORDER BY am.created_at DESC
    `, [userId]);

    // Get pending requests sent by user
    const [sentRequests] = await pool.query(`
      SELECT 
        mr.*,
        u.username as mentor_username,
        u.full_name as mentor_name,
        u.profile_picture_url as mentor_avatar,
        u.job_title as mentor_job_title,
        u.company as mentor_company,
        m.bio as mentor_bio
      FROM mentorship_requests mr
      JOIN mentors m ON mr.mentor_id = m.mentor_id
      JOIN users u ON m.user_id = u.user_id
      WHERE mr.mentee_id = ? AND mr.status = 'pending'
      ORDER BY mr.created_at DESC
    `, [userId]);

    // Get requests received as mentor (if user is a mentor)
    const [receivedRequests] = await pool.query(`
      SELECT 
        mr.*,
        u.username as mentee_username,
        u.full_name as mentee_name,
        u.profile_picture_url as mentee_picture,
        u.email as mentee_email,
        u.job_title as mentee_job_title,
        u.company as mentee_company
      FROM mentorship_requests mr
      JOIN users u ON mr.mentee_id = u.user_id
      JOIN mentors m ON mr.mentor_id = m.mentor_id
      WHERE m.user_id = ? AND mr.status IN ('pending', 'accepted', 'declined')
      ORDER BY mr.created_at DESC
    `, [userId]);

    // Get active mentorships where user is the mentor
    const [asMentor] = await pool.query(`
      SELECT 
        am.*,
        u.username as mentee_username,
        u.full_name as mentee_name,
        u.profile_picture_url as mentee_picture,
        u.email as mentee_email,
        u.job_title as mentee_job_title,
        u.company as mentee_company,
        mr.request_message,
        mr.goals,
        mr.preferred_duration
      FROM active_mentorships am
      JOIN users u ON am.mentee_id = u.user_id
      LEFT JOIN mentorship_requests mr ON am.request_id = mr.request_id
      JOIN mentors m ON am.mentor_id = m.mentor_id
      WHERE m.user_id = ?
      ORDER BY am.created_at DESC
    `, [userId]);

    // Get user's mentorship statistics
    const [stats] = await pool.query(`
      SELECT 
        COUNT(DISTINCT mr.request_id) as total_requests_sent,
        COUNT(DISTINCT CASE WHEN mr.status = 'pending' THEN mr.request_id END) as pending_requests,
        COUNT(DISTINCT CASE WHEN mr.status = 'accepted' THEN mr.request_id END) as accepted_requests,
        COUNT(DISTINCT am.mentorship_id) as active_mentorships,
        COUNT(DISTINCT CASE WHEN am.status = 'completed' THEN am.mentorship_id END) as completed_mentorships
      FROM mentorship_requests mr
      LEFT JOIN active_mentorships am ON mr.request_id = am.request_id
      WHERE mr.mentee_id = ?
    `, [userId]);

    res.render('my-mentorships', {
      user: req.user,
      asMentee,
      asMentor,
      sentRequests,
      receivedRequests,
      stats: stats[0] || {
        total_requests_sent: 0,
        pending_requests: 0,
        accepted_requests: 0,
        active_mentorships: 0,
        completed_mentorships: 0
      }
    });
  } catch (err) {
    console.error('My mentorships error:', err);
    res.status(500).send('Server error');
  }
});

// Mentor Dashboard - MUST come before parameterized routes to prevent redirect loops
app.get('/mentorship/dashboard', authenticateToken, async (req, res) => {
  const userId = req.user.user_id;

  try {
    // Check if user is a mentor
    const [mentorCheck] = await pool.query('SELECT * FROM mentors WHERE user_id = ? AND is_active = TRUE', [userId]);
    
    if (mentorCheck.length === 0) {
      return res.redirect('/mentorship?error=not_mentor');
    }

    const mentor = mentorCheck[0];

    // Get mentor's statistics
    const [stats] = await pool.query(`
      SELECT 
        COUNT(DISTINCT mr.request_id) as total_requests,
        COUNT(DISTINCT CASE WHEN mr.status = 'pending' THEN mr.request_id END) as pending_requests,
        COUNT(DISTINCT CASE WHEN mr.status = 'accepted' THEN mr.request_id END) as accepted_requests,
        COUNT(DISTINCT am.mentorship_id) as active_mentorships,
        COUNT(DISTINCT CASE WHEN am.status = 'completed' THEN am.mentorship_id END) as completed_mentorships,
        AVG(am.mentor_rating) as average_rating
      FROM mentors m
      LEFT JOIN mentorship_requests mr ON m.mentor_id = mr.mentor_id
      LEFT JOIN active_mentorships am ON m.mentor_id = am.mentor_id
      WHERE m.mentor_id = ?
    `, [mentor.mentor_id]);

    // Get pending requests
    const [pendingRequests] = await pool.query(`
      SELECT 
        mr.*,
        u.username,
        u.full_name,
        u.profile_picture_url,
        u.email,
        u.job_title,
        u.company
      FROM mentorship_requests mr
      JOIN users u ON mr.mentee_id = u.user_id
      WHERE mr.mentor_id = ? AND mr.status = 'pending'
      ORDER BY mr.created_at DESC
    `, [mentor.mentor_id]);

    // Get active mentorships
    const [activeMentorships] = await pool.query(`
      SELECT 
        am.*,
        u.username,
        u.full_name,
        u.profile_picture_url,
        u.email,
        u.job_title,
        u.company,
        mr.request_message
      FROM active_mentorships am
      JOIN users u ON am.mentee_id = u.user_id
      LEFT JOIN mentorship_requests mr ON am.request_id = mr.request_id
      WHERE am.mentor_id = ? AND am.status = 'active'
      ORDER BY am.created_at DESC
    `, [mentor.mentor_id]);

    // Get recent completed mentorships
    const [completedMentorships] = await pool.query(`
      SELECT 
        am.*,
        u.username,
        u.full_name,
        u.profile_picture_url
      FROM active_mentorships am
      JOIN users u ON am.mentee_id = u.user_id
      WHERE am.mentor_id = ? AND am.status = 'completed'
      ORDER BY am.actual_end_date DESC
      LIMIT 5
    `, [mentor.mentor_id]);

    res.render('mentor-dashboard', {
      user: req.user,
      mentor,
      stats: stats[0] || {
        total_requests: 0,
        pending_requests: 0,
        accepted_requests: 0,
        active_mentorships: 0,
        completed_mentorships: 0,
        average_rating: null
      },
      pendingRequests,
      activeMentorships,
      completedMentorships
    });
  } catch (err) {
    console.error('Mentor dashboard error:', err);
    res.status(500).send('Server error');
  }
});

// Mentor Profile - MUST come before parameterized routes to prevent conflicts
app.get('/mentorship/mentor/:mentorId', authenticateToken, async (req, res) => {
  const { mentorId } = req.params;

  try {
    const [mentor] = await pool.query(`
      SELECT 
        m.*,
        u.username,
        u.full_name,
        u.email,
        u.job_title,
        u.company,
        u.field_of_study,
        u.graduation_year,
        u.location,
        u.profile_picture_url,
        u.linkedin_url,
        u.github_url,
        u.about
      FROM mentors m
      JOIN users u ON m.user_id = u.user_id
      WHERE m.mentor_id = ? AND m.is_active = TRUE
    `, [mentorId]);

    if (mentor.length === 0) {
      return res.status(404).send('Mentor not found');
    }

    // Get mentor's completed mentorships count
    const [mentorshipStats] = await pool.query(`
      SELECT 
        COUNT(*) as total_mentorships,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_mentorships,
        AVG(mentee_rating) as average_rating
      FROM active_mentorships
      WHERE mentor_id = ?
    `, [mentorId]);

    res.render('mentor-profile', {
      user: req.user,
      mentor: mentor[0],
      stats: mentorshipStats[0] || { total_mentorships: 0, completed_mentorships: 0, average_rating: null }
    });
  } catch (err) {
    console.error('Mentor profile error:', err);
    res.status(500).send('Server error');
  }
});

// Main mentorship page and sub-pages
app.get('/mentorship/:section', authenticateToken, (req, res) => {
  // Redirect any nested mentorship sections to the main page
  return res.redirect('/mentorship');
});

// ===== MENTORSHIP API ROUTES =====

// Become a mentor
// (Consolidated below) Duplicate become-mentor route removed

// Save mentorship preferences
app.post('/api/mentorship/save-preferences', authenticateToken, async (req, res) => {
  const { skills, experience_level, communication_style, goals } = req.body;
  const userId = req.user.user_id;

  try {
    // Check if preferences already exist
    const [existing] = await pool.query(
      'SELECT * FROM mentorship_matching_preferences WHERE user_id = ?',
      [userId]
    );

    if (existing.length > 0) {
      // Update existing preferences
      await pool.query(`
        UPDATE mentorship_matching_preferences 
        SET preferred_skills = ?, experience_level = ?, communication_style = ?, goals = ?, updated_at = NOW()
        WHERE user_id = ?
      `, [skills, experience_level, communication_style, goals, userId]);
    } else {
      // Insert new preferences
      await pool.query(`
        INSERT INTO mentorship_matching_preferences 
        (user_id, preferred_skills, experience_level, communication_style, goals)
        VALUES (?, ?, ?, ?, ?)
      `, [userId, skills, experience_level, communication_style, goals]);
    }

    res.json({ success: true, message: 'Preferences saved successfully!' });
  } catch (err) {
    console.error('Save preferences error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// Request mentorship
app.post('/api/mentorship/request', authenticateToken, async (req, res) => {
  const { mentor_id, message, goals, duration } = req.body;
  const menteeId = req.user.user_id;

  try {
    // Check if mentor exists and is active
    const [mentor] = await pool.query(
      'SELECT * FROM mentors WHERE mentor_id = ? AND is_active = TRUE',
      [mentor_id]
    );

    if (mentor.length === 0) {
      return res.status(404).json({ success: false, message: 'Mentor not found or inactive' });
    }

    // Check if user already has a pending/active request with this mentor
    const [existingRequest] = await pool.query(`
      SELECT * FROM mentorship_requests 
      WHERE mentor_id = ? AND mentee_id = ? AND status IN ('pending', 'accepted')
    `, [mentor_id, menteeId]);

    if (existingRequest.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'You already have a pending or active request with this mentor'
      });
    }

    // Check mentor's capacity
    const [currentMentees] = await pool.query(
      'SELECT COUNT(*) as count FROM active_mentorships WHERE mentor_id = ? AND status = "active"',
      [mentor_id]
    );

    if (currentMentees[0].count >= mentor[0].max_mentees) {
      return res.status(400).json({
        success: false,
        message: 'This mentor has reached their maximum capacity'
      });
    }

    // Create mentorship request
    await pool.query(`
      INSERT INTO mentorship_requests 
      (mentor_id, mentee_id, request_message, goals, duration, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `, [mentor_id, menteeId, message, goals, duration]);

    // Log activity
    await pool.query(
      'INSERT INTO user_activities (user_id, activity_type, description) VALUES (?, ?, ?)',
      [menteeId, 'mentorship_request', `Requested mentorship from ${mentor[0].user_id}`]
    );

    res.json({ success: true, message: 'Mentorship request sent successfully!' });
  } catch (err) {
    console.error('Request mentorship error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// Get user's mentorships
app.get('/api/mentorship/my-mentorships', authenticateToken, async (req, res) => {
  const userId = req.user.user_id;

  try {
    // Get mentorships as mentee
    const [asMentee] = await pool.query(`
      SELECT 
        am.*,
        u.username as mentor_username,
        u.full_name as mentor_name,
        m.bio as mentor_bio
      FROM active_mentorships am
      JOIN mentors m ON am.mentor_id = m.mentor_id
      JOIN users u ON m.user_id = u.user_id
      WHERE am.mentee_id = ?
      ORDER BY am.created_at DESC
    `, [userId]);

    // Get mentorships as mentor
    const [asMentor] = await pool.query(`
      SELECT 
        am.*,
        u.username as mentee_username,
        u.full_name as mentee_name
      FROM active_mentorships am
      JOIN users u ON am.mentee_id = u.user_id
      JOIN mentors m ON am.mentor_id = m.mentor_id
      WHERE m.user_id = ?
      ORDER BY am.created_at DESC
    `, [userId]);

    res.json({ success: true, asMentee, asMentor });
  } catch (err) {
    console.error('Get mentorships error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// Respond to mentorship request
app.post('/api/mentorship/respond-request', authenticateToken, async (req, res) => {
  const { request_id, action } = req.body; // action: 'accept' or 'decline'
  const userId = req.user.user_id;

  try {
    // Get the request details
    const [request] = await pool.query(`
      SELECT mr.*, m.user_id as mentor_user_id
      FROM mentorship_requests mr
      JOIN mentors m ON mr.mentor_id = m.mentor_id
      WHERE mr.request_id = ? AND m.user_id = ?
    `, [request_id, userId]);

    if (request.length === 0) {
      return res.status(404).json({ success: false, message: 'Request not found or unauthorized' });
    }

    const requestData = request[0];

    if (action === 'accept') {
      // Update request status
      await pool.query(
        'UPDATE mentorship_requests SET status = "accepted", responded_at = NOW() WHERE request_id = ?',
        [request_id]
      );

      // Create active mentorship
      await pool.query(`
        INSERT INTO active_mentorships 
        (mentor_id, mentee_id, request_id, goals, duration, status, start_date)
        VALUES (?, ?, ?, ?, ?, 'active', NOW())
      `, [requestData.mentor_id, requestData.mentee_id, request_id, requestData.goals, requestData.duration]);

      // Log activity
      await pool.query(
        'INSERT INTO user_activities (user_id, activity_type, description) VALUES (?, ?, ?)',
        [userId, 'mentorship_accepted', `Accepted mentorship request from ${requestData.mentee_id}`]
      );

      res.json({ success: true, message: 'Mentorship request accepted!' });
    } else if (action === 'decline') {
      // Update request status
      await pool.query(
        'UPDATE mentorship_requests SET status = "declined", responded_at = NOW() WHERE request_id = ?',
        [request_id]
      );

      res.json({ success: true, message: 'Mentorship request declined.' });
    } else {
      res.status(400).json({ success: false, message: 'Invalid action' });
    }
  } catch (err) {
    console.error('Respond to request error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// Mentor profile route moved to before parameterized routes to prevent conflicts

// Mentor Dashboard route moved to before parameterized routes to prevent redirect loops

// Minimal jobs route test
app.get('/jobs-minimal', async (req, res) => {
  console.log('=== MINIMAL JOBS TEST ===');
  try {
    const testStats = {
      active_jobs: 2,
      companies: 2,
      total_applications: 5,
      new_jobs_this_week: 1
    };
    
    res.render('jobs', {
      user: null,
      jobs: [
        {
          job_id: 'TEST1',
          title: 'Test Job 1',
          company: 'Test Company',
          location: 'Remote',
          description: 'Test description',
          job_type: 'full-time',
          date_posted: new Date(),
          applications_count: 3,
          views_count: 25
        }
      ],
      categories: [{ category_name: 'Technology' }],
      stats: testStats
    });
  } catch (error) {
    console.error('Minimal test error:', error);
    res.status(500).send('Minimal test error: ' + error.message);
  }
});

// Debug route to test EJS rendering
app.get('/debug', async (req, res) => {
  console.log('=== DEBUG ROUTE ===');
  try {
    res.render('debug', {
      stats: { active_jobs: 5, companies: 3 },
      user: { username: 'testuser' },
      jobs: [{ title: 'Test Job' }]
    });
  } catch (error) {
    console.error('Debug route error:', error);
    res.status(500).send('Debug error: ' + error.message);
  }
});

// Simple test route without auth
app.get('/jobs-simple', async (req, res) => {
  console.log('=== SIMPLE JOBS TEST ===');
  try {
    res.json({
      message: 'Simple test working',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Simple test error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Test route for debugging
app.get('/jobs-test', authenticateToken, async (req, res) => {
  console.log('=== JOBS TEST ROUTE ===');
  const testStats = {
    active_jobs: 5,
    companies: 3,
    total_applications: 12,
    new_jobs_this_week: 2
  };
  console.log('Test stats:', testStats);
  
  try {
    res.render('jobs-test', {
      user: req.user,
      jobs: [{ title: 'Test Job', company: 'Test Company' }],
      categories: [{ category_name: 'Test Category' }],
      stats: testStats
    });
  } catch (error) {
    console.error('Test route error:', error);
    res.status(500).send('Test route error: ' + error.message);
  }
});

// Jobs Routes - Optional authentication
app.get('/jobs', (req, res, next) => {
  // Optional authentication - continue even if no token
  const token = req.headers['authorization']?.split(' ')[1];
  
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      console.log('User authenticated for jobs route:', decoded.username);
    } catch (error) {
      console.log('Invalid token for jobs route, continuing without auth:', error.message);
      req.user = null;
    }
  } else {
    console.log('No token provided for jobs route, continuing without auth');
    req.user = null;
  }
  next();
}, async (req, res) => {
  console.log('=== JOBS ROUTE ACCESSED ===');
  try {
    let jobs = [];
    let categories = [];
    let stats = {
      active_jobs: 0,
      companies: 0,
      total_applications: 0,
      new_jobs_this_week: 0
    };
    console.log('Initial stats:', stats);

    try {
      // Fetch jobs with enhanced data
      const [jobsResult] = await pool.query(`
        SELECT 
          jp.*,
          COUNT(DISTINCT ja.application_id) as applications_count,
          jp.views_count
        FROM job_postings jp
        LEFT JOIN job_applications ja ON jp.job_id = ja.job_id
        WHERE jp.status = 'active'
        GROUP BY jp.job_id
        ORDER BY jp.date_posted DESC
      `);
      jobs = jobsResult || [];
    } catch (jobError) {
      console.log('Jobs table may not exist yet:', jobError.message);
      // Create some sample jobs for display
      jobs = [
        {
          job_id: 'SAMPLE1',
          title: 'Software Engineer',
          company: 'Tech Solutions Inc.',
          location: 'Remote',
          description: 'We are looking for a talented software engineer to join our team.',
          job_type: 'full-time',
          salary_min: 70000,
          salary_max: 90000,
          date_posted: new Date(),
          applications_count: 15,
          views_count: 120
        },
        {
          job_id: 'SAMPLE2',
          title: 'Marketing Manager',
          company: 'Creative Agency',
          location: 'New York, NY',
          description: 'Lead our marketing initiatives and drive brand growth.',
          job_type: 'full-time',
          salary_min: 60000,
          salary_max: 80000,
          date_posted: new Date(),
          applications_count: 8,
          views_count: 85
        }
      ];
    }

    try {
      // Fetch job categories
      const [categoriesResult] = await pool.query(`
        SELECT category_id, category_name 
        FROM job_categories 
        ORDER BY category_name
      `);
      categories = categoriesResult || [];
    } catch (categoryError) {
      console.log('Job categories table may not exist yet:', categoryError.message);
    }

    try {
      // Calculate stats
      const [statsResult] = await pool.query(`
        SELECT 
          COUNT(DISTINCT jp.job_id) as active_jobs,
          COUNT(DISTINCT jp.company) as companies,
          COUNT(DISTINCT ja.application_id) as total_applications,
          COUNT(DISTINCT CASE WHEN jp.date_posted >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN jp.job_id END) as new_jobs_this_week
        FROM job_postings jp
        LEFT JOIN job_applications ja ON jp.job_id = ja.job_id
        WHERE jp.status = 'active'
      `);
      stats = statsResult[0] || stats;
    } catch (statsError) {
      console.log('Stats calculation failed, using defaults:', statsError.message);
      // Use sample data for stats
      stats = {
        active_jobs: jobs.length,
        companies: new Set(jobs.map(job => job.company)).size,
        total_applications: jobs.reduce((sum, job) => sum + (job.applications_count || 0), 0),
        new_jobs_this_week: jobs.filter(job => {
          const weekAgo = new Date();
          weekAgo.setDate(weekAgo.getDate() - 7);
          return new Date(job.date_posted) > weekAgo;
        }).length
      };
    }

    console.log('Final data being passed to template:');
    console.log('- jobs count:', jobs.length);
    console.log('- categories count:', categories.length);
    console.log('- stats:', stats);
    console.log('- user:', req.user ? req.user.username : 'no user (no auth)');
    
    res.render('jobs', {
      user: req.user || null,
      jobs: jobs || [],
      categories: categories || [],
      stats
    });
  } catch (error) {
    console.error('Jobs page error:', error);
    console.log('=== USING FALLBACK DATA ===');
    const fallbackStats = {
      active_jobs: 0,
      companies: 0,
      total_applications: 0,
      new_jobs_this_week: 0
    };
    console.log('Fallback stats:', fallbackStats);
    // Render with fallback data
    res.render('jobs', {
      user: req.user || null,
      jobs: [],
      categories: [],
      stats: fallbackStats
    });
  }
});

// API: Get jobs (for AJAX requests)
app.get('/api/jobs', authenticateToken, async (req, res) => {
  try {
    const [jobs] = await pool.query(`
      SELECT 
        jp.*,
        COUNT(DISTINCT ja.application_id) as applications_count,
        jp.views_count,
        GROUP_CONCAT(DISTINCT jcm.category_id) as categories
      FROM job_postings jp
      LEFT JOIN job_applications ja ON jp.job_id = ja.job_id
      LEFT JOIN job_category_mapping jcm ON jp.job_id = jcm.job_id
      WHERE jp.status = 'active'
      GROUP BY jp.job_id
      ORDER BY jp.date_posted DESC
    `);

    // Process categories for each job
    const processedJobs = jobs.map(job => ({
      ...job,
      categories: job.categories ? job.categories.split(',').map(id => parseInt(id)) : []
    }));

    res.json(processedJobs);
  } catch (error) {
    console.error('API jobs fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch jobs' });
  }
});

// API: Post a new job
app.post('/api/jobs', authenticateToken, async (req, res) => {
  const {
    title,
    company,
    location,
    job_type,
    experience_level,
    remote_type,
    salary_min,
    salary_max,
    description,
    requirements,
    benefits,
    application_deadline
  } = req.body;

  const userId = req.user.user_id;

  try {
    // Generate job ID
    const jobId = `JOB/${Date.now()}`;

    // Insert job posting
    await pool.query(`
      INSERT INTO job_postings (
        job_id, posted_by, title, company, location, description, requirements, benefits,
        job_type, experience_level, remote_type, salary_min, salary_max, salary_currency,
        application_deadline, status, date_posted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'USD', ?, 'active', NOW())
    `, [
      jobId, userId, title, company, location, description, requirements || null, benefits || null,
      job_type, experience_level || 'mid', remote_type || 'on-site',
      salary_min || null, salary_max || null, application_deadline || null
    ]);

    // Fetch the created job
    const [newJob] = await pool.query(`
      SELECT * FROM job_postings WHERE job_id = ?
    `, [jobId]);

    res.status(201).json(newJob[0]);
  } catch (error) {
    console.error('Job posting error:', error);
    res.status(500).json({ message: 'Failed to post job' });
  }
});

// API: Apply for a job
app.post('/api/jobs/:jobId/apply', authenticateToken, async (req, res) => {
  const { jobId } = req.params;
  const userId = req.user.user_id;

  try {
    // Check if user already applied
    const [existingApplication] = await pool.query(`
      SELECT application_id FROM job_applications 
      WHERE job_id = ? AND applicant_id = ?
    `, [jobId, userId]);

    if (existingApplication.length > 0) {
      return res.status(400).json({ message: 'You have already applied for this job' });
    }

    // Check if job exists and is active
    const [job] = await pool.query(`
      SELECT job_id FROM job_postings 
      WHERE job_id = ? AND status = 'active'
    `, [jobId]);

    if (job.length === 0) {
      return res.status(404).json({ message: 'Job not found or no longer active' });
    }

    // Create application
    const applicationId = `APP/${Date.now()}`;
    await pool.query(`
      INSERT INTO job_applications (
        application_id, job_id, applicant_id, status, applied_at
      ) VALUES (?, ?, ?, 'pending', NOW())
    `, [applicationId, jobId, userId]);

    res.json({ success: true, message: 'Application submitted successfully' });
  } catch (error) {
    console.error('Job application error:', error);
    res.status(500).json({ message: 'Failed to submit application' });
  }
});

// API: Toggle job bookmark
app.post('/api/jobs/:jobId/bookmark', authenticateToken, async (req, res) => {
  const { jobId } = req.params;
  const userId = req.user.user_id;

  try {
    // Check if already bookmarked
    const [existingBookmark] = await pool.query(`
      SELECT bookmark_id FROM job_bookmarks 
      WHERE job_id = ? AND user_id = ?
    `, [jobId, userId]);

    if (existingBookmark.length > 0) {
      // Remove bookmark
      await pool.query(`
        DELETE FROM job_bookmarks 
        WHERE job_id = ? AND user_id = ?
      `, [jobId, userId]);
      
      res.json({ bookmarked: false });
    } else {
      // Add bookmark
      const bookmarkId = `BM/${Date.now()}`;
      await pool.query(`
        INSERT INTO job_bookmarks (bookmark_id, job_id, user_id, bookmarked_at)
        VALUES (?, ?, ?, NOW())
      `, [bookmarkId, jobId, userId]);
      
      res.json({ bookmarked: true });
    }
  } catch (error) {
    console.error('Job bookmark error:', error);
    res.status(500).json({ message: 'Failed to update bookmark' });
  }
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
  console.log('Jobs routes registered:');
  console.log('- GET /jobs');
  console.log('- GET /api/jobs');
  console.log('- POST /api/jobs');
  console.log('- POST /api/jobs/:jobId/apply');
  console.log('- POST /api/jobs/:jobId/bookmark');
  console.log('========================');

// ===== MENTORSHIP SYSTEM ROUTES =====

// Main mentorship page
app.get('/mentorship', authenticateToken, async (req, res) => {
  try {
    // Get mentorship statistics
    const [stats] = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM mentors WHERE is_active = TRUE) as total_mentors,
        (SELECT COUNT(*) FROM mentors WHERE is_active = TRUE AND availability_status = 'available') as active_mentors,
        (SELECT COUNT(*) FROM mentorship_requests) as total_requests,
        (SELECT COUNT(*) FROM mentorship_requests WHERE status = 'pending') as pending_requests,
        (SELECT COUNT(*) FROM mentorship_requests WHERE status = 'accepted') as accepted_requests,
        (SELECT COUNT(*) FROM active_mentorships WHERE status = 'active') as active_mentorships,
        (SELECT COUNT(*) FROM active_mentorships WHERE status = 'completed') as completed_mentorships
    `);

    // Get all active mentors with their details (exclude current user)
    const [mentors] = await pool.query(`
      SELECT 
        m.*,
        u.username,
        u.full_name,
        u.email,
        u.profile_picture_url,
        u.linkedin_url,
        u.github_url
      FROM mentors m
      JOIN users u ON m.user_id = u.user_id
      WHERE m.is_active = TRUE AND m.user_id != ?
      ORDER BY m.created_at DESC
    `, [req.user.user_id]);

    // Get all expertise areas for filtering
    const [expertiseData] = await pool.query('SELECT DISTINCT area_name FROM expertise_areas ORDER BY area_name');
    const allExpertise = new Set();
    
    // Add expertise from mentors
    mentors.forEach(mentor => {
      if (mentor.expertise_areas) {
        try {
          const areas = JSON.parse(mentor.expertise_areas);
          areas.forEach(area => allExpertise.add(area));
        } catch (e) {
          // Handle non-JSON expertise_areas
          if (typeof mentor.expertise_areas === 'string') {
            mentor.expertise_areas.split(',').forEach(area => allExpertise.add(area.trim()));
          }
        }
      }
    });
    
    // Add expertise from database
    expertiseData.forEach(row => allExpertise.add(row.area_name));

    // If no expertise areas found, provide default list
    if (allExpertise.size === 0) {
      console.log('No expertise areas found in database, using default list');
      const defaultExpertise = [
        'Web Development',
        'Mobile Development', 
        'Data Science',
        'Machine Learning',
        'Artificial Intelligence',
        'Cybersecurity',
        'Cloud Computing',
        'DevOps',
        'Database Management',
        'UI/UX Design',
        'Product Management',
        'Digital Marketing',
        'Business Analytics',
        'Software Testing',
        'Network Administration',
        'Game Development',
        'Blockchain',
        'IoT Development',
        'Computer Vision',
        'Natural Language Processing'
      ];
      defaultExpertise.forEach(area => allExpertise.add(area));
    }

    console.log('Final expertise areas:', Array.from(allExpertise));

    // Check if current user is a mentor using user_id (direct and reliable)
    const [userMentorCheck] = await pool.query(
      'SELECT mentor_id FROM mentors WHERE user_id = ? AND is_active = TRUE',
      [req.user.user_id]
    );

    const finalExpertiseAreas = Array.from(allExpertise).sort().map(area => ({ area_name: area }));
    console.log('Final expertise areas being passed to template:', finalExpertiseAreas);

    res.render('mentorship', {
      user: req.user,
      stats: stats[0] || {
        total_mentors: 0,
        active_mentors: 0,
        total_requests: 0,
        accepted_requests: 0,
        active_mentorships: 0,
        completed_mentorships: 0
      },
      mentors,
      expertiseAreas: finalExpertiseAreas,
      isMentor: userMentorCheck.length > 0
    });
  } catch (err) {
    console.error('Mentorship page error:', err);
    res.status(500).send('Server error');
  }
});

// Duplicate my-mentorships route removed - already exists above

// Duplicate mentor profile route removed - already exists above

// ===== MENTORSHIP API ROUTES =====

// Become a mentor
// Consolidated become-mentor route
app.post('/api/mentorship/become-mentor', authenticateToken, async (req, res) => {
  try {
    // Normalize incoming fields from various clients
    const bio = req.body.bio || '';
    const rawExpertise = req.body.expertise_areas || [];
    const yearsOfExperience = parseInt(
      req.body.years_of_experience ?? req.body.experience_level ?? 0
    ) || 0;
    const maxMentees = parseInt(req.body.max_mentees ?? 3) || 3;
    const preferredCommunication = req.body.preferred_communication ?? req.body.communication_preferences ?? 'chat';
    const availabilityStatus = req.body.availability ?? 'available';
    const mentoringStyle = req.body.mentoring_style ?? null;

    // Ensure expertise_areas is stored as JSON string
    const expertiseAreas = Array.isArray(rawExpertise)
      ? JSON.stringify(rawExpertise)
      : (typeof rawExpertise === 'string' ? rawExpertise : JSON.stringify([]));

    // Prevent duplicate active mentor; allow re-activating/updating inactive records
    const [existingActive] = await pool.query(`
      SELECT m.mentor_id 
      FROM mentors m
      JOIN users u ON m.user_id = u.user_id
      WHERE u.username = ? AND m.is_active = TRUE AND m.user_id != 0
    `, [req.user.username]);
    if (existingActive.length > 0) {
      return res.status(400).json({ success: false, message: 'You are already registered as a mentor' });
    }

    // Resolve actual user_id
    const [userCheck] = await pool.query('SELECT user_id FROM users WHERE username = ?', [req.user.username]);
    if (userCheck.length === 0) {
      return res.status(400).json({ success: false, message: 'User not found' });
    }
    const actualUserId = userCheck[0].user_id;

    // If an inactive mentor record exists, update it; else insert
    const [existingAny] = await pool.query(
      'SELECT mentor_id, is_active FROM mentors WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      [actualUserId]
    );

    if (existingAny.length > 0) {
      const mentorId = existingAny[0].mentor_id;
      await pool.query(`
        UPDATE mentors
        SET bio = ?, expertise_areas = ?, years_of_experience = ?, max_mentees = ?,
            availability_status = ?, preferred_communication = ?, mentoring_style = ?, is_active = TRUE,
            updated_at = CURRENT_TIMESTAMP
        WHERE mentor_id = ?
      `, [
        bio,
        expertiseAreas,
        yearsOfExperience,
        maxMentees,
        availabilityStatus,
        preferredCommunication,
        mentoringStyle,
        mentorId
      ]);

      await pool.query(
        'INSERT INTO user_activities (user_id, activity_type, description) VALUES (?, ?, ?)',
        [actualUserId, 'mentorship', 'Re-activated mentor profile']
      );

      return res.json({ success: true, message: 'Mentor profile updated and activated!', mentor_id: mentorId });
    } else {
      const [result] = await pool.query(`
        INSERT INTO mentors (
          user_id, bio, expertise_areas, years_of_experience, max_mentees,
          availability_status, preferred_communication, mentoring_style, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)
      `, [
        actualUserId,
        bio,
        expertiseAreas,
        yearsOfExperience,
        maxMentees,
        availabilityStatus,
        preferredCommunication,
        mentoringStyle
      ]);

      await pool.query(
        'INSERT INTO user_activities (user_id, activity_type, description) VALUES (?, ?, ?)',
        [actualUserId, 'mentorship', 'Registered as a mentor']
      );

      return res.json({ success: true, message: 'Successfully registered as a mentor!', mentor_id: result.insertId });
    }
  } catch (err) {
    console.error('Become mentor error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// Get real-time mentorship statistics
app.get('/api/mentorship/stats', authenticateToken, async (req, res) => {
  try {
    const [stats] = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM mentors WHERE is_active = TRUE) as total_mentors,
        (SELECT COUNT(*) FROM mentors WHERE is_active = TRUE AND availability_status = 'available') as active_mentors,
        (SELECT COUNT(*) FROM mentorship_requests) as total_requests,
        (SELECT COUNT(*) FROM mentorship_requests WHERE status = 'pending') as pending_requests,
        (SELECT COUNT(*) FROM mentorship_requests WHERE status = 'accepted') as accepted_requests,
        (SELECT COUNT(*) FROM active_mentorships WHERE status = 'active') as active_mentorships,
        (SELECT COUNT(*) FROM active_mentorships WHERE status = 'completed') as completed_mentorships
    `);
    
    res.json({ success: true, stats: stats[0] || {} });
  } catch (err) {
    console.error('Get stats error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// Save mentorship preferences
app.post('/api/mentorship/save-preferences', authenticateToken, async (req, res) => {
  const { skills, experience_level, communication_style, goals } = req.body;
  const userId = req.user.user_id;

  try {
    // Insert or update preferences
    await pool.query(`
      INSERT INTO mentorship_matching_preferences (
        user_id, preferred_skills, experience_level, communication_style, mentorship_goals
      ) VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        preferred_skills = VALUES(preferred_skills),
        experience_level = VALUES(experience_level),
        communication_style = VALUES(communication_style),
        mentorship_goals = VALUES(mentorship_goals),
        updated_at = NOW()
    `, [userId, JSON.stringify(skills), experience_level, communication_style, goals]);

    res.json({ success: true, message: 'Preferences saved successfully!' });
  } catch (err) {
    console.error('Save preferences error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// Request mentorship
app.post('/api/mentorship/request', authenticateToken, async (req, res) => {
  const { mentor_id, message, goals, duration } = req.body;
  const menteeId = req.user.user_id;

  try {
    // Check if user already has a pending/accepted request with this mentor
    const [existing] = await pool.query(`
      SELECT request_id FROM mentorship_requests 
      WHERE mentee_id = ? AND mentor_id = ? AND status IN ('pending', 'accepted')
    `, [menteeId, mentor_id]);

    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'You already have a pending or active request with this mentor' });
    }

    // Check mentor capacity
    const [mentor] = await pool.query(`
      SELECT current_mentees, max_mentees FROM mentors WHERE mentor_id = ? AND is_active = TRUE
    `, [mentor_id]);

    if (mentor.length === 0) {
      return res.status(404).json({ success: false, message: 'Mentor not found' });
    }

    if (mentor[0].current_mentees >= mentor[0].max_mentees) {
      return res.status(400).json({ success: false, message: 'This mentor has reached their maximum capacity' });
    }

    // Insert mentorship request
    const [result] = await pool.query(`
      INSERT INTO mentorship_requests (
        mentee_id, mentor_id, request_message, goals, preferred_duration, status
      ) VALUES (?, ?, ?, ?, ?, 'pending')
    `, [menteeId, mentor_id, message, goals, duration]);

    // Log activity
    await pool.query(`
      INSERT INTO user_activities (user_id, activity_type, activity_description, created_at)
      VALUES (?, 'mentorship', 'Sent mentorship request', NOW())
    `, [menteeId]);

    res.json({ success: true, message: 'Mentorship request sent successfully!', request_id: result.insertId });
  } catch (err) {
    console.error('Request mentorship error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// Accept/Decline mentorship request (for mentors)
app.post('/api/mentorship/respond-request', authenticateToken, async (req, res) => {
  const { request_id, action } = req.body; // action: 'accept' or 'decline'
  const userId = req.user.user_id;

  try {
    // Verify the request belongs to this mentor
    const [request] = await pool.query(`
      SELECT mr.*, m.user_id as mentor_user_id, m.current_mentees, m.max_mentees
      FROM mentorship_requests mr
      JOIN mentors m ON mr.mentor_id = m.mentor_id
      WHERE mr.request_id = ? AND m.user_id = ? AND mr.status = 'pending'
    `, [request_id, userId]);

    if (request.length === 0) {
      return res.status(404).json({ success: false, message: 'Request not found or not authorized' });
    }

    const requestData = request[0];

    if (action === 'accept') {
      // Check mentor capacity
      if (requestData.current_mentees >= requestData.max_mentees) {
        return res.status(400).json({ success: false, message: 'You have reached your maximum mentee capacity' });
      }

      // Start transaction
      await pool.query('START TRANSACTION');

      try {
        // Update request status
        await pool.query('UPDATE mentorship_requests SET status = "accepted", updated_at = CURRENT_TIMESTAMP WHERE request_id = ?', [request_id]);

        // Create active mentorship
        const startDate = new Date().toISOString().split('T')[0];
        let expectedEndDate = null;
        
        if (requestData.preferred_duration !== 'ongoing') {
          const durationMonths = {
            '1_month': 1,
            '3_months': 3,
            '6_months': 6,
            '1_year': 12
          };
          
          const months = durationMonths[requestData.preferred_duration] || 3;
          const endDate = new Date();
          endDate.setMonth(endDate.getMonth() + months);
          expectedEndDate = endDate.toISOString().split('T')[0];
        }

        // Update mentor's current mentee count
        await pool.query('UPDATE mentors SET current_mentees = current_mentees + 1 WHERE mentor_id = ?', [requestData.mentor_id]);

        // Create active mentorship
        await pool.query(`
          INSERT INTO active_mentorships (mentor_id, mentee_id, request_id, start_date, expected_end_date, goals)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [requestData.mentor_id, requestData.mentee_id, request_id, startDate, expectedEndDate, requestData.goals]);

        // Log activities
        await pool.query(
          'INSERT INTO user_activities (user_id, activity_type, description) VALUES (?, ?, ?)',
          [userId, 'mentorship', `Accepted mentorship request from user ID: ${requestData.mentee_id}`]
        );
        
        await pool.query(
          'INSERT INTO user_activities (user_id, activity_type, description) VALUES (?, ?, ?)',
          [requestData.mentee_id, 'mentorship', `Mentorship request accepted by mentor ID: ${requestData.mentor_id}`]
        );

        await pool.query('COMMIT');
        res.json({ success: true, message: 'Mentorship request accepted successfully!' });

      } catch (err) {
        await pool.query('ROLLBACK');
        throw err;
      }

    } else if (action === 'decline') {
      // Update request status
      await pool.query('UPDATE mentorship_requests SET status = "declined", updated_at = CURRENT_TIMESTAMP WHERE request_id = ?', [request_id]);

      // Log activity
      await pool.query(
        'INSERT INTO user_activities (user_id, activity_type, description) VALUES (?, ?, ?)',
        [userId, 'mentorship', `Declined mentorship request from user ID: ${requestData.mentee_id}`]
      );

      res.json({ success: true, message: 'Mentorship request declined successfully!' });
    } else {
      res.status(400).json({ success: false, message: 'Invalid action. Use "accept" or "decline"' });
    }

  } catch (err) {
    console.error('Respond to request error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// Withdraw mentorship request (for mentees)
app.post('/api/mentorship/withdraw-request', authenticateToken, async (req, res) => {
  const { request_id } = req.body;
  const userId = req.user.user_id;

  try {
    // Verify the request belongs to this user
    const [request] = await pool.query(`
      SELECT * FROM mentorship_requests 
      WHERE request_id = ? AND mentee_id = ? AND status = 'pending'
    `, [request_id, userId]);

    if (request.length === 0) {
      return res.status(404).json({ success: false, message: 'Request not found or not authorized' });
    }

    // Update request status
    await pool.query('UPDATE mentorship_requests SET status = "withdrawn", updated_at = CURRENT_TIMESTAMP WHERE request_id = ?', [request_id]);

    // Log activity
    await pool.query(
      'INSERT INTO user_activities (user_id, activity_type, description) VALUES (?, ?, ?)',
      [userId, 'mentorship', 'Withdrew mentorship request']
    );

    res.json({ success: true, message: 'Mentorship request withdrawn successfully!' });
  } catch (err) {
    console.error('Withdraw request error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// Get user's mentorships (API endpoint)
app.get('/api/mentorship/my-mentorships', authenticateToken, async (req, res) => {
  const userId = req.user.user_id;
  
  try {
    // Get mentorships as mentee
    const [asMentee] = await pool.query(`
      SELECT 
        am.*,
        m.bio as mentor_bio,
        u.username as mentor_username,
        u.full_name as mentor_name
      FROM active_mentorships am
      JOIN mentors m ON am.mentor_id = m.mentor_id
      JOIN users u ON m.user_id = u.user_id
      WHERE am.mentee_id = ?
    `, [userId]);

    // Get mentorships as mentor
    const [asMentor] = await pool.query(`
      SELECT 
        am.*,
        u.username as mentee_username,
        u.full_name as mentee_name
      FROM active_mentorships am
      JOIN users u ON am.mentee_id = u.user_id
      JOIN mentors m ON am.mentor_id = m.mentor_id
      WHERE m.user_id = ?
    `, [userId]);

    // Get sent requests
    const [sentRequests] = await pool.query(`
      SELECT 
        mr.*,
        u.username as mentor_username,
        u.full_name as mentor_name
      FROM mentorship_requests mr
      JOIN mentors m ON mr.mentor_id = m.mentor_id
      JOIN users u ON m.user_id = u.user_id
      WHERE mr.mentee_id = ?
    `, [userId]);

    // Get received requests
    const [receivedRequests] = await pool.query(`
      SELECT 
        mr.*,
        u.username as mentee_username,
        u.full_name as mentee_name
      FROM mentorship_requests mr
      JOIN users u ON mr.mentee_id = u.user_id
      JOIN mentors m ON mr.mentor_id = m.mentor_id
      WHERE m.user_id = ?
    `, [userId]);

    res.json({
      success: true,
      data: {
        asMentor,
        asMentee,
        sentRequests,
        receivedRequests
      }
    });
  } catch (err) {
    console.error('Get mentorships error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// Accept/Decline mentorship request (for mentors)
app.post('/api/mentorship/respond-request', authenticateToken, async (req, res) => {
  const { request_id, action } = req.body; // action: 'accept' or 'decline'
  const userId = req.user.user_id;

  try {
    // Verify the request belongs to this mentor
    const [request] = await pool.query(`
      SELECT mr.*, m.user_id as mentor_user_id, m.current_mentees, m.max_mentees
      FROM mentorship_requests mr
      JOIN mentors m ON mr.mentor_id = m.mentor_id
      WHERE mr.request_id = ? AND m.user_id = ? AND mr.status = 'pending'
    `, [request_id, userId]);

    if (request.length === 0) {
      return res.status(404).json({ success: false, message: 'Request not found or not authorized' });
    }

    const requestData = request[0];

    if (action === 'accept') {
      // Check mentor capacity
      if (requestData.current_mentees >= requestData.max_mentees) {
        return res.status(400).json({ success: false, message: 'You have reached your maximum mentee capacity' });
      }

      // Start transaction
      await pool.query('START TRANSACTION');

      try {
        // Update request status
        await pool.query(
          'UPDATE mentorship_requests SET status = "accepted", updated_at = NOW() WHERE request_id = ?',
          [request_id]
        );

        // Create active mentorship
        await pool.query(`
          INSERT INTO active_mentorships (
            mentor_id, mentee_id, request_id, start_date, expected_end_date, status
          ) VALUES (?, ?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 3 MONTH), 'active')
        `, [requestData.mentor_id, requestData.mentee_id, request_id]);

        // Update mentor's current mentees count
        await pool.query(
          'UPDATE mentors SET current_mentees = current_mentees + 1 WHERE mentor_id = ?',
          [requestData.mentor_id]
        );

        // Log activities
        await pool.query(`
          INSERT INTO user_activities (user_id, activity_type, activity_description, created_at)
          VALUES (?, 'mentorship', 'Accepted mentorship request', NOW())
        `, [userId]);

        await pool.query(`
          INSERT INTO user_activities (user_id, activity_type, activity_description, created_at)
          VALUES (?, 'mentorship', 'Mentorship request accepted', NOW())
        `, [requestData.mentee_id]);

        await pool.query('COMMIT');
        
        res.json({ success: true, message: 'Mentorship request accepted successfully!' });
      } catch (err) {
        await pool.query('ROLLBACK');
        throw err;
      }
    } else if (action === 'decline') {
      // Update request status to declined
      await pool.query(
        'UPDATE mentorship_requests SET status = "declined", updated_at = NOW() WHERE request_id = ?',
        [request_id]
      );

      // Log activities
      await pool.query(`
        INSERT INTO user_activities (user_id, activity_type, activity_description, created_at)
        VALUES (?, 'mentorship', 'Declined mentorship request', NOW())
      `, [userId]);

      await pool.query(`
        INSERT INTO user_activities (user_id, activity_type, activity_description, created_at)
        VALUES (?, 'mentorship', 'Mentorship request declined', NOW())
      `, [requestData.mentee_id]);

      res.json({ success: true, message: 'Mentorship request declined.' });
    } else {
      res.status(400).json({ success: false, message: 'Invalid action. Use "accept" or "decline".' });
    }
  } catch (err) {
    console.error('Respond to request error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// End mentorship
app.post('/api/mentorship/end', authenticateToken, async (req, res) => {
  const { mentorship_id, reason } = req.body;
  const userId = req.user.user_id;

  try {
    // Verify user is part of this mentorship
    const [mentorship] = await pool.query(`
      SELECT am.*, m.user_id as mentor_user_id
      FROM active_mentorships am
      JOIN mentors m ON am.mentor_id = m.mentor_id
      WHERE am.mentorship_id = ? AND (am.mentee_id = ? OR m.user_id = ?) AND am.status = 'active'
    `, [mentorship_id, userId, userId]);

    if (mentorship.length === 0) {
      return res.status(404).json({ success: false, message: 'Mentorship not found or not authorized' });
    }

    const mentorshipData = mentorship[0];

    // Start transaction
    await pool.query('START TRANSACTION');

    try {
      // Update mentorship status
      await pool.query(`
        UPDATE active_mentorships 
        SET status = 'completed', end_date = CURDATE(), completion_reason = ?, updated_at = NOW()
        WHERE mentorship_id = ?
      `, [reason || 'Completed', mentorship_id]);

      // Update mentor's current mentees count
      await pool.query(
        'UPDATE mentors SET current_mentees = current_mentees - 1 WHERE mentor_id = ?',
        [mentorshipData.mentor_id]
      );

      // Log activities
      await pool.query(`
        INSERT INTO user_activities (user_id, activity_type, activity_description, created_at)
        VALUES (?, 'mentorship', 'Ended mentorship', NOW())
      `, [userId]);

      const otherUserId = userId === mentorshipData.mentor_user_id ? mentorshipData.mentee_id : mentorshipData.mentor_user_id;
      await pool.query(`
        INSERT INTO user_activities (user_id, activity_type, activity_description, created_at)
        VALUES (?, 'mentorship', 'Mentorship ended', NOW())
      `, [otherUserId]);

      await pool.query('COMMIT');
      
      res.json({ success: true, message: 'Mentorship ended successfully.' });
    } catch (err) {
      await pool.query('ROLLBACK');
      throw err;
    }
  } catch (err) {
    console.error('End mentorship error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// Withdraw mentorship request (for mentees)
app.post('/api/mentorship/withdraw-request', authenticateToken, async (req, res) => {
  const { request_id } = req.body;
  const userId = req.user.user_id;

  try {
    // Verify the request belongs to this user and is pending
    const [request] = await pool.query(`
      SELECT * FROM mentorship_requests 
      WHERE request_id = ? AND mentee_id = ? AND status = 'pending'
    `, [request_id, userId]);

    if (request.length === 0) {
      return res.status(404).json({ success: false, message: 'Request not found or cannot be withdrawn' });
    }

    // Update request status to withdrawn
    await pool.query(
      'UPDATE mentorship_requests SET status = "withdrawn", updated_at = NOW() WHERE request_id = ?',
      [request_id]
    );

    // Log activity
    await pool.query(`
      INSERT INTO user_activities (user_id, activity_type, activity_description, created_at)
      VALUES (?, 'mentorship', 'Withdrew mentorship request', NOW())
    `, [userId]);

    res.json({ success: true, message: 'Mentorship request withdrawn successfully.' });
  } catch (err) {
    console.error('Withdraw request error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

console.log('\n🎓 MENTORSHIP ROUTES LOADED:');
console.log('- GET /mentorship');
console.log('- GET /mentorship/my-mentorships');
console.log('- GET /mentorship/mentor/:mentorId');
console.log('- POST /api/mentorship/become-mentor');
console.log('- POST /api/mentorship/save-preferences');
console.log('- POST /api/mentorship/request');
console.log('- GET /api/mentorship/my-mentorships');
console.log('- POST /api/mentorship/respond-request');
console.log('- POST /api/mentorship/end');
console.log('- POST /api/mentorship/withdraw-request');
console.log('========================');
});