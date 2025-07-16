import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config(); //Load environment variables

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: 3306
});

// pool.connect((err) => {
//     if (err) {
//         console.error('Database connection failed: ' + err.message);
//     } else {
//         console.log('Connected to MySQL database');
//     }
// });

export default pool;