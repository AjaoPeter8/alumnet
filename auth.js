import jwt from 'jsonwebtoken';

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

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return req.accepts('html')
        ? res.redirect('/login')
        : res.status(403).json({ message: 'Invalid token' });
    }
    req.user = user;
    next();
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