/**
 * 教学监督反馈改进系统 - Express 后端入口
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { testConnection } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'jiaoxuejiandu_secret_key_2026';

app.set('trust proxy', true);

// ========== 中间件 ==========
// 跨域支持
app.use(cors());

// 解析 JSON 请求体
app.use(express.json({ limit: '10mb' }));

// 解析 URL 编码请求体
app.use(express.urlencoded({ extended: true }));

// 静态文件服务（上传的图片）
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 请求日志中间件
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
    });
    next();
});

app.use((req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

    if (!token) {
        return next();
    }

    try {
        req.user = jwt.verify(token, JWT_SECRET);
    } catch (err) {
        console.warn('JWT 校验失败:', err.message);
    }

    next();
});

// ========== 路由 ==========
const authRoutes = require('./routes/auth');
const observationRoutes = require('./routes/observation');
const improvementRoutes = require('./routes/improvement');
const uploadRoutes = require('./routes/upload');

app.use('/api/auth', authRoutes);
app.use('/api/observation', observationRoutes);
app.use('/api/improvement', improvementRoutes);
app.use('/api/upload', uploadRoutes);

// 健康检查接口
app.get('/api/health', (req, res) => {
    res.json({ code: 0, message: 'ok', data: { status: 'running', time: new Date().toISOString() } });
});

// 404 处理
app.use((req, res) => {
    res.status(404).json({ code: 404, message: '接口不存在', data: null });
});

// 全局错误处理
app.use((err, req, res, next) => {
    console.error('服务器内部错误:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
});

// ========== 启动服务 ==========
async function startServer() {
    // 测试数据库连接
    const dbOk = await testConnection();
    if (!dbOk) {
        console.error('⚠️  数据库连接失败，请检查 .env 配置后重试');
        console.error('   如尚未建表，请先执行: mysql -u root -p < init.sql');
    }

    app.listen(PORT, () => {
        console.log(`🚀 服务器已启动: http://localhost:${PORT}`);
        console.log(`📡 API 基础路径: http://localhost:${PORT}/api`);
        console.log(`🏥 健康检查: http://localhost:${PORT}/api/health`);
    });
}

startServer();
