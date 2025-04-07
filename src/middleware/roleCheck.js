// Middleware to check if user is a super admin
const isSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  if (req.user.role !== 'super-admin') {
    return res.status(403).json({ message: 'Access denied. Super admin privileges required.' });
  }

  next();
};

module.exports = {
  isSuperAdmin
}; 