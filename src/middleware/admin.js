const isAdmin = async (req, res, next) => {
  try {
    if (!req.user || !['super-admin', 'client-admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }
    next();
  } catch (error) {
    res.status(500).json({ error: 'Error checking admin privileges' });
  }
};

module.exports = isAdmin;
