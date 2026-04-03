/**
 * 听课评课 API 路由
 * 替代原 cloudfunctions/observation
 */
const express = require('express');
const router = express.Router();
const { query, insert } = require('../db');
const { toCamelCase, parseJsonFields, normalizeRoles, hasRole, hasAnyRole, getPrimaryRole } = require('../utils');

const FORM_DATA_COLUMN = 'form_data';
let formDataColumnPromise = null;

function getActor(req) {
    if (!req.user || !req.user.id || !req.user.role) {
        return null;
    }

    const roles = normalizeRoles(req.user, req.user.role);
    return {
        id: Number(req.user.id),
        role: getPrimaryRole(roles, req.user.role),
        roles,
        openid: req.user.openid
    };
}

function unauthorized(res) {
    return res.json({ code: 401, message: '登录已失效，请重新登录', data: null });
}

function normalizeText(value) {
    return String(value || '').trim();
}

function toMysqlDate(value) {
    const raw = normalizeText(value);
    if (!raw) return '';

    const matched = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (matched) {
        return `${matched[1]}-${matched[2]}-${matched[3]}`;
    }

    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getWeekdayLabel(dateValue) {
    const mysqlDate = toMysqlDate(dateValue);
    if (!mysqlDate) return '';

    const [year, month, day] = mysqlDate.split('-').map(Number);
    const weekdayMap = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    return weekdayMap[new Date(year, month - 1, day).getDay()];
}

function readStoredFormData(record) {
    if (!record || record[FORM_DATA_COLUMN] === null || record[FORM_DATA_COLUMN] === undefined) {
        return {};
    }

    const raw = record[FORM_DATA_COLUMN];
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return raw;
    }

    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed;
            }
        } catch (err) {
            return {};
        }
    }

    return {};
}

function buildObservationFormData(source = {}, record = {}) {
    const stored = readStoredFormData(record);
    const merged = { ...stored, ...source };
    const observationDate = toMysqlDate(merged.observationDate || record.observation_date || record.observationDate);
    const recordImages = Array.isArray(record.images) ? record.images : [];
    const images = Array.isArray(merged.images) ? merged.images : recordImages;

    return {
        teacherId: Number(merged.teacherId || record.teacher_id || record.teacherId) || '',
        teacherName: normalizeText(merged.teacherName || record.teacher_name || record.teacherName),
        teacherTitle: normalizeText(merged.teacherTitle),
        unitName: normalizeText(merged.unitName),
        courseId: Number(merged.courseId || record.course_id || record.courseId) || '',
        courseName: normalizeText(merged.courseName || record.course_name || record.courseName),
        location: normalizeText(merged.location || record.location),
        classInfo: normalizeText(merged.classInfo || record.class_info || record.classInfo),
        observationDate,
        weekday: normalizeText(merged.weekday) || getWeekdayLabel(observationDate),
        lessonNumber: normalizeText(merged.lessonNumber),
        teachingProcess: normalizeText(merged.teachingProcess || merged.teachingContent || record.teaching_content || record.teachingContent),
        teachingEffect: normalizeText(merged.teachingEffect),
        improvementSuggestions: normalizeText(merged.improvementSuggestions || record.opinion),
        images: Array.isArray(images) ? images : []
    };
}

function attachObservationFormData(record) {
    parseJsonFields(record, ['images']);

    const formData = buildObservationFormData({}, record);
    record[FORM_DATA_COLUMN] = formData;
    record.teacher_name = formData.teacherName || record.teacher_name;
    record.course_name = formData.courseName || record.course_name;
    record.class_info = formData.classInfo || record.class_info;
    record.location = formData.location || record.location;
    record.teaching_content = formData.teachingProcess;
    record.opinion = formData.improvementSuggestions;
    record.images = formData.images;

    return record;
}

function shouldPreferTeacherName(updateData = {}, record = {}) {
    const incomingTeacherName = normalizeText(updateData.teacherName);
    if (!incomingTeacherName) {
        return false;
    }

    return incomingTeacherName !== normalizeText(record.teacher_name || record.teacherName);
}

