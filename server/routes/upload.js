/**
 * 文件上传 API 路由
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 确保上传目录存在
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// 配置 multer 存储
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // 生成唯一文件名: 时间戳_随机串.扩展名
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, `${timestamp}_${random}${ext}`);
    }
});

// 文件过滤：只允许图片
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('只允许上传图片文件(jpg/png/gif/webp)'), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
    }
});

function requireAuth(req, res, next) {
    if (!req.user || !req.user.id) {
        return res.json({ code: 401, message: '登录已失效，请重新登录', data: null });
    }
    next();
}

function getPublicOrigin(req) {
    const protocol = req.protocol;
    const host = req.get('x-forwarded-host') || req.get('host');
    return `${protocol}://${host}`;
}

router.use(requireAuth);

/**
 * POST /api/upload
 * 上传单个文件
 */
router.post('/', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.json({ code: 400, message: '请选择要上传的文件', data: null });
        }

        // 构建可通过静态文件服务访问的 URL
        const fileUrl = `${getPublicOrigin(req)}/uploads/${req.file.filename}`;

        res.json({
            code: 0,
            message: '上传成功',
            data: {
                url: fileUrl,
                filename: req.file.filename,
                size: req.file.size
            }
        });
    } catch (err) {
        console.error('上传文件失败:', err);
        res.json({ code: -1, message: '上传失败，请重试', data: null });
    }
});

/**
 * POST /api/upload/multiple
 * 批量上传（最多9张）
 */
router.post('/multiple', upload.array('files', 9), (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.json({ code: 400, message: '请选择要上传的文件', data: null });
        }

        const urls = req.files.map(file => ({
            url: `${getPublicOrigin(req)}/uploads/${file.filename}`,
            filename: file.filename,
            size: file.size
        }));

        res.json({
            code: 0,
            message: '上传成功',
            data: { files: urls }
        });
    } catch (err) {
        console.error('批量上传失败:', err);
        res.json({ code: -1, message: '上传失败，请重试', data: null });
    }
});

// multer 错误处理
router.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.json({ code: 400, message: '文件大小超过限制(最大10MB)', data: null });
        }
        return res.json({ code: 400, message: `上传错误: ${err.message}`, data: null });
    }
    if (err) {
        return res.json({ code: 400, message: err.message || '上传失败', data: null });
    }
    next();
});

module.exports = router;
