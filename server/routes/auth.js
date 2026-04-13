/**
 * 登录/注册 API 路由
 * 替代原 cloudfunctions/login
 */
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query, insert } = require('../db');
const { normalizeRoles, getPrimaryRole, VALID_ROLES, hasAnyRole } = require('../utils');
const { listUsersByRole } = require('../user-role-store');

const JWT_SECRET = String(process.env.JWT_SECRET || '').trim();
const STORAGE_ROLE_PRIORITY = ['teacher', 'department_leader', 'supervisor', 'college', 'admin'];
const SELF_SERVICE_ROLES = ['teacher'];
const OPTIONAL_SELF_SERVICE_ROLES = [];
const TEACHER_DIRECTORY_ROLES = ['supervisor', 'college', 'department_leader', 'admin'];

if (!JWT_SECRET) {
    throw new Error('缺少必填环境变量 JWT_SECRET');
}

let userRolesTablePromise = null;

function getStorageRole(roles = []) {
    return STORAGE_ROLE_PRIORITY.find(role => roles.includes(role)) || roles[0] || '';
}

function unauthorized(res) {
    return res.json({ code: 401, message: '登录已失效，请重新登录', data: null });
}

function getAdminCode() {
    return String(process.env.ADMIN_CODE || '').trim();
}

function isAdminCodeConfigured() {
    return Boolean(getAdminCode());
}

function isAdminCodeValid(password) {
    const adminCode = getAdminCode();
    return Boolean(adminCode) && String(password || '').trim() === adminCode;
}

function getWechatConfig() {
    return {
        appid: process.env.WECHAT_APPID || process.env.WX_APPID || '',
        secret: process.env.WECHAT_APPSECRET || process.env.WECHAT_SECRET || process.env.WX_APPSECRET || ''
    };
}

function isLocalDevRequest(req) {
    const host = String(req.get('x-forwarded-host') || req.get('host') || req.hostname || '').toLowerCase();
    const hostname = String(req.hostname || '').toLowerCase();
    const nodeEnv = String(process.env.NODE_ENV || '').toLowerCase();
    const isLocalHost = host.includes('127.0.0.1')
        || host.includes('localhost')
        || hostname === '127.0.0.1'
        || hostname === 'localhost';

    return isLocalHost && nodeEnv !== 'production';
}

function buildLocalDevSession(phone) {
    const normalizedPhone = String(phone || '').trim();
    const seed = `${normalizedPhone || 'local_dev_user'}|${JWT_SECRET}`;
    const hash = crypto.createHash('sha256').update(seed).digest('hex');

    return {
        openid: `dev_${hash.slice(0, 28)}`,
        unionid: ''
    };
}

async function exchangeCodeForSession(req, code, phone) {
    const { appid, secret } = getWechatConfig();
    if (!appid || !secret) {
        if (isLocalDevRequest(req)) {
            return buildLocalDevSession(phone);
        }
        throw new Error('服务器未配置微信登录参数，请先配置 WECHAT_APPID 和 WECHAT_APPSECRET');
    }

    const params = new URLSearchParams({
        appid,
        secret,
        js_code: code,
        grant_type: 'authorization_code'
    });

    const response = await fetch(`https://api.weixin.qq.com/sns/jscode2session?${params.toString()}`);
    if (!response.ok) {
        throw new Error('微信登录服务请求失败，请稍后重试');
    }

    const result = await response.json();
    if (!result.openid) {
        throw new Error(result.errmsg || '微信登录失败，请重新进入小程序后重试');
    }

    return {
        openid: result.openid,
        unionid: result.unionid || ''
    };
}

async function hasUserRolesTable() {
    if (!userRolesTablePromise) {
        userRolesTablePromise = query("SHOW TABLES LIKE 'user_roles'")
            .then(rows => rows.length > 0)
            .catch(err => {
                userRolesTablePromise = null;
                throw err;
            });
    }

    return userRolesTablePromise;
}

async function loadGrantedRoles(userId, fallbackRole = '') {
    const roleList = [];

    if (await hasUserRolesTable()) {
        const rows = await query(
            `SELECT role
             FROM user_roles
             WHERE user_id = ?
             ORDER BY FIELD(role, 'admin', 'college', 'supervisor', 'department_leader', 'teacher')`,
            [userId]
        );
        rows.forEach(item => {
            roleList.push(item.role);
        });
    }

    if (roleList.length === 0 && fallbackRole) {
        roleList.push(fallbackRole);
    }

    return normalizeRoles(roleList);
}

