/**
 * MySQL 数据库连接池
 */
const mysql = require('mysql2/promise');
require('dotenv').config();

// 创建连接池
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '123456',
  database: process.env.DB_NAME || 'jiaoxuejiandu',
  waitForConnections: true,
  connectionLimit: 10,        // 最大连接数
  queueLimit: 0,
  charset: 'utf8mb4'          // 支持中文和 emoji
});

/**
 * 执行 SQL 查询
 * @param {string} sql - SQL 语句
 * @param {Array} params - 参数列表
 * @returns {Promise<Array>} 查询结果
 */
async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/**
 * 执行插入操作并返回插入ID
 * @param {string} sql - INSERT SQL 语句
 * @param {Array} params - 参数列表
 * @returns {Promise<number>} 插入的行ID
 */
async function insert(sql, params = []) {
  const [result] = await pool.query(sql, params);
  return result.insertId;
}

/**
 * 执行更新/删除操作并返回受影响行数
 * @param {string} sql - UPDATE/DELETE SQL 语句
 * @param {Array} params - 参数列表
 * @returns {Promise<number>} 受影响的行数
 */
async function update(sql, params = []) {
  const [result] = await pool.query(sql, params);
  return result.affectedRows;
}

/**
 * 测试数据库连接
 */
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ MySQL 数据库连接成功');
    connection.release();
    return true;
  } catch (err) {
    console.error('❌ MySQL 数据库连接失败:', err.message);
    return false;
  }
}

module.exports = { pool, query, insert, update, testConnection };