function validateObservationForm(formData) {
    const requiredFields = [
        ['teacherName', '请输入授课教师姓名'],
        ['teacherTitle', '请输入授课教师职称'],
        ['unitName', '请输入单位'],
        ['courseName', '请输入课程名称'],
        ['observationDate', '请选择听课日期'],
        ['lessonNumber', '请输入节次'],
        ['location', '请输入授课地点'],
        ['classInfo', '请输入授课班级'],
        ['teachingProcess', '请填写教学过程'],
        ['teachingEffect', '请填写教学效果'],
        ['improvementSuggestions', '请填写评析及改进建议']
    ];

    for (const [field, message] of requiredFields) {
        if (!normalizeText(formData[field])) {
            return message;
        }
    }

    return '';
}

async function hasObservationFormDataColumn() {
    if (!formDataColumnPromise) {
        formDataColumnPromise = query('SHOW COLUMNS FROM observations LIKE ?', [FORM_DATA_COLUMN])
            .then(rows => rows.length > 0)
            .catch(err => {
                formDataColumnPromise = null;
                throw err;
            });
    }

    return formDataColumnPromise;
}

function buildObservationInsertPayload(supervisor, supervisorName, teacherInfo, formData, includeFormData) {
    const columns = [
        'supervisor_id',
        'supervisor_name',
        'teacher_id',
        'teacher_name',
        'course_id',
        'course_name',
        'class_info',
        'observation_date',
        'location',
        'teaching_content',
        'opinion',
        'images',
        'status'
    ];
    const values = [
        supervisor.id,
        supervisor.name || supervisorName || '',
        teacherInfo.teacherId,
        teacherInfo.teacherName,
        formData.courseId || null,
        formData.courseName,
        formData.classInfo,
        formData.observationDate,
        formData.location,
        formData.teachingProcess,
        formData.improvementSuggestions,
        JSON.stringify(formData.images || []),
        'pending'
    ];

    if (includeFormData) {
        columns.splice(11, 0, FORM_DATA_COLUMN);
        values.splice(11, 0, JSON.stringify(formData));
    }

    return { columns, values };
}

function buildObservationUpdatePayload(teacherInfo, formData, recordId, includeFormData) {
    const setClauses = [
        'teacher_id = ?',
        'teacher_name = ?',
        'course_id = ?',
        'course_name = ?',
        'class_info = ?',
        'observation_date = ?',
        'location = ?',
        'teaching_content = ?',
        'opinion = ?',
        'images = ?',
        "status = 'pending'",
        'reviewer_id = NULL',
        "reviewer_name = ''",
        'review_comment = NULL',
        'review_time = NULL'
    ];
    const values = [
        teacherInfo.teacherId,
        teacherInfo.teacherName,
        formData.courseId || null,
        formData.courseName,
        formData.classInfo,
        formData.observationDate,
        formData.location,
        formData.teachingProcess,
        formData.improvementSuggestions,
        JSON.stringify(formData.images || [])
    ];

    if (includeFormData) {
        setClauses.splice(9, 0, `${FORM_DATA_COLUMN} = ?`);
        values.splice(9, 0, JSON.stringify(formData));
    }

    values.push(recordId);
    return {
        sql: `UPDATE observations SET ${setClauses.join(', ')} WHERE id = ?`,
        values
    };
}

async function getUserById(userId) {
    const rows = await query('SELECT id, name, role, department FROM users WHERE id = ?', [userId]);
    return rows[0] || null;
}

async function findTeacherByName(name) {
    const normalizedName = normalizeText(name);
    if (!normalizedName) {
        return null;
    }

    const rows = await query(
        'SELECT id, name, role, department FROM users WHERE role = ? AND name = ? LIMIT 1',
        ['teacher', normalizedName]
    );
    return rows[0] || null;
}

async function resolveTeacher(teacherId, teacherName) {
    let finalTeacherId = Number(teacherId) || 0;
    let finalTeacherName = normalizeText(teacherName);

    if (finalTeacherId) {
        const teacher = await getUserById(finalTeacherId);
        if (!teacher || teacher.role !== 'teacher') {
            throw new Error('授课教师不存在');
        }
        finalTeacherId = teacher.id;
        finalTeacherName = teacher.name;
        return { teacherId: finalTeacherId, teacherName: finalTeacherName };
    }

    const teacher = await findTeacherByName(finalTeacherName);
    if (!teacher) {
        throw new Error('未找到该教师，请先确认教师已注册');
    }

    return { teacherId: teacher.id, teacherName: teacher.name };
}

