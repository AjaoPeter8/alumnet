import jwt from 'jsonwebtoken';
import pool from './db.js';

const JWT_SECRET = 'your_jwt_secret_key';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  let token = authHeader && authHeader.split(' ')[1];

  if (!token && req.cookies?.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return req.accepts('html')
      ? res.redirect('/login')
      : res.status(401).json({ message: 'Access token missing' });
  }

  jwt.verify(token, JWT_SECRET, async (err, tokenUser) => {
    if (err) {
      return req.accepts('html')
        ? res.redirect('/login')
        : res.status(403).json({ message: 'Invalid token' });
    }
    
    try {
      // Fetch fresh user data from database to ensure role is current
      const [users] = await pool.query(
        'SELECT user_id, username, email, full_name, role FROM users WHERE user_id = ?',
        [tokenUser.user_id]
      );
      
      if (users.length === 0) {
        return req.accepts('html')
          ? res.redirect('/login')
          : res.status(403).json({ message: 'User not found' });
      }
      
      // Use fresh data from database, fallback to token data
      req.user = {
        user_id: users[0].user_id,
        username: users[0].username,
        email: users[0].email,
        full_name: users[0].full_name,
        role: users[0].role || 'user'
      };
      
      next();
    } catch (dbErr) {
      console.error('Database error in auth middleware:', dbErr);
      // Fallback to token data if database fails
      req.user = {
        ...tokenUser,
        role: tokenUser.role || 'user'
      };
      next();
    }
  });
}

function authorizeSocket(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Unauthorized'));

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return next(new Error('Unauthorized'));
    socket.user = user;
    next();
  });
}

export { authenticateToken, authorizeSocket };