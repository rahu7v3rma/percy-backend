const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'No authentication token, access denied' });
    }

    console.log('Auth middleware - token:', token);

    const verified = jwt.verify(token, process.env.JWT_SECRET);
    
    // Fetch the complete user data to get clientGroup
    const user = await User.findById(verified._id).populate('clientGroup');
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    req.user = {
      _id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      clientGroup: user.clientGroup
    };

    console.log('Auth middleware - user:', req.user);
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(401).json({ message: 'Token verification failed, authorization denied' });
  }
};

module.exports = auth;
