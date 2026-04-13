/**
 * 文件上传 API 路由
 * 上传后自动压缩图片，节省磁盘空间
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

// 确保上传目录存在
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// 配置 multer 存储（先存到临时目录，压缩后再移到正式目录）
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // 生成唯一文件名: 时间戳_随机串.jpg（统一输出为 jpg）
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        cb(null, `${timestamp}_${random}.jpg`);
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

function removeFileIfExists(filePath) {
    if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
}

/**
 * 压缩单张图片
 * - 最大宽度 1200px（保持宽高比缩放）
 * - JPEG 质量 60%（人眼清晰可辨，文件大幅缩小）
 * - 去除 EXIF 元数据（进一步减小体积）
 *
 * 原始 3-5MB 的手机照片 → 压缩后约 100-250KB
 */
async function compressImage(filePath) {
    const tempPath = filePath + '.tmp';

    try {
        await sharp(filePath)
            .rotate()                    // 根据 EXIF 自动旋转
            .resize({
                width: 1200,             // 最大宽度 1200px
                height: 1200,            // 最大高度 1200px
                fit: 'inside',           // 保持宽高比，不裁剪
                withoutEnlargement: true  // 小图不放大
            })
            .jpeg({
                quality: 60,             // JPEG 质量 60%，清晰可辨
                mozjpeg: true            // 使用 mozjpeg 编码，压缩率更高
            })
            .toFile(tempPath);

        // 用压缩后的文件替换原文件
        fs.unlinkSync(filePath);
        fs.renameSync(tempPath, filePath);

        const stat = fs.statSync(filePath);
        console.log(`图片压缩完成: ${path.basename(filePath)} → ${(stat.size / 1024).toFixed(0)}KB`);
        return stat.size;
    } catch (err) {
        // 压缩失败时保留原文件
        console.warn('图片压缩失败，保留原文件:', err.message);
        if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
        }
        return fs.statSync(filePath).size;
    }
}

router.use(requireAuth);

/**
 * POST /api/upload
 * 上传单个文件（自动压缩）
 */
router.post('/', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.json({ code: 400, message: '请选择要上传的文件', data: null });
        }

        const filePath = path.join(uploadDir, req.file.filename);

        // 压缩图片
        const compressedSize = await compressImage(filePath);

        // 构建可通过静态文件服务访问的 URL
        const fileUrl = `${getPublicOrigin(req)}/uploads/${req.file.filename}`;

        res.json({
            code: 0,
            message: '上传成功',
            data: {
                url: fileUrl,
                filename: req.file.filename,
                size: compressedSize
            }
        });
    } catch (err) {
        console.error('上传文件失败:', err);
        res.json({ code: -1, message: '上传失败，请重试', data: null });
    }
});

/**
 * POST /api/upload/multiple
 * 批量上传（最多9张，自动压缩）
 */
router.post('/multiple', upload.array('files', 9), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.json({ code: 400, message: '请选择要上传的文件', data: null });
        }

        const uploadResults = await Promise.allSettled(
            req.files.map(async (file) => {
                const filePath = path.join(uploadDir, file.filename);
                const compressedSize = await compressImage(filePath);
                return {
                    url: `${getPublicOrigin(req)}/uploads/${file.filename}`,
                    filename: file.filename,
                    size: compressedSize
                };
            })
        );

        const successFiles = [];
        let failedCount = 0;

        uploadResults.forEach((item, index) => {
            if (item.status === 'fulfilled' && item.value) {
                successFiles.push(item.value);
                return;
            }

            failedCount += 1;
            const failedFile = req.files[index];
            if (failedFile?.filename) {
                removeFileIfExists(path.join(uploadDir, failedFile.filename));
            }
            console.error('批量上传子任务失败:', item.reason || '未知错误');
        });

        if (successFiles.length === 0) {
            return res.json({ code: -1, message: '上传失败，请重试', data: null });
        }

        res.json({
            code: 0,
            message: failedCount > 0 ? `成功上传${successFiles.length}张，失败${failedCount}张` : '上传成功',
            data: {
                files: successFiles,
                failedCount
            }
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
