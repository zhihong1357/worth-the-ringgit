// 持仓成本引擎：纯函数，无依赖，浏览器和 Node 通用。
(function (root) {
  const DATA = typeof module !== 'undefined' ? require('./data.js') : root.HC_DATA;

  function retention(curve, age) {
    if (age <= 0) return 1;
    const last = curve.length - 1;
    if (age >= last) return curve[last];
    const lo = Math.floor(age), f = age - lo;
    return curve[lo] * (1 - f) + curve[lo + 1] * f;
  }

  function defaultAsset(key) {
    const s = DATA.presets[key];
    return { preset: key, price: 5999, discount: 0, usedPremium: DATA.defaults.usedPremium, runFixed: 0,
      curve: s.curve.slice(), band: s.band, life: s.life, sellFee: s.sellFee, runPct: s.runPct, ageGrowth: s.ageGrowth,
      refurb: s.refurb, refurbAge: s.refurbAge, hours: s.hours, taxType: s.tax };
  }

  function defaultProfile() {
    return { rate: DATA.defaults.rate, goal: 'cash', maxUpfront: 0,
      card: { type: 'none', rate: 0, cap: 0, instMonths: 0, eppRewards: false },
      personal: { rate: 0, reliefLeft: DATA.tax.lifestyleReliefCap },
      company: { has: false, rate: 17, controlling: true },
      used: { ok: true, maxAge: null } };
  }

  // 用户条件决定哪些购买路径可行
  function paths(asset, profile) {
    const list = [{ id: 'cash', label: '个人付现', payer: 'personal', cashback: false, inst: 0 }];
    if (profile.card.type !== 'none') {
      if (profile.card.rate > 0) list.push({ id: 'card', label: '个人刷卡一次付清', payer: 'personal', cashback: true, inst: 0 });
      if (profile.card.instMonths > 0) list.push({ id: 'inst', label: `个人刷卡 0% 分期 ${profile.card.instMonths} 个月`, payer: 'personal', cashback: !!profile.card.eppRewards, inst: profile.card.instMonths });
    }
    if (profile.company.has && asset.taxType !== 'none') list.push({ id: 'company', label: '公司买入并申报资本津贴', payer: 'company', cashback: false, inst: 0 });
    return list;
  }

  function evaluate(asset, profile, path, buyAge, hold) {
    const p = asset, i = profile.rate / 100, d = t => Math.pow(1 + i, -t), isNew = buyAge === 0;
    if (!isNew && (path.id === 'card' || path.id === 'inst')) return null;   // 二手私人交易刷不了卡
    const buy = isNew ? p.price * (1 - p.discount / 100) : p.price * retention(p.curve, buyAge) * (1 + p.usedPremium / 100);
    const saleGross = p.price * retention(p.curve, buyAge + hold);
    const saleNet = saleGross * (1 - p.sellFee / 100);
    const parts = { buy, run: 0, refurb: 0, cashback: 0, finance: 0, sale: 0, tax: 0 }, warnings = [];
    let npv = buy;

    if (path.cashback) {
      const raw = buy * profile.card.rate / 100;
      parts.cashback = profile.card.cap > 0 ? Math.min(raw, profile.card.cap) : raw;
      npv -= parts.cashback;
    }
    if (path.inst > 0 && i > 0) {
      const m = i / 12; let pv = 0;
      for (let k = 1; k <= path.inst; k++) pv += (buy / path.inst) * Math.pow(1 + m, -k);
      parts.finance = buy - pv; npv -= parts.finance;
    }
    for (let t = 1; t <= hold; t++) {
      const c = (p.runFixed + p.price * p.runPct / 100 * (1 + p.ageGrowth / 100 * (buyAge + t - 1))) * d(t);
      parts.run += c; npv += c;
    }
    if (p.refurb > 0 && p.refurbAge >= Math.max(buyAge, 1) && p.refurbAge < buyAge + hold) {
      parts.refurb = p.refurb * d(p.refurbAge - buyAge); npv += parts.refurb;
    }
    parts.sale = saleNet * d(hold); npv -= parts.sale;

    const T = DATA.tax;
    if (path.payer === 'personal') {
      if (p.taxType === 'ict' && isNew && profile.personal.rate > 0 && profile.personal.reliefLeft > 0) {
        parts.tax = Math.min(profile.personal.reliefLeft, T.lifestyleReliefCap, buy) * profile.personal.rate / 100 * d(1);
        npv -= parts.tax;
      }
    } else {
      const rule = T.ca[p.taxType];
      if (hold < T.clawbackYears) warnings.push('持有不足两年：已批的资本津贴会被追回（Schedule 3 第 71 段），税盾按 0 计算。');
      else {
        const qe = p.taxType === 'car'
          ? ((isNew && buy <= rule.qeNewPriceLimit) ? Math.min(buy, rule.qeNewCap) : Math.min(buy, rule.qeOtherCap))
          : buy;
        const tr = profile.company.rate / 100; let claimed = 0, shield = 0;
        for (let t = 1; t <= hold; t++) { const ca = qe * (rule.sched[t - 1] || 0); claimed += ca; shield += ca * tr * d(t); }
        const adj = (qe - claimed) - saleNet * qe / buy;                       // >0 平衡津贴，<0 平衡税
        shield += (adj >= 0 ? adj : -Math.min(-adj, claimed)) * tr * d(hold);
        parts.tax = shield; npv -= shield;
      }
      warnings.push('资产属于公司，卖出所得要回公司账；必须真实用于业务。');
      if (p.taxType === 'car') warnings.push('公司车供个人使用，个人端要按规定值申报实物福利税，请计入“其他年度固定成本”。');
      else if (profile.company.controlling) warnings.push('控股董事能否享受手机、电脑的实物福利豁免存在争议，请向税务师确认。');
    }
    const eac = i > 0 ? npv * i / (1 - Math.pow(1 + i, -hold)) : npv / hold;
    const upfront = path.inst > 0 ? 0 : buy, monthly = path.inst > 0 ? buy / path.inst : 0;   // 现金流：首付与月供
    if (path.inst > hold * 12) warnings.push('持有期短于分期期：卖出后还要继续还月供，记得用卖出所得留足余款。');
    return { path, buyAge, hold, buy, saleGross, saleNet, npv, eac, upfront, monthly, perHour: p.hours > 0 ? eac / p.hours : null, parts, warnings };
  }

  function maxUsedAge(asset, profile) {
    if (!profile.used.ok) return 0;
    const m = profile.used.maxAge == null ? DATA.presets[asset.preset].maxUsed : profile.used.maxAge;
    return Math.max(0, Math.min(m, asset.life - 1));
  }

  // 排序：现金流优先时先比首付现金，再比年均成本；成本优先时只比年均成本
  function better(profile) {
    return (a, b) => profile.goal === 'cash' && Math.round(a.upfront) !== Math.round(b.upfront) ? a.upfront - b.upfront : a.eac - b.eac;
  }

  function grid(asset, profile, path) {
    const maxA = maxUsedAge(asset, profile), maxH = Math.min(asset.life, asset.life > 12 ? 12 : 10);
    const rows = [], cmp = better(profile); let best = null, bestNew = null;
    for (let a = 0; a <= maxA; a++) {
      const row = [];
      for (let h = 1; h <= maxH; h++) {
        let r = a + h > asset.life ? null : evaluate(asset, profile, path, a, h);
        if (r && profile.maxUpfront > 0 && r.upfront > profile.maxUpfront) r = null;   // 超出一次能拿出的现金
        row.push(r);
        if (r && (!best || cmp(r, best) < 0)) best = r;
        if (r && a === 0 && (!bestNew || cmp(r, bestNew) < 0)) bestNew = r;
      }
      rows.push(row);
    }
    return { path, rows, best, bestNew };
  }

  // 主入口：对每条可行路径求最优，再给出全局最优和稳健性
  function solve(asset, profile) {
    const cmp = better(profile);
    const grids = paths(asset, profile).map(pt => grid(asset, profile, pt)).filter(g => g.best);
    if (!grids.length) return { grids, best: null };
    grids.sort((a, b) => cmp(a.best, b.best));
    const best = grids[0].best;
    const bestNew = grids.map(g => g.bestNew).filter(Boolean).sort(cmp)[0];
    const shifted = k => Object.assign({}, asset, { curve: asset.curve.map((v, n) => n === 0 ? 1 : v * k) });
    const scen = k => { const a2 = shifted(k); const g = paths(a2, profile).map(pt => grid(a2, profile, pt)).filter(x => x.best).sort((x, y) => cmp(x.best, y.best))[0]; return { best: g.best, same: evaluate(a2, profile, best.path, best.buyAge, best.hold) }; };
    const lo = scen(1 - asset.band), hi = scen(1 + asset.band);
    const stable = [lo, hi].every(s => s.best.path.id === best.path.id && s.best.buyAge === best.buyAge && s.best.hold === best.hold);
    return { grids, best, bestNew, robust: { low: lo, high: hi, stable } };
  }

  function marginalRate(income) {
    return DATA.tax.personalBrackets.find(b => income <= b.upTo).rate;
  }

  const api = { DATA, retention, defaultAsset, defaultProfile, paths, evaluate, grid, solve, marginalRate, maxUsedAge };
  if (typeof module !== 'undefined') module.exports = api; else root.HC = api;
})(typeof window !== 'undefined' ? window : globalThis);