/**
 * POST /api/observation/create
 * 创建听课记录
 */
router.post('/create', async (req, res) => {
    try {
        const actor = getActor(req);
        if (!actor) {
            return unauthorized(res);
        }

        const {
            supervisorId,
            supervisorName
        } = req.body;
        const formData = buildObservationFormData(req.body);
        const validationError = validateObservationForm(formData);

        if (!hasRole(actor, 'supervisor')) {
            return res.json({ code: 403, message: '只有听课老师可以填写听课记录表', data: null });
        }

        if (Number(supervisorId) !== Number(actor.id)) {
            return res.json({ code: 403, message: '只能以本人身份提交听课记录', data: null });
        }

        if (validationError) {
            return res.json({ code: 400, message: validationError, data: null });
        }

        const supervisor = await getUserById(actor.id);
        if (!supervisor) {
            return res.json({ code: 403, message: '当前账号无权填写听课记录', data: null });
        }

        let teacherInfo;
        try {
            teacherInfo = await resolveTeacher(req.body.teacherId || formData.teacherId, formData.teacherName);
        } catch (error) {
            return res.json({ code: 400, message: error.message, data: null });
        }

        const finalFormData = {
            ...formData,
            teacherId: teacherInfo.teacherId,
            teacherName: teacherInfo.teacherName
        };

        const includeFormData = await hasObservationFormDataColumn();
        const payload = buildObservationInsertPayload(
            supervisor,
            supervisorName,
            teacherInfo,
            finalFormData,
            includeFormData
        );
        const placeholders = payload.columns.map(() => '?').join(', ');
        const id = await insert(
            `INSERT INTO observations (${payload.columns.map(column => `\`${column}\``).join(', ')}) VALUES (${placeholders})`,
            payload.values
        );

        res.json({ code: 0, message: '创建成功', data: { id } });
    } catch (err) {
        console.error('创建听课记录失败:', err);
        res.json({ code: -1, message: '创建失败，请重试', data: null });
    }
});

/**
 * GET /api/observation/list
 * 获取听课记录列表
 * Query: userId, userRole, filter, limit, skip
 */
router.get('/list', async (req, res) => {
    try {
        const actor = getActor(req);
        if (!actor) {
            return unauthorized(res);
        }

        const {
            filter = 'all',
            limit = 20,
            skip = 0
        } = req.query;
        const userId = actor.id;
        const queryLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
        const querySkip = Math.max(0, Number(skip) || 0);

        let whereClauses = [];
        let params = [];

        switch (filter) {
            case 'my':
                if (!hasRole(actor, 'supervisor')) {
                    return res.json({ code: 403, message: '只有听课老师可以查看我填写的记录', data: null });
                }
                whereClauses.push('supervisor_id = ?');
                params.push(userId);
                break;
            case 'about':
                if (!hasRole(actor, 'teacher')) {
                    return res.json({ code: 403, message: '只有被听课教师可以查看关于我的记录', data: null });
                }
                whereClauses.push('teacher_id = ?');
                params.push(userId);
                break;
            case 'pending':
                if (!hasAnyRole(actor, ['college', 'supervisor', 'admin'])) {
                    return res.json({ code: 403, message: '只有高教中心、督导或管理员可以查看待审核记录', data: null });
                }
                whereClauses.push("status = 'pending'");
                break;
            case 'audit':
                if (!hasAnyRole(actor, ['college', 'supervisor', 'admin'])) {
                    return res.json({ code: 403, message: '只有高教中心、督导或管理员可以查看已审核记录', data: null });
                }
                whereClauses.push("status IN ('approved','rejected')");
                break;
            case 'college':
                if (hasRole(actor, 'college')) {
                    const userRows = await query('SELECT department FROM users WHERE id = ?', [userId]);
                    if (userRows.length > 0 && userRows[0].department) {
                        const teacherRows = await query('SELECT id FROM users WHERE role = ? AND department = ?', ['teacher', userRows[0].department]);
                        const teacherIds = teacherRows.map(t => t.id);
                        if (teacherIds.length === 0) {
                            return res.json({ code: 0, message: '获取成功', data: { list: [], total: 0, limit: queryLimit, skip: querySkip } });
                        }
                        whereClauses.push(`teacher_id IN (${teacherIds.map(() => '?').join(',')})`);
                        params.push(...teacherIds);
                    } else {
                        return res.json({ code: 0, message: '获取成功', data: { list: [], total: 0, limit: queryLimit, skip: querySkip } });
                    }
                } else {
                    return res.json({ code: 403, message: '只有高教中心可以按学院查看记录', data: null });
                }
                break;
            case 'all':
                if (hasAnyRole(actor, ['college', 'supervisor', 'admin'])) {
                    whereClauses.push("status IN ('pending','approved','rejected')");
                } else if (hasRole(actor, 'teacher')) {
                    whereClauses.push('teacher_id = ?');
                    params.push(userId);
                } else {
                    return res.json({ code: 403, message: '无权限查看听课记录', data: null });
                }
                break;
            case 'mine_all':
                if (hasRole(actor, 'supervisor')) {
                    whereClauses.push('supervisor_id = ?');
                    params.push(userId);
                } else {
                    return res.json({ code: 403, message: '只有督导可以查看我创建的全部记录', data: null });
                }
                break;
            default:
                return res.json({ code: 400, message: '无效的筛选条件', data: null });
        }

        const whereSQL = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

        const list = await query(
            `SELECT * FROM observations ${whereSQL} ORDER BY create_time DESC LIMIT ${queryLimit} OFFSET ${querySkip}`,
            params
        );

        const countResult = await query(
            `SELECT COUNT(*) as total FROM observations ${whereSQL}`,
            params
        );

        const camelList = list.map(item => toCamelCase(attachObservationFormData(item)));

        res.json({
            code: 0,
            message: '获取成功',
            data: { list: camelList, total: countResult[0].total, limit: queryLimit, skip: querySkip }
        });
    } catch (err) {
        console.error('获取听课记录列表失败:', err);
        res.json({ code: -1, message: '获取失败，请重试', data: null });
    }
});

/**
 * GET /api/observation/detail/:id
 */
router.get('/detail/:id', async (req, res) => {
    try {
        const actor = getActor(req);
        if (!actor) {
            return unauthorized(res);
        }

        const rows = await query('SELECT * FROM observations WHERE id = ?', [req.params.id]);
        if (rows.length === 0) {
            return res.json({ code: 404, message: '记录不存在', data: null });
        }

        const record = rows[0];
        const canView = Number(record.supervisor_id) === Number(actor.id)
            || Number(record.teacher_id) === Number(actor.id)
            || hasAnyRole(actor, ['college', 'supervisor', 'admin']);

        if (!canView) {
            return res.json({ code: 403, message: '该听课记录仅听课老师、被听课老师和高教中心可见', data: null });
        }

        attachObservationFormData(record);

        res.json({ code: 0, message: '获取成功', data: toCamelCase(record) });
    } catch (err) {
        console.error('获取听课记录详情失败:', err);
        res.json({ code: -1, message: '获取失败，请重试', data: null });
    }
});

/**
 * PUT /api/observation/update/:id
 */
router.put('/update/:id', async (req, res) => {
    try {
        const actor = getActor(req);
        if (!actor) {
            return unauthorized(res);
        }

        const { userId, ...updateData } = req.body;
        const recordId = req.params.id;

        const rows = await query('SELECT * FROM observations WHERE id = ?', [recordId]);
        if (rows.length === 0) {
            return res.json({ code: 404, message: '记录不存在', data: null });
        }

        const record = rows[0];
        if (Number(record.supervisor_id) !== Number(actor.id) || !hasRole(actor, 'supervisor')) {
            return res.json({ code: 403, message: '只有创建者可以修改', data: null });
        }
        if (record.status !== 'rejected') {
            return res.json({ code: -1, message: '只有驳回状态的记录可以修改', data: null });
        }

        attachObservationFormData(record);
        const mergedFormData = buildObservationFormData(updateData, record);
        const validationError = validateObservationForm(mergedFormData);
        if (validationError) {
            return res.json({ code: 400, message: validationError, data: null });
        }

        const teacherIdForResolve = shouldPreferTeacherName(updateData, record)
            ? 0
            : (updateData.teacherId || mergedFormData.teacherId);

        let teacherInfo;
        try {
            teacherInfo = await resolveTeacher(teacherIdForResolve, mergedFormData.teacherName);
        } catch (error) {
            return res.json({ code: 400, message: error.message, data: null });
        }

        const finalFormData = {
            ...mergedFormData,
            teacherId: teacherInfo.teacherId,
            teacherName: teacherInfo.teacherName
        };

        const includeFormData = await hasObservationFormDataColumn();
        const payload = buildObservationUpdatePayload(teacherInfo, finalFormData, recordId, includeFormData);
        await query(payload.sql, payload.values);

        res.json({ code: 0, message: '更新成功', data: null });
    } catch (err) {
        console.error('更新听课记录失败:', err);
        res.json({ code: -1, message: '更新失败，请重试', data: null });
    }
});

/**
 * POST /api/observation/audit
 */
router.post('/audit', async (req, res) => {
    try {
        const actor = getActor(req);
        if (!actor) {
            return unauthorized(res);
        }

        const { recordId, reviewerId, reviewerName, approved, comment } = req.body;

        if (!recordId || !reviewerId || approved === undefined) {
            return res.json({ code: 400, message: '参数不完整', data: null });
        }

        if (!hasAnyRole(actor, ['college', 'admin']) || Number(reviewerId) !== Number(actor.id)) {
            return res.json({ code: 403, message: '只有高教中心或管理员可以审核听课记录', data: null });
        }

        const rows = await query('SELECT * FROM observations WHERE id = ?', [recordId]);
        if (rows.length === 0) {
            return res.json({ code: 404, message: '记录不存在', data: null });
        }

        if (rows[0].status !== 'pending') {
            return res.json({ code: -1, message: '该记录已审核', data: null });
        }

        await query(
            `UPDATE observations SET status = ?, reviewer_id = ?, reviewer_name = ?, review_comment = ?, review_time = NOW() WHERE id = ?`,
            [approved ? 'approved' : 'rejected', actor.id, (await getUserById(actor.id))?.name || reviewerName || '', comment || '', recordId]
        );

        res.json({ code: 0, message: approved ? '审核通过' : '已驳回', data: null });
    } catch (err) {
        console.error('审核听课记录失败:', err);
        res.json({ code: -1, message: '审核失败，请重试', data: null });
    }
});

/**
 * GET /api/observation/stats
 */
router.get('/stats', async (req, res) => {
    try {
        const actor = getActor(req);
        if (!actor) {
            return unauthorized(res);
        }

        const userId = actor.id;
        let myObservations = 0;
        let myImprovements = 0;
        let pendingObservations = 0;
        let pendingImprovements = 0;

        if (hasRole(actor, 'supervisor')) {
            const r1 = await query('SELECT COUNT(*) as c FROM observations WHERE supervisor_id = ?', [userId]);
            myObservations = r1[0].c;
        } else if (hasRole(actor, 'teacher')) {
            const r1 = await query('SELECT COUNT(*) as c FROM observations WHERE teacher_id = ?', [userId]);
            myObservations = r1[0].c;
        }

        if (hasAnyRole(actor, ['college', 'admin'])) {
            const r2 = await query("SELECT COUNT(*) as c FROM observations WHERE status = 'pending'");
            pendingObservations = r2[0].c;
        }

        if (hasRole(actor, 'teacher')) {
            const r3 = await query('SELECT COUNT(*) as c FROM improvements WHERE teacher_id = ?', [userId]);
            myImprovements = r3[0].c;
        }

        if (hasAnyRole(actor, ['college', 'supervisor', 'department_leader', 'admin'])) {
            const r4 = await query("SELECT COUNT(*) as c FROM improvements WHERE stage IN ('submitted','college_check','supervisor_review','revising')");
            pendingImprovements = r4[0].c;
        }

        res.json({
            code: 0,
            message: '获取成功',
            data: { myObservations, myImprovements, pendingObservations, pendingImprovements }
        });
    } catch (err) {
        console.error('获取统计数据失败:', err);
        res.json({ code: -1, message: '获取失败', data: null });
    }
});

module.exports = router;
