// Script to create an admin user with proper password hashing
import bcrypt from 'bcrypt';
import pool from './db.js';

async function createAdmin() {
  try {
    const username = 'admin';
    const email = 'admin@alumnet.com';
    const fullName = 'System Administrator';
    const password = 'admin123'; // Change this to your desired password
    
    console.log('Creating admin user...');
    console.log(`Username: ${username}`);
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
    console.log('---');

    // Check if admin user already exists
    const [existingUsers] = await pool.query('SELECT * FROM users WHERE username = ? OR email = ?', [username, email]);
    
    if (existingUsers.length > 0) {
      console.log('Admin user already exists. Updating role and password...');
      
      // Hash the new password
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Update existing user to admin
      await pool.query(
        'UPDATE users SET password = ?, role = ?, full_name = ?, updated_at = NOW() WHERE username = ?',
        [hashedPassword, 'admin', fullName, username]
      );
      
      console.log('✅ Existing user updated to admin successfully!');
    } else {
      console.log('Creating new admin user...');
      
      // Hash the password
      const hashedPassword = await bcrypt.hash(password, 10);
      console.log('Password hashed successfully');
      
      // Insert new admin user
      const [result] = await pool.query(
        'INSERT INTO users (username, email, full_name, password, role, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
        [username, email, fullName, hashedPassword, 'admin']
      );
      
      console.log('✅ Admin user created successfully!');
      console.log(`User ID: ${result.insertId}`);
    }

    // Verify the admin user was created/updated
    const [adminUsers] = await pool.query('SELECT user_id, username, email, full_name, role, created_at FROM users WHERE role = "admin"');
    
    console.log('\n📋 Current Admin Users:');
    console.table(adminUsers);

    // Test login
    console.log('\n🔐 Testing admin login...');
    const [testUser] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    
    if (testUser.length > 0) {
      const isValidPassword = await bcrypt.compare(password, testUser[0].password);
      console.log(`Password verification: ${isValidPassword ? '✅ PASS' : '❌ FAIL'}`);
      console.log(`User role: ${testUser[0].role}`);
    }

    console.log('\n🎉 Admin setup completed!');
    console.log('\nYou can now login with:');
    console.log(`Username: ${username}`);
    console.log(`Password: ${password}`);
    console.log('\nThen navigate to /admin to access the admin panel.');

  } catch (error) {
    console.error('❌ Error creating admin user:', error);
  } finally {
    process.exit(0);
  }
}

// Add role column if it doesn't exist
async function ensureRoleColumn() {
  try {
    console.log('Checking if role column exists...');
    
    // Try to add role column (will fail silently if it already exists)
    try {
      await pool.query('ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT "user"');
      console.log('✅ Role column added to users table');
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log('✅ Role column already exists');
      } else {
        throw err;
      }
    }

    // Update existing users to have 'user' role if role is NULL
    await pool.query('UPDATE users SET role = "user" WHERE role IS NULL');
    console.log('✅ Updated existing users with default role');

  } catch (error) {
    console.error('❌ Error setting up role column:', error);
    throw error;
  }
}

// Run the setup
async function setup() {
  console.log('🚀 Starting admin setup...\n');
  await ensureRoleColumn();
  await createAdmin();
}

setup();
