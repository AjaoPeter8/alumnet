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
  destination: (req, file, cb) => cb(null, 'Uploads/'),
  filename: (req, file, cb) => cb(null, `${uuidv4()}-${file.originalname}`)
});
const upload = multer({ storage });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use('/uploads', express.static(path.join(__dirname, 'Uploads')));
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

server.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});