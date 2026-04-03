/**
 * 数据库工具函数
 * 云函数公共模块
 */

const db = wx.cloud.database();

/**
 * 获取集合引用
 */
function getCollection(name) {
  return db.collection(name);
}

/**
 * 根据openid获取用户
 */
async function getUserByOpenid(openid) {
  try {
    const result = await getCollection('users').where({
      openid
    }).get();

    if (result.data.length > 0) {
      return result.data[0];
    }
    return null;
  } catch (err) {
    console.error('获取用户失败:', err);
    throw err;
  }
}

/**
 * 创建用户
 */
async function createUser(userData) {
  try {
    const result = await getCollection('users').add({
      data: {
        ...userData,
        createTime: new Date(),
        updateTime: new Date()
      }
    });
    return { _id: result._id, ...userData };
  } catch (err) {
    console.error('创建用户失败:', err);
    throw err;
  }
}

/**
 * 更新用户信息
 */
async function updateUser(userId, updateData) {
  try {
    await getCollection('users').doc(userId).update({
      data: {
        ...updateData,
        updateTime: new Date()
      }
    });
    return true;
  } catch (err) {
    console.error('更新用户失败:', err);
    throw err;
  }
}

/**
 * 添加文档
 */
async function addDoc(collectionName, data) {
  try {
    const result = await getCollection(collectionName).add({
      data: {
        ...data,
        createTime: new Date(),
        updateTime: new Date()
      }
    });
    return result._id;
  } catch (err) {
    console.error(`添加文档失败 [${collectionName}]:`, err);
    throw err;
  }
}

/**
 * 更新文档
 */
async function updateDoc(collectionName, docId, data) {
  try {
    await getCollection(collectionName).doc(docId).update({
      data: {
        ...data,
        updateTime: new Date()
      }
    });
    return true;
  } catch (err) {
    console.error(`更新文档失败 [${collectionName}]:`, err);
    throw err;
  }
}

/**
 * 获取文档详情
 */
async function getDoc(collectionName, docId) {
  try {
    const result = await getCollection(collectionName).doc(docId).get();
    return result.data;
  } catch (err) {
    console.error(`获取文档失败 [${collectionName}]:`, err);
    throw err;
  }
}

/**
 * 查询文档列表
 */
async function getDocList(collectionName, condition = {}, limit = 20, skip = 0, orderBy = null) {
  try {
    let query = getCollection(collectionName);

    if (Object.keys(condition).length > 0) {
      query = query.where(condition);
    }

    if (orderBy) {
      query = query.orderBy(orderBy.field, orderBy.direction || 'desc');
    }

    const result = await query
      .limit(limit)
      .skip(skip)
      .get();

    return result.data;
  } catch (err) {
    console.error(`查询文档列表失败 [${collectionName}]:`, err);
    throw err;
  }
}

/**
 * 统计文档数量
 */
async function countDocs(collectionName, condition = {}) {
  try {
    let query = getCollection(collectionName);

    if (Object.keys(condition).length > 0) {
      query = query.where(condition);
    }

    const result = await query.count();
    return result.total;
  } catch (err) {
    console.error(`统计文档数量失败 [${collectionName}]:`, err);
    throw err;
  }
}

module.exports = {
  db,
  getCollection,
  getUserByOpenid,
  createUser,
  updateUser,
  addDoc,
  updateDoc,
  getDoc,
  getDocList,
  countDocs
};
