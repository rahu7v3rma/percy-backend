require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const createSuperAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    // Check if super admin already exists
    const existingSuperAdmin = await User.findOne({ role: 'super-admin' });
    if (existingSuperAdmin) {
      console.log('Super admin already exists');
      process.exit(0);
    }

    // Create super admin
    const password = await bcrypt.hash('superadmin123', 10);
    const superAdmin = new User({
      username: 'andrew1',
      email: 'andrew@andrewjennings.tv',
      password,
      role: 'super-admin'
    });

    await superAdmin.save();
    console.log('Super admin created successfully');
    console.log('Email: andrew@andrewjennings.tv');
    console.log('Password: superadmin123');
  } catch (error) {
    console.error('Error creating super admin:', error);
  } finally {
    await mongoose.connection.close();
  }
};

createSuperAdmin();
