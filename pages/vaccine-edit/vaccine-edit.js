// pages/vaccine-edit/vaccine-edit.js
const store = require('../../utils/store.js');
const track = require('../../utils/track.js').track;
const vaccine = require('../../utils/vaccine.js');
const dateUtil = require('../../utils/date.js');

Page({
  data: {
    isEdit: false,
    id: '',
    category: 'free',
    list: [],
    selectedId: '',
    selected: null,
    doses: [],
    dose: 1,
    date: '',
    place: '',
    note: '',
    today: '',
    maxDate: '',
    isFuture: false,
    babyName: '',
    canSave: false,
    before: [],
    commonReactions: [],
    // 自定义疫苗浮层
    sheet: false,
    cName: '',
    cDoses: 2,
    cNote: '',
    customList: [],
    doseOptions: [1, 2, 3, 4, 5, 6]
  },

  onLoad(opts) {
    const options = opts || {};
    // 从首页到期提醒 / 疫苗页规划表进来的会带 vaccineId
    this._via = options.from || (options.vaccineId ? 'plan' : 'manual');
    const baby = store.getActiveBaby();
    if (!baby) {
      wx.showToast({ title: '请先添加宝宝', icon: 'none' });
      setTimeout(function () {
        wx.navigateBack();
      }, 800);
      return;
    }

    const today = dateUtil.todayStr();
    // 日期可选到今天往后一年，未来日期会自动进入「待安排疫苗」
    const max = new Date();
    max.setDate(max.getDate() + 365);

    const doseMap = store.getDoseMap(baby.id);
    const base = {
      today: today,
      maxDate:
        max.getFullYear() + '-' + dateUtil.pad(max.getMonth() + 1) + '-' + dateUtil.pad(max.getDate()),
      babyName: baby.name || '宝宝',
      date: today
    };

    // 编辑已有记录
    if (options.id) {
      const all = store.getVaccineRecords(baby.id);
      let rec = null;
      for (let i = 0; i < all.length; i++) {
        if (all[i].id === options.id) {
          rec = all[i];
          break;
        }
      }
      if (rec) {
        const v = vaccine.getVaccine(rec.vaccineId);
        this.setData(
          Object.assign(base, {
            isEdit: true,
            id: rec.id,
            category: v ? v.category : 'free',
            selectedId: rec.vaccineId,
            dose: rec.dose || 1,
            date: rec.date || today,
            isFuture: (rec.date || today) > today,
            place: rec.place || '',
            note: rec.note || ''
          })
        );
        this.applyVaccine(rec.vaccineId, rec.dose, doseMap);
        wx.setNavigationBarTitle({ title: '编辑接种记录' });
        return;
      }
    }

    this.setData(base);

    // 从「该打了」带过来的疫苗
    if (options.vaccineId) {
      const v = vaccine.getVaccine(options.vaccineId);
      if (v) {
        this.setData({ category: v.category });
        this.applyVaccine(options.vaccineId, Number(options.dose) || 1, doseMap);
      }
    } else {
      this.applyVaccine('', 1, doseMap);
    }
  },

  /** 切换分类，顺便刷新疫苗列表 */
  applyVaccine(vaccineId, dose, doseMap) {
    const map = doseMap || store.getDoseMap(store.getActiveBaby().id);
    const category = this.data.category;
    const list = vaccine.listVaccines(category).map(function (v) {
      const total = v.doses.length;
      let done = 0;
      for (let i = 1; i <= total; i++) {
        if (map[v.id + '#' + i]) done++;
      }
      return {
        id: v.id,
        name: v.name,
        short: v.short,
        emoji: v.emoji,
        doses: total,
        custom: !!v.custom,
        doneText: done ? done + '/' + total + ' 剂' : total + ' 剂'
      };
    });

    const v = vaccineId ? vaccine.getVaccine(vaccineId) : null;
    const doses = v
      ? v.doses.map(function (d) {
          return {
            n: d.n,
            label: d.label,
            done: !!map[v.id + '#' + d.n]
          };
        })
      : [];

    this.setData({
      list: list,
      selectedId: vaccineId || '',
      selected: v
        ? {
            id: v.id,
            name: v.name,
            emoji: v.emoji,
            route: v.route,
            site: v.site,
            category: v.category
          }
        : null,
      doses: doses,
      dose: dose || 1,
      canSave: !!v,
      before: v ? (v.before || []) : [],
      commonReactions: v ? (v.reactions || []).map(function (r) { return r.name; }) : []
    });
  },

  switchCategory(e) {
    const cat = e.currentTarget.dataset.cat;
    if (cat === this.data.category) return;
    this.setData({ category: cat, selectedId: '', selected: null, doses: [], canSave: false });
    this.applyVaccine('', 1, null);
  },

  pickVaccine(e) {
    const id = e.currentTarget.dataset.id;
    const map = store.getDoseMap(store.getActiveBaby().id);

    // 默认选中下一个还没打的剂次
    const v = vaccine.getVaccine(id);
    let next = 1;
    for (let i = 0; i < v.doses.length; i++) {
      if (!map[id + '#' + v.doses[i].n]) {
        next = v.doses[i].n;
        break;
      }
      next = v.doses[i].n;
    }
    this.applyVaccine(id, next, map);
  },

  pickDose(e) {
    const n = Number(e.currentTarget.dataset.n);
    this.setData({ dose: n });
  },

  onDate(e) {
    const date = e.detail.value;
    this.setData({ date: date, isFuture: date > this.data.today });
  },

  onPlace(e) {
    this.setData({ place: e.detail.value });
  },

  onNote(e) {
    this.setData({ note: e.detail.value });
  },

  save() {
    if (!this.data.canSave) {
      wx.showToast({ title: '先选一种疫苗', icon: 'none' });
      return;
    }

    const baby = store.getActiveBaby();
    if (!baby) return;

    const future = this.data.date > this.data.today;

    if (!this.data.isEdit) track('vax_log', { via: this._via || 'manual' });
    store.upsertVaccineRecord({
      id: this.data.id || undefined,
      babyId: baby.id,
      vaccineId: this.data.selectedId,
      dose: this.data.dose,
      date: this.data.date,
      place: (this.data.place || '').trim(),
      note: (this.data.note || '').trim()
    });

    wx.showToast({
      title: future ? '已加入待安排' : this.data.isEdit ? '已更新' : '已记录',
      icon: 'success'
    });
    setTimeout(function () {
      wx.navigateBack();
    }, 700);
  },

  remove() {
    const that = this;
    wx.showModal({
      title: '删除这条记录',
      content: '删除后护理提醒会换成上一条记录，确定删吗？',
      confirmText: '删除',
      confirmColor: '#D9603F',
      success(res) {
        if (!res.confirm) return;
        store.removeVaccineRecord(that.data.id);
        wx.showToast({ title: '已删除', icon: 'none' });
        setTimeout(function () {
          wx.navigateBack();
        }, 500);
      }
    });
  },

  /* ---------- 自定义疫苗 ---------- */

  openSheet() {
    this.setData({
      sheet: true,
      cName: '',
      cDoses: 2,
      cNote: '',
      customList: store.getCustomVaccines()
    });
  },

  closeSheet() {
    this.setData({ sheet: false });
  },

  /** 阻止浮层上的点击冒泡到遮罩 */
  noop() {},

  onCName(e) {
    this.setData({ cName: e.detail.value });
  },

  onCNote(e) {
    this.setData({ cNote: e.detail.value });
  },

  pickDoses(e) {
    this.setData({ cDoses: Number(e.currentTarget.dataset.n) });
  },

  saveCustom() {
    const name = (this.data.cName || '').trim();
    if (!name) {
      wx.showToast({ title: '先填疫苗名称', icon: 'none' });
      return;
    }

    const item = store.addCustomVaccine({
      name: name,
      doses: this.data.cDoses,
      note: (this.data.cNote || '').trim()
    });
    if (!item) {
      wx.showToast({ title: '保存失败，换个名字试试', icon: 'none' });
      return;
    }

    const baby = store.getActiveBaby();
    const map = baby ? store.getDoseMap(baby.id) : {};
    this.setData({ sheet: false, category: 'paid' });
    this.applyVaccine(item.id, 1, map);
    wx.showToast({ title: '已添加', icon: 'success' });
  },

  removeCustom(e) {
    const id = e.currentTarget.dataset.id;
    const that = this;
    const list = this.data.customList || [];
    let target = null;
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        target = list[i];
        break;
      }
    }
    if (!target) return;

    const used = store.getVaccineRecords(store.getActiveBaby().id).filter(function (r) {
      return r.vaccineId === id;
    }).length;

    wx.showModal({
      title: '删除「' + target.name + '」',
      content: used ? '这个疫苗已有 ' + used + ' 条接种记录，删除会一并清除。确定删除吗？' : '删除后可以重新添加。确定删除吗？',
      confirmText: '删除',
      confirmColor: '#D9603F',
      success(res) {
        if (!res.confirm) return;
        store.removeCustomVaccine(id);
        const baby = store.getActiveBaby();
        that.setData({ customList: store.getCustomVaccines() });
        if (that.data.selectedId === id) {
          that.setData({ selectedId: '', selected: null, doses: [], canSave: false });
        }
        that.applyVaccine(that.data.selectedId, that.data.dose, baby ? store.getDoseMap(baby.id) : {});
        wx.showToast({ title: '已删除', icon: 'none' });
      }
    });
  }
});
