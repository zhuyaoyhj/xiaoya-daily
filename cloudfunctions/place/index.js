// cloudfunctions/place/index.js
// 地点服务代理：腾讯位置服务 WebService
//   action = search   关键词搜小区/POI（suggestion）
//   action = geocode  坐标反查地址（逆地理编码，用于「用当前位置」自动补全区和小区）
//
// Key 配置方式（二选一）：
//   1. 云开发控制台 → 云函数 → place → 配置 → 环境变量：TMAP_KEY = 你的 key
//   2. 直接把 key 写进下面的 TMAP_KEY 常量（不推荐，仅本地调试用）
// 未配置 key 时返回 { ok:false, error:'NO_KEY' }，小程序端会自动降级到微信地图选点 / 手填。

const cloud = require('wx-server-sdk');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const TMAP_KEY = process.env.TMAP_KEY || '';

function getJson(url) {
  return new Promise(function (resolve, reject) {
    const req = https.get(url, { timeout: 8000 }, function (res) {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        reject(new Error('HTTP_' + res.statusCode));
        return;
      }
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', function (chunk) {
        buf += chunk;
      });
      res.on('end', function () {
        try {
          resolve(JSON.parse(buf));
        } catch (e) {
          reject(new Error('BAD_JSON'));
        }
      });
    });
    req.on('timeout', function () {
      req.destroy(new Error('TIMEOUT'));
    });
    req.on('error', reject);
  });
}

exports.main = async function (event) {
  const e = event || {};

  if (!TMAP_KEY) {
    return { ok: false, error: 'NO_KEY' };
  }

  try {
    if (e.action === 'geocode') {
      const lat = Number(e.lat);
      const lon = Number(e.lon);
      if (!isFinite(lat) || !isFinite(lon)) return { ok: false, error: 'NO_COORDS' };

      const url =
        'https://apis.map.qq.com/ws/geocoder/v1/?location=' +
        lat +
        ',' +
        lon +
        '&get_poi=0&key=' +
        TMAP_KEY;

      const json = await getJson(url);
      if (json.status !== 0) {
        return { ok: false, error: json.message || 'TMAP_' + json.status };
      }

      const r = json.result || {};
      const comp = r.address_component || {};
      const fmt = r.formatted_addresses || {};

      return {
        ok: true,
        data: {
          name: fmt.recommend || fmt.rough || '',
          address: r.address || '',
          district: comp.district || '',
          city: comp.city || '',
          lat: lat,
          lon: lon
        }
      };
    }

    // 默认：关键词搜小区
    const keyword = String(e.keyword || '').trim();
    if (!keyword) return { ok: false, error: 'EMPTY_KEYWORD' };

    const region = String(e.region || '北京');
    const url =
      'https://apis.map.qq.com/ws/place/v1/suggestion/?keyword=' +
      encodeURIComponent(keyword) +
      '&region=' +
      encodeURIComponent(region) +
      '&region_fix=0&page_size=10&key=' +
      TMAP_KEY;

    const json = await getJson(url);
    if (json.status !== 0) {
      return { ok: false, error: json.message || 'TMAP_' + json.status };
    }

    const list = (json.data || []).map(function (item) {
      const loc = item.location || {};
      const ad = item.ad_info || {};
      return {
        title: item.title || '',
        address: item.address || '',
        category: item.category || '',
        district: ad.district || '',
        lat: loc.lat,
        lon: loc.lng
      };
    });

    return { ok: true, list: list };
  } catch (err) {
    console.error('[place] 失败：', err && err.message);
    return { ok: false, error: (err && err.message) || 'UNKNOWN' };
  }
};
