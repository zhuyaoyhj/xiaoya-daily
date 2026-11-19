// utils/backup-file.js
// 备份文件：写到小程序用户目录 → 用「发送给朋友」转给文件传输助手；恢复时从聊天记录里选回来。
// 内容和剪贴板备份完全相同（XYD1: + JSON），两种方式互通。

const FILE_PREFIX = '小芽日常备份-';

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

/** 「小芽日常备份-20261119-1530.txt」：带时间，同一天备份多次也不会互相覆盖 */
function fileName(now) {
  const d = now ? new Date(now) : new Date();
  return (
    FILE_PREFIX +
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    '-' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    '.txt'
  );
}

/** 能不能走文件方式（PC 端、低版本基础库没有 shareFileMessage / chooseMessageFile） */
function supported() {
  return (
    typeof wx !== 'undefined' &&
    typeof wx.getFileSystemManager === 'function' &&
    typeof wx.shareFileMessage === 'function' &&
    typeof wx.chooseMessageFile === 'function' &&
    !!(wx.env && wx.env.USER_DATA_PATH)
  );
}

/** 写文件 → 唤起转发。必须在用户点击的同一轮里调用（shareFileMessage 的限制） */
function exportToChat(text, now) {
  return new Promise(function (resolve, reject) {
    const name = fileName(now);
    const filePath = wx.env.USER_DATA_PATH + '/' + name;
    try {
      wx.getFileSystemManager().writeFileSync(filePath, text, 'utf8');
    } catch (e) {
      reject(new Error('WRITE_FAIL'));
      return;
    }
    wx.shareFileMessage({
      filePath: filePath,
      fileName: name,
      success: function () {
        resolve({ name: name, path: filePath });
      },
      fail: function (err) {
        const msg = (err && err.errMsg) || '';
        reject(new Error(/cancel/.test(msg) ? 'CANCEL' : 'SHARE_FAIL'));
      }
    });
  });
}

/** 从聊天记录选一个备份文件，读出文本 */
function pickFromChat() {
  return new Promise(function (resolve, reject) {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['txt'],
      success: function (res) {
        const f = res && res.tempFiles && res.tempFiles[0];
        if (!f) {
          reject(new Error('NO_FILE'));
          return;
        }
        try {
          const text = wx.getFileSystemManager().readFileSync(f.path, 'utf8');
          resolve({ text: text, name: f.name || '' });
        } catch (e) {
          reject(new Error('READ_FAIL'));
        }
      },
      fail: function (err) {
        const msg = (err && err.errMsg) || '';
        reject(new Error(/cancel/.test(msg) ? 'CANCEL' : 'PICK_FAIL'));
      }
    });
  });
}

module.exports = {
  FILE_PREFIX: FILE_PREFIX,
  fileName: fileName,
  supported: supported,
  exportToChat: exportToChat,
  pickFromChat: pickFromChat
};