async function replaceGrantedRoles(userId, roles = []) {
    if (!(await hasUserRolesTable())) {
        return false;
    }

    const normalizedRoles = normalizeRoles(roles);
    await query('DELETE FROM user_roles WHERE user_id = ?', [userId]);

    if (normalizedRoles.length === 0) {
        return true;
    }

    const placeholders = normalizedRoles.map(() => '(?, ?)').join(', ');
    const params = [];
    normalizedRoles.forEach(role => {
        params.push(userId, role);
    });

    await query(`INSERT INTO user_roles (user_id, role) VALUES ${placeholders}`, params);
    return true;
}

function buildUserPayload(user, roles = []) {
    const effectiveRoles = normalizeRoles(roles);
    const safeRoles = effectiveRoles.length > 0 ? effectiveRoles : normalizeRoles(user.role);

    return {
        id: Number(user.id),
        role: getPrimaryRole(safeRoles),
        roles: safeRoles,
        baseRole: user.role,
        phone: user.phone || '',
        name: user.name || '',
        department: user.department || '',
        avatar: user.avatar || ''
    };
}

function getActor(req) {
    if (!req.user || !req.user.id) {
        return null;
    }

    const roles = normalizeRoles(req.user);
    return {
        id: Number(req.user.id),
        role: getPrimaryRole(roles),
        roles
    };
}

function getRequestedRoles(role, roles) {
    const requestedRoles = normalizeRoles(roles, role);
    if (requestedRoles.length === 0) {
        return [];
    }

    const invalidRoles = requestedRoles.filter(item => !VALID_ROLES.includes(item));
    if (invalidRoles.length > 0) {
        throw new Error('无效的角色类型');
    }

    return requestedRoles;
}

function getPrivilegedRoles(roles = []) {
    return normalizeRoles(roles).filter(item => !SELF_SERVICE_ROLES.includes(item) && !OPTIONAL_SELF_SERVICE_ROLES.includes(item));
}

function isValidPhone(phone) {
    return /^1[3-9]\d{9}$/.test(String(phone || '').trim());
}

async function findPreopenedUserByPhone(phone, roles = []) {
    const normalizedPhone = String(phone || '').trim();
    const requestedRoles = normalizeRoles(roles);

    if (!normalizedPhone) {
        return null;
    }

    const rows = await query(
        'SELECT * FROM users WHERE phone = ? ORDER BY FIELD(role, ?, ?, ?, ?, ?) ASC, id ASC',
        [normalizedPhone, 'admin', 'college', 'supervisor', 'department_leader', 'teacher']
    );

    for (const row of rows) {
        const grantedRoles = await loadGrantedRoles(row.id, row.role);
        if (requestedRoles.length === 0 || requestedRoles.some(item => grantedRoles.includes(item))) {
            return {
                ...row,
                roles: grantedRoles
            };
        }
    }

    return null;
}

function canCoverRequestedRoles(grantedRoles = [], requestedRoles = []) {
    if (requestedRoles.length === 0) {
        return true;
    }

    return requestedRoles.every(role => grantedRoles.includes(role));
}

async function findUsersByOpenid(openid) {
    if (!openid) {
        return [];
    }

    const rows = await query(
        'SELECT * FROM users WHERE openid = ? ORDER BY FIELD(role, ?, ?, ?, ?, ?) ASC, id ASC',
        [openid, 'admin', 'college', 'supervisor', 'department_leader', 'teacher']
    );

    const users = [];
    for (const row of rows) {
        users.push({
            ...row,
            roles: await loadGrantedRoles(row.id, row.role)
        });
    }

    return users;
}

/**
 * GET /api/auth/prefill
 * 根据管理员预开通的身份自动填充姓名和单位
 */
router.get('/prefill', async (req, res) => {
    try {
        const { phone, role, roles } = req.query;
        const requestedRoles = getRequestedRoles(role, roles);
        const privilegedRoles = getPrivilegedRoles(requestedRoles);

        if (!isValidPhone(phone)) {
            return res.json({ code: 400, message: '手机号格式不正确', data: null });
        }

        if (privilegedRoles.length === 0) {
            return res.json({
                code: 0,
                message: '获取成功',
                data: { exists: false, locked: false, name: '', department: '', roles: [] }
            });
        }

        const existingUser = await findPreopenedUserByPhone(phone, privilegedRoles);
        if (!existingUser) {
            return res.json({
                code: 0,
                message: '获取成功',
                data: { exists: false, locked: false, name: '', department: '', roles: [] }
            });
        }

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                exists: true,
                locked: true,
                name: existingUser.name || '',
                department: existingUser.department || '',
                roles: existingUser.roles || []
            }
        });
    } catch (err) {
        console.error('获取登录预填充失败:', err);
        res.json({ code: -1, message: '获取失败，请重试', data: null });
    }
});

