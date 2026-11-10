// 运行：node test.js
const assert = require('assert');
const HC = require('./engine.js');
const near = (a, b, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);
const cash = { id: 'cash', label: '', payer: 'personal', cashback: false, inst: 0 };

// 1. 零利率下，年均成本 = 买入价 − 卖出净额
{
  const a = HC.defaultAsset('iphone_pro'), p = HC.defaultProfile(); p.rate = 0; a.refurb = 0;
  const r = HC.evaluate(a, p, cash, 0, 1);
  near(r.eac, 5999 - 5999 * 0.64 * 0.95);
}
// 2. 每年换新是全新买法里最贵的
{
  const a = HC.defaultAsset('iphone_pro'), p = HC.defaultProfile();
  const g = HC.grid(a, p, cash);
  assert.ok(g.rows[0][0].eac > g.bestNew.eac * 2);
}
// 3. 回扣卡封顶：5% 回扣、每月封顶 RM30，买 RM5,999 只拿 RM30
{
  const a = HC.defaultAsset('iphone_pro'), p = HC.defaultProfile();
  p.card = { type: 'cashback', rate: 5, cap: 30, instMonths: 24, eppRewards: false };
  const ps = HC.paths(a, p);
  assert.deepStrictEqual(ps.map(x => x.id), ['cash', 'card', 'inst']);
  near(HC.evaluate(a, p, ps[1], 0, 2).parts.cashback, 30, 0.01);
  const inst = HC.evaluate(a, p, ps[2], 0, 2);
  assert.strictEqual(inst.parts.cashback, 0);            // 分期交易默认没有回扣
  assert.ok(inst.parts.finance > 150 && inst.parts.finance < 260);
  assert.strictEqual(HC.evaluate(a, p, ps[1], 1, 2), null); // 二手不能刷卡
}
// 4. 公司买：不足两年税盾为 0；满两年后零利率下税盾 = 税率 ×（买入 − 卖出净额）
{
  const a = HC.defaultAsset('iphone_pro'), p = HC.defaultProfile(); p.rate = 0; p.company.has = true;
  const co = HC.paths(a, p).find(x => x.id === 'company');
  assert.strictEqual(HC.evaluate(a, p, co, 0, 1).parts.tax, 0);
  const r = HC.evaluate(a, p, co, 0, 3);
  near(r.parts.tax, 0.17 * (5999 - r.saleNet));
}
// 5. 公司买车：RM180,000 新车合格支出只有 RM50,000
{
  const a = HC.defaultAsset('car_keep'), p = HC.defaultProfile(); a.price = 180000; p.rate = 0; p.company.has = true;
  const co = HC.paths(a, p).find(x => x.id === 'company');
  const r = HC.evaluate(a, p, co, 0, 5);
  near(r.parts.tax, 0.17 * (50000 - r.saleNet * 50000 / 180000));
}
// 6. 包和手表没有公司路径
{
  const a = HC.defaultAsset('watch_rolex'), p = HC.defaultProfile(); p.company.has = true;
  assert.ok(!HC.paths(a, p).some(x => x.id === 'company'));
}
// 7. 个人减免：边际税率 25%，额度 RM2,500，零利率下省 RM625
{
  const a = HC.defaultAsset('iphone_pro'), p = HC.defaultProfile(); p.rate = 0; p.personal.rate = 25;
  near(HC.evaluate(a, p, cash, 0, 3).parts.tax, 625, 0.01);
  assert.strictEqual(HC.evaluate(a, p, cash, 1, 3).parts.tax, 0);
}
// 8. 边际税率
assert.strictEqual(HC.marginalRate(60000), 11);
assert.strictEqual(HC.marginalRate(150000), 25);
// 9. 不接受二手时只算全新
{
  const a = HC.defaultAsset('macbook'), p = HC.defaultProfile(); p.used.ok = false;
  const s = HC.solve(a, p);
  assert.strictEqual(s.best.buyAge, 0);
  assert.ok(s.robust.low.same.eac > s.best.eac && s.robust.high.same.eac < s.best.eac);
}
console.log('全部通过');
