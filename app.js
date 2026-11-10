// 页面逻辑：读取条件和资产 → 调用引擎 → 渲染结论。
(function () {
  const { DATA } = HC, $ = id => document.getElementById(id);
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const ASSET_NUM = ['price', 'discount', 'sellFee', 'usedPremium', 'hours', 'runPct', 'ageGrowth', 'runFixed', 'life', 'refurb', 'refurbAge'];
  const STORE = 'hc-profile-v1';
  let asset = HC.defaultAsset('iphone_pro'), profile = HC.defaultProfile();
  let view = { path: null, age: null, hold: null };   // 当前查看的路径与格子，null 表示跟随最优

  // ---------- 下拉选项 ----------
  function options() {
    $('cardType').innerHTML = Object.entries(DATA.cards).map(([k, c]) => `<option value="${k}">${c.name}</option>`).join('');
    $('instMonths').innerHTML = DATA.instalmentOptions.map(m => `<option value="${m}">${m ? m + ' 个月' : '没有或不用'}</option>`).join('');
    const B = DATA.tax.personalBrackets; let prev = 0;
    $('income').innerHTML = '<option value="-1">不提供（不计个人减免）</option>' + B.map((b, i) => {
      const txt = b.upTo === Infinity ? `RM ${fmt(prev)} 以上` : `RM ${fmt(prev + (i ? 1 : 0))} – ${fmt(b.upTo)}`;
      prev = b.upTo; return `<option value="${b.rate}">${txt}（边际税率 ${b.rate}%）</option>`;
    }).join('');
    $('companyRate').innerHTML = DATA.tax.companyRates.map(r => `<option value="${r}">${r}%</option>`).join('');
    const groups = {};
    for (const [k, s] of Object.entries(DATA.presets)) (groups[s.group] = groups[s.group] || []).push([k, s.name]);
    $('preset').innerHTML = Object.entries(groups).map(([g, items]) => `<optgroup label="${g}">${items.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</optgroup>`).join('');
    $('updated').textContent = DATA.updated;
  }

  // ---------- 表单 ↔ 状态 ----------
  function toForm() {
    $('cardType').value = profile.card.type; $('cardRate').value = profile.card.rate; $('cardCap').value = profile.card.cap;
    $('instMonths').value = profile.card.instMonths; $('eppRewards').checked = profile.card.eppRewards;
    $('income').value = profile.personal.provided ? profile.personal.rate : -1; $('reliefLeft').value = profile.personal.reliefLeft;
    $('hasCompany').value = profile.company.has ? 1 : 0; $('companyRate').value = profile.company.rate; $('controlling').checked = profile.company.controlling;
    $('usedOk').value = profile.used.ok ? 1 : 0;
    $('maxAge').value = profile.used.maxAge == null ? DATA.presets[asset.preset].maxUsed : profile.used.maxAge;
    $('rate').value = profile.rate; $('goal').value = profile.goal; $('maxUpfront').value = profile.maxUpfront;
    $('preset').value = asset.preset; ASSET_NUM.forEach(k => $(k).value = asset[k]);
    $('curve').value = asset.curve.slice(1).map(v => +(v * 100).toFixed(1)).join(', ');
    $('band').value = Math.round(asset.band * 100);
  }
  const num = (id, def = 0) => { const v = parseFloat($(id).value); return isFinite(v) ? v : def; };
  function fromForm() {
    const c = profile.card; c.type = $('cardType').value; c.rate = num('cardRate'); c.cap = num('cardCap');
    c.instMonths = +$('instMonths').value; c.eppRewards = $('eppRewards').checked;
    const inc = +$('income').value; profile.personal.provided = inc >= 0; profile.personal.rate = Math.max(0, inc);
    profile.personal.reliefLeft = Math.min(DATA.tax.lifestyleReliefCap, num('reliefLeft'));
    profile.company.has = $('hasCompany').value === '1'; profile.company.rate = +$('companyRate').value; profile.company.controlling = $('controlling').checked;
    profile.used.ok = $('usedOk').value === '1'; profile.used.maxAge = Math.round(num('maxAge'));
    profile.rate = num('rate'); profile.goal = $('goal').value; profile.maxUpfront = num('maxUpfront');
    ASSET_NUM.forEach(k => asset[k] = num(k));
    asset.life = Math.max(1, Math.round(asset.life));
    const cv = $('curve').value.split(/[,，\s]+/).map(parseFloat).filter(v => isFinite(v) && v >= 0).map(v => v / 100);
    if (cv.length) asset.curve = [1, ...cv];
    asset.band = num('band') / 100;
    $('cardBox').hidden = c.type === 'none'; $('reliefBox').hidden = !profile.personal.provided;
    $('coBox').hidden = !profile.company.has; $('usedBox').hidden = !profile.used.ok;
    try { localStorage.setItem(STORE, JSON.stringify(profile)); } catch (e) { /* 存不了就算了 */ }
  }

  // ---------- 渲染 ----------
  const what = r => (r.buyAge === 0 ? '买全新' : `买 ${r.buyAge} 年二手`) + `，持有 ${r.hold} 年`;
  function render() {
    fromForm();
    const s = HC.solve(asset, profile), best = s.best;
    document.querySelector('.right').classList.toggle('empty', !best);
    if (!best) { $('verdict').innerHTML = `没有可行的买法：一次最多拿出 RM ${fmt(profile.maxUpfront)} 不够付现，也没有可用的 0% 分期。可以提高这个上限、接受二手，或在信用卡里选上分期。`; $('robust').textContent = ''; $('warns').innerHTML = ''; return; }
    const g = s.grids.find(x => x.path.id === view.path) || s.grids[0];
    let cur = (view.age != null && g.rows[view.age] && g.rows[view.age][view.hold - 1]) || g.best;

    // 结论
    const yearly = HC.evaluate(asset, profile, HC.paths(asset, profile)[0], 0, 1);
    const cashOf = r => r.monthly > 0 ? `首付 RM 0，月供 RM ${fmt(r.monthly)} × ${r.path.inst} 个月` : `一次付 RM ${fmt(r.upfront)}`;
    let v = `${profile.goal === 'cash' ? '现金流优先的最优解' : '成本最低的最优解'}：<b>${best.path.label}</b>，<b>${what(best)}</b>。${cashOf(best)}；年均成本 RM ${fmt(best.eac)}` + (best.perHour != null ? `，约 RM ${best.perHour.toFixed(2)} / 小时` : '') + '。';
    v += ` “付现买全新、每年换”是 RM ${fmt(yearly.eac)} / 年。`;
    const lowest = s.grids.map(x => x.rows.flat().filter(Boolean).sort((p, q) => p.eac - q.eac)[0]).sort((p, q) => p.eac - q.eac)[0];
    if (profile.goal === 'cash' && lowest.eac < best.eac - 1) v += ` 只看成本的话，${lowest.path.label}、${what(lowest)}更便宜（RM ${fmt(lowest.eac)} / 年），但要${cashOf(lowest)}。`;
    else if (best.buyAge > 0 && s.bestNew) v += ` 如果只买全新：${s.bestNew.path.label}，持有 ${s.bestNew.hold} 年，年均 RM ${fmt(s.bestNew.eac)}。`;
    $('verdict').innerHTML = v;
    const r = s.robust, pct = Math.round(asset.band * 100);
    $('robust').textContent = `稳健性：把保值曲线整体下调或上调 ${pct}%，这个买法的年均成本在 RM ${fmt(r.high.same.eac)} – ${fmt(r.low.same.eac)} 之间；` +
      (r.stable ? '最优买法不变。' : `最优买法会变（残值偏低时：${r.low.best.path.label}，${what(r.low.best)}；偏高时：${r.high.best.path.label}，${what(r.high.best)}），请先查实际二手价。`);
    const ws = [...new Set([...best.warnings, ...cur.warnings])];
    if (best.monthly > 0) ws.push('分期会占用信用额度直到还清；多笔分期的月供会叠加，请确认每月总月供在可承受范围内。');
    if (profile.card.type === 'cashback' && profile.card.cap > 0) ws.push(`回扣卡每月封顶 RM ${fmt(profile.card.cap)}，大额消费实际只拿到封顶额。`);
    $('warns').innerHTML = ws.map(w => `<p class="warn">${w}</p>`).join('');

    // 路径对比
    $('paths').innerHTML = '<tr><th>买法</th><th>最优策略</th><th>首付现金</th><th>月供</th><th>年均成本</th></tr>' + s.grids.map((x, i) =>
      `<tr class="pick${x === g ? ' on' : ''}" tabindex="0" data-path="${x.path.id}"><td>${x.path.label}${i === 0 ? '<span class="pill">最优</span>' : ''}</td><td>${what(x.best)}</td><td class="num">${fmt(x.best.upfront)}</td><td class="num">${x.best.monthly > 0 ? fmt(x.best.monthly) + ' × ' + x.path.inst : '·'}</td><td class="num">${fmt(x.best.eac)}</td></tr>`).join('');

    // 策略表
    $('gridTitle').textContent = `策略表：${g.path.label}`;
    const all = g.rows.flat().filter(Boolean).map(x => x.eac), lo = Math.min(...all), hi = Math.max(...all), cols = g.rows[0].length;
    let h = '<tr><th>买入机龄 ＼ 持有</th>' + Array.from({ length: cols }, (_, i) => `<th>${i + 1} 年</th>`).join('') + '</tr>';
    g.rows.forEach((row, a) => {
      if (!row.some(Boolean)) return;                     // 这条路径不适用的机龄（如二手不能刷卡）不显示
      h += `<tr><td>${a === 0 ? '全新' : a + ' 年二手'}</td>` + row.map((x, i) => {
        if (!x) return '<td class="na">·</td>';
        const t = hi > lo ? 1 - (x.eac - lo) / (hi - lo) : 1, p = Math.round(8 + t * t * 62);
        return `<td class="cell${x === cur ? ' sel' : ''}${x === g.best ? ' top' : ''}" tabindex="0" data-a="${a}" data-h="${i + 1}" style="background:color-mix(in srgb,var(--accent) ${p}%,var(--panel));color:${p > 45 ? 'var(--panel)' : 'var(--ink)'}">${fmt(x.eac)}</td>`;
      }).join('') + '</tr>';
    });
    $('grid').innerHTML = h;

    // 明细
    $('bdTitle').textContent = `明细（现值）：${cur.path.label}，${what(cur)}`;
    const p = cur.parts, rows = [['买入价', p.buy], ['运行与维护', p.run], ['一次性翻修', p.refurb], ['信用卡回扣 / 积分', -p.cashback], ['0% 分期的利息价值', -p.finance],
      [`残值（${cur.hold} 年后卖 RM ${fmt(cur.saleGross)}，扣费后折现）`, -p.sale], [cur.path.payer === 'company' ? '公司税盾' : '个人减免省税', -p.tax]].filter(x => Math.abs(x[1]) >= 0.5);
    $('bd').innerHTML = rows.map(x => `<tr><td>${x[0]}</td><td>${x[1] < 0 ? '−' : ''}${fmt(Math.abs(x[1]))}</td></tr>`).join('') +
      `<tr class="total"><td>${cur.hold} 年净成本现值</td><td>${fmt(cur.npv)}</td></tr><tr><td>折成年均成本</td><td>${fmt(cur.eac)}</td></tr>`;

    // 登记链接预填用户正在看的资产，方便了解真实需求
    const ps = DATA.presets[asset.preset];
    $('waitlist').href = 'https://github.com/zhihong1357/worth-the-ringgit/issues/new?title=' + encodeURIComponent('登记：想用定制分析') + '&body=' +
      encodeURIComponent(`我想分析的资产：${ps.group} · ${ps.name}，标价 RM ${fmt(asset.price)}\n具体型号：\n我最想知道的是：\n我愿意为一次分析付：RM `);

    chart(cur); $('basis').textContent = '默认曲线依据：' + DATA.presets[asset.preset].basis + ' 阴影带是历史波动幅度。';
  }

  function chart(cur) {
    const W = 640, H = 220, L = 44, R = 12, T = 12, B = 28, n = Math.min(asset.curve.length - 1, asset.life), k = asset.band;
    const top = Math.max(1, Math.ceil(Math.max(...asset.curve.slice(1)) * (1 + k) * 5) / 5);
    const x = a => L + (W - L - R) * a / n, y = v => T + (H - T - B) * (1 - Math.min(v, top) / top);
    const val = (a, m) => a === 0 ? 1 : HC.retention(asset.curve, a) * m;
    const line = m => Array.from({ length: n + 1 }, (_, a) => `${x(a)},${y(val(a, m))}`);
    let s = '';
    for (let v = 0; v <= top + 1e-9; v += .2) s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${Math.round(v * 100)}%</text>`;
    for (let a = 0; a <= n; a += n > 12 ? 2 : 1) s += `<text x="${x(a)}" y="${H - 8}" text-anchor="middle">${a}年</text>`;
    s += `<polygon points="${line(1 + k).join(' ')} ${line(1 - k).reverse().join(' ')}" fill="var(--accent-soft)"/>`;
    s += `<polyline points="${line(1).join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2"/>`;
    [cur.buyAge, Math.min(cur.buyAge + cur.hold, n)].forEach((a, i) => {
      s += `<line x1="${x(a)}" x2="${x(a)}" y1="${T}" y2="${H - B}" stroke="var(--ink)" stroke-dasharray="3 3"/><circle cx="${x(a)}" cy="${y(val(a, 1))}" r="4" fill="var(--ink)"/>`;
      s += `<text x="${x(a) + (a > n - 1 ? -6 : 6)}" y="${T + 10}" text-anchor="${a > n - 1 ? 'end' : 'start'}">${i ? '卖' : '买'}</text>`;
    });
    $('chart').innerHTML = s;
  }

  // ---------- 事件 ----------
  options();
  try { const saved = JSON.parse(localStorage.getItem(STORE)); if (saved && saved.card) profile = Object.assign(profile, saved); } catch (e) { /* 忽略 */ }
  toForm(); render();
  $('f').addEventListener('submit', e => e.preventDefault());
  $('f').addEventListener('input', e => {
    if (e.target.id === 'preset') { const keep = { price: asset.price, discount: asset.discount }; asset = Object.assign(HC.defaultAsset(e.target.value), keep); profile.used.maxAge = null; toForm(); }
    if (e.target.id === 'cardType') { const c = DATA.cards[e.target.value]; $('cardRate').value = c.rate; $('cardCap').value = c.cap; }
    view = { path: view.path, age: null, hold: null };
    render();
  });
  function pick(e) {
    const row = e.target.closest('tr.pick'), cell = e.target.closest('td.cell');
    if (row) view = { path: row.dataset.path, age: null, hold: null };
    else if (cell) { view.age = +cell.dataset.a; view.hold = +cell.dataset.h; view.path = view.path || null; }
    else return;
    render();
  }
  ['paths', 'grid'].forEach(id => {
    $(id).addEventListener('click', pick);
    $(id).addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(e); } });
  });
})();