/**
 * POST /api/auth/login
 * 用户登录/注册
 * Body: { code, userInfo, role, roles, phone, name, department, password }
 */
router.post('/login', async (req, res) => {
    try {
        const { code, userInfo, role, roles, phone, name, department, password } = req.body;
        const requestedRoles = getRequestedRoles(role, roles);
        const privilegedRoles = getPrivilegedRoles(requestedRoles);

        if (!code && !isLocalDevRequest(req)) {
            return res.json({ code: 400, message: '缺少微信登录凭证，请重新登录', data: null });
        }
        if (!phone || !name || !department) {
            return res.json({ code: 400, message: '请完整填写必填信息', data: null });
        }
        if (requestedRoles.length === 0) {
            return res.json({ code: 400, message: '请至少选择一个身份', data: null });
        }

        const { openid, unionid } = await exchangeCodeForSession(req, code, phone);
        const roleStoreAvailable = await hasUserRolesTable();
        const existingUsers = await findUsersByOpenid(openid);
        let userData;

        if (requestedRoles.length > 1 && !roleStoreAvailable) {
            return res.json({
                code: 400,
                message: '当前系统暂未启用多身份登录，请先只选择一个身份登录',
                data: null
            });
        }

        const matchedExistingUser = existingUsers.find(item => canCoverRequestedRoles(item.roles, requestedRoles));

        if (matchedExistingUser) {
            const effectiveRoles = requestedRoles.length > 0 ? requestedRoles : matchedExistingUser.roles;

            if (effectiveRoles.includes('admin')) {
                if (!isAdminCodeConfigured()) {
                    return res.json({ code: 500, message: '服务器未配置管理员授权码，请联系管理员处理', data: null });
                }
                if (!isAdminCodeValid(password)) {
                    return res.json({ code: 401, message: '管理员授权码不正确', data: null });
                }
            }

            await query(
                'UPDATE users SET unionid = ?, phone = ?, name = ?, department = ?, avatar = ? WHERE id = ?',
                [
                    unionid || matchedExistingUser.unionid || null,
                    phone,
                    name,
                    department,
                    userInfo?.avatarUrl || matchedExistingUser.avatar,
                    matchedExistingUser.id
                ]
            );

            userData = buildUserPayload({
                ...matchedExistingUser,
                unionid: unionid || matchedExistingUser.unionid || null,
                phone,
                name,
                department,
                avatar: userInfo?.avatarUrl || matchedExistingUser.avatar
            }, effectiveRoles);
        } else {
            const preopenedUser = privilegedRoles.length > 0
                ? await findPreopenedUserByPhone(phone, privilegedRoles)
                : null;

            if (preopenedUser) {
                const matchedExistingIds = new Set(existingUsers.map(item => Number(item.id)));
                if (preopenedUser.openid && preopenedUser.openid !== openid && !matchedExistingIds.has(Number(preopenedUser.id))) {
                    return res.json({ code: 409, message: '该手机号已绑定其他微信账号，请联系管理员处理', data: null });
                }

                const grantedRoles = preopenedUser.roles || await loadGrantedRoles(preopenedUser.id, preopenedUser.role);
                const unauthorizedRoles = requestedRoles.filter(item => !grantedRoles.includes(item));
                if (unauthorizedRoles.length > 0) {
                    return res.json({ code: 403, message: '所选身份未开通，请联系管理员配置', data: null });
                }

                const effectiveRoles = requestedRoles.length > 0 ? requestedRoles : grantedRoles;
                if (effectiveRoles.includes('admin')) {
                    if (!isAdminCodeConfigured()) {
                        return res.json({ code: 500, message: '服务器未配置管理员授权码，请联系管理员处理', data: null });
                    }
                    if (!isAdminCodeValid(password)) {
                        return res.json({ code: 401, message: '管理员授权码不正确', data: null });
                    }
                }

                const finalName = preopenedUser.name || name;
                const finalDepartment = preopenedUser.department || department;

                await query(
                    'UPDATE users SET openid = ?, unionid = ?, phone = ?, name = ?, department = ?, avatar = ? WHERE id = ?',
                    [
                        openid,
                        unionid || preopenedUser.unionid || null,
                        phone,
                        finalName,
                        finalDepartment,
                        userInfo?.avatarUrl || preopenedUser.avatar,
                        preopenedUser.id
                    ]
                );

                userData = buildUserPayload({
                    ...preopenedUser,
                    openid,
                    unionid: unionid || preopenedUser.unionid || null,
                    phone,
                    name: finalName,
                    department: finalDepartment,
                    avatar: userInfo?.avatarUrl || preopenedUser.avatar
                }, effectiveRoles);
            } else if (existingUsers.length > 0) {
                return res.json({ code: 403, message: '所选身份未开通，请联系管理员配置', data: null });
            } else if (privilegedRoles.length > 0) {
                return res.json({ code: 403, message: '学校督导、高教中心和校领导身份需由管理员预先开通', data: null });
            }
            if (!userData) {
                const effectiveRoles = requestedRoles.includes('admin')
                    ? normalizeRoles(requestedRoles.filter(item => item === 'teacher' || item === 'admin'))
                    : ['teacher'];

                if (effectiveRoles.length > 1 && !roleStoreAvailable) {
                    return res.json({ code: 500, message: '数据库尚未启用多身份存储，请先执行最新 init.sql', data: null });
                }

                const storageRole = getStorageRole(effectiveRoles);
                const insertId = await insert(
                    'INSERT INTO users (openid, unionid, role, phone, name, department, avatar) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [openid, unionid || null, storageRole, phone, name, department, userInfo?.avatarUrl || '']
                );

                if (roleStoreAvailable) {
                    await replaceGrantedRoles(insertId, effectiveRoles);
                }

                userData = buildUserPayload({
                    id: insertId,
                    role: storageRole,
                    phone,
                    name,
                    department,
                    avatar: userInfo?.avatarUrl || ''
                }, effectiveRoles);
            }
        }

        const token = jwt.sign(
            {
                id: userData.id,
                openid,
                role: userData.role,
                roles: userData.roles,
                baseRole: userData.baseRole
            },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            code: 0,
            message: '登录成功',
            data: { ...userData, token }
        });

    } catch (err) {
        console.error('登录失败:', err);
        res.json({ code: -1, message: err.message || '登录失败，请重试', data: null });
    }
});

