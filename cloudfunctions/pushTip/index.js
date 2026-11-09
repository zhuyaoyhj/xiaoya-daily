// cloudfunctions/pushTip/index.js
// 推送相关云函数
//   action = subscribe  记录用户的订阅意图（模板 ID / 推送对象）
//   action = send       按模板向指定 openid 发送订阅消息
//
// 微信限制：订阅消息是「一次授权一次下发」，用户每点一次授权只能收到一条。
// 所以日常实现里通常是：用户点「开启每日提醒」→ 授权一条 → 次日下发 → 再次引导授权。

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const COLLECTION = 'xyd_push_subscriptions';

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (e) {
    // 已存在则忽略
  }
}

exports.main = async function (event) {
  const e = event || {};
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    await ensureCollection(COLLECTION);
    const col = db.collection(COLLECTION);

    if (e.action === 'subscribe') {
      const data = {
        openid: openid,
        tmplIds: Array.isArray(e.tmplIds) ? e.tmplIds : [],
        targets: Array.isArray(e.targets)
          ? e.targets.map(function (t) {
              return { name: t.name, relation: t.relation };
            })
          : [],
        enabled: true,
        updatedAt: db.serverDate()
      };

      const exist = await col.where({ openid: openid }).get();
      if (exist.data && exist.data.length) {
        await col.doc(exist.data[0]._id).update({ data: data });
      } else {
        await col.add({ data: data });
      }
      return { ok: true, openid: openid };
    }

    if (e.action === 'send') {
      if (!e.templateId) return { ok: false, error: 'NO_TEMPLATE' };

      const targetOpenids = Array.isArray(e.openids) ? e.openids : [openid];
      const results = [];

      for (let i = 0; i < targetOpenids.length; i++) {
        try {
          const res = await cloud.openapi.subscribeMessage.send({
            touser: targetOpenids[i],
            templateId: e.templateId,
            page: e.page || 'pages/index/index',
            miniprogramState: e.miniprogramState || 'formal',
            data: e.data || {}
          });
          results.push({ openid: targetOpenids[i], ok: true, errcode: res.errCode });
        } catch (err) {
          results.push({ openid: targetOpenids[i], ok: false, error: err.errCode || err.message });
        }
      }

      return { ok: true, results: results };
    }

    return { ok: false, error: 'UNKNOWN_ACTION' };
  } catch (err) {
    console.error('[pushTip] 失败：', err && err.message);
    return { ok: false, error: (err && err.message) || 'UNKNOWN' };
  }
};
