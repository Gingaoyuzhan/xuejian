/**
 * 工具函数
 */
const VALID_ROLES = ['supervisor', 'teacher', 'admin', 'college', 'department_leader'];
const ROLE_PRIORITY = ['admin', 'college', 'supervisor', 'department_leader', 'teacher'];

/**
 * 将 snake_case 字段名转换为 camelCase
 * 例: supervisor_name → supervisorName, create_time → createTime
 */
function snakeToCamel(str) {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * 将对象的所有 key 从 snake_case 转换为 camelCase
 * @param {Object} obj - 输入对象
 * @returns {Object} 转换后的对象
 */
function toCamelCase(obj) {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) return obj.map(item => toCamelCase(item));
    if (typeof obj !== 'object' || obj instanceof Date) return obj;

    const result = {};
    for (const key of Object.keys(obj)) {
        const camelKey = snakeToCamel(key);
        const value = obj[key];

        // 递归处理嵌套对象/数组，但排除 JSON 已解析的数组
        if (value !== null && typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value)) {
            result[camelKey] = toCamelCase(value);
        } else {
            result[camelKey] = value;
        }
    }
    return result;
}

/**
 * 解析 MySQL 返回的 JSON 字段
 * @param {Object} row - 数据行
 * @param {string[]} fields - 需要解析的字段名
 */
function parseJsonFields(row, fields) {
    fields.forEach(field => {
        if (typeof row[field] === 'string') {
            try { row[field] = JSON.parse(row[field]); } catch (e) { row[field] = []; }
        }
        if (row[field] === null || row[field] === undefined) {
            row[field] = [];
        }
    });
}

function normalizeRoles(source, fallbackRole = '') {
    let roles = [];

    if (Array.isArray(source)) {
        roles = source;
    } else if (typeof source === 'string') {
        try {
            const parsed = JSON.parse(source);
            roles = Array.isArray(parsed) ? parsed : [source];
        } catch (err) {
            roles = [source];
        }
    } else if (source && typeof source === 'object') {
        roles = []
            .concat(Array.isArray(source.roles) ? source.roles : [])
            .concat(source.role ? [source.role] : []);
    }

    if (fallbackRole) {
        roles.push(fallbackRole);
    }

    return [...new Set(
        roles
            .map(item => String(item || '').trim())
            .filter(item => VALID_ROLES.includes(item))
    )];
}

function hasRole(source, role) {
    return normalizeRoles(source).includes(role);
}

function hasAnyRole(source, roles = []) {
    const ownedRoles = normalizeRoles(source);
    return roles.some(role => ownedRoles.includes(role));
}

function getPrimaryRole(source, fallbackRole = '') {
    const roles = normalizeRoles(source, fallbackRole);
    return ROLE_PRIORITY.find(role => roles.includes(role)) || roles[0] || '';
}

module.exports = {
    toCamelCase,
    parseJsonFields,
    normalizeRoles,
    hasRole,
    hasAnyRole,
    getPrimaryRole,
    VALID_ROLES,
    ROLE_PRIORITY
};