/**
 * GET /api/auth/user/:id
 */
router.get('/user/:id', async (req, res) => {
    try {
        const actor = getActor(req);
        if (!actor) {
            return unauthorized(res);
        }

        const targetUserId = Number(req.params.id);
        if (!targetUserId) {
            return res.json({ code: 400, message: '用户参数错误', data: null });
        }

        if (targetUserId !== actor.id && !hasAnyRole(actor, ['admin'])) {
            return res.json({ code: 403, message: '无权查看该用户信息', data: null });
        }

        const users = await query('SELECT id, role, name, phone, department, avatar FROM users WHERE id = ?', [targetUserId]);
        if (users.length === 0) {
            return res.json({ code: 404, message: '用户不存在', data: null });
        }

        const user = users[0];
        const roles = targetUserId === actor.id
            ? normalizeRoles(req.user)
            : await loadGrantedRoles(user.id, user.role);

        res.json({ code: 0, message: '获取成功', data: buildUserPayload(user, roles) });
    } catch (err) {
        console.error('获取用户信息失败:', err);
        res.json({ code: -1, message: '获取失败', data: null });
    }
});

/**
 * GET /api/auth/teachers
 */
router.get('/teachers', async (req, res) => {
    try {
        const actor = getActor(req);
        if (!actor) {
            return unauthorized(res);
        }

        if (!hasAnyRole(actor, TEACHER_DIRECTORY_ROLES)) {
            return res.json({ code: 403, message: '无权查看教师目录', data: null });
        }

        const { department } = req.query;
        const teachers = await listUsersByRole('teacher', department);

        res.json({
            code: 0,
            message: '获取成功',
            data: teachers.map(item => ({
                id: Number(item.id),
                name: item.name || '',
                department: item.department || ''
            }))
        });
    } catch (err) {
        console.error('获取教师列表失败:', err);
        res.json({ code: -1, message: '获取失败', data: null });
    }
});

module.exports = router;
