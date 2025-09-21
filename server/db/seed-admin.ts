/**
 * Seed script to create admin user for ResidentHive
 * Run this to create a default admin account for testing
 */

import { db } from '../db';
import { agents } from '@shared/schema';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

async function seedAdmin() {
  console.log('🌱 Creating admin user...');
  
  try {
    // Check if admin already exists
    const existingAdmin = await db.select()
      .from(agents)
      .where(eq(agents.email, 'admin@residenthive.com'))
      .limit(1);
    
    if (existingAdmin.length > 0) {
      console.log('✅ Admin user already exists');
      console.log('Email: admin@residenthive.com');
      console.log('Password: Use the password you set previously');
      return;
    }
    
    // Create admin user
    const defaultPassword = 'Admin123!';
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);
    
    const [admin] = await db.insert(agents).values({
      name: 'Admin User',
      email: 'admin@residenthive.com',
      password: hashedPassword,
      brokerageName: 'ResidentHive Admin',
      brokerageAddress: '123 Main St, Boston, MA 02101',
      brokeragePhone: '555-0100',
      isActive: true,
      emailVerified: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }).returning();
    
    console.log('✅ Admin user created successfully!');
    console.log('=====================================');
    console.log('📧 Email: admin@residenthive.com');
    console.log('🔐 Password: Admin123!');
    console.log('🔗 Login URL: http://localhost:3000/agent-login');
    console.log('=====================================');
    console.log('⚠️  IMPORTANT: Change the password after first login!');
    
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Import eq for Drizzle
import { eq } from 'drizzle-orm';

// Run the seed
seedAdmin();