require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const updateSuperAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    // Remove any existing user with the target email
    await User.deleteOne({ email: 'andrew@andrewjennings.tv', role: { $ne: 'super-admin' } });

    // Find and update super admin
    const superAdmin = await User.findOne({ role: 'super-admin' });
    if (!superAdmin) {
      console.log('No super admin found');
      process.exit(1);
    }
    const password = await bcrypt.hash('andrew@admin123', 10);

    // Update super admin email and username
    superAdmin.email = 'andrew@andrewjennings.tv';
    superAdmin.username = 'andrew';
    superAdmin.password = password;

    await superAdmin.save();

    console.log('Super admin updated successfully');
    console.log('New email: andrew@andrewjennings.tv');
    console.log('New username: andrew');
    console.log('New password: andrew@admin123');
  } catch (error) {
    console.error('Error updating super admin:', error);
  } finally {
    await mongoose.connection.close();
  }
};

updateSuperAdmin();
