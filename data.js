// 数据文件：保值曲线、税务规则、信用卡类型。全部是默认值，欢迎用实际成交数据提 PR 修正。
// 曲线 = 该机龄下二手市场成交价 ÷ 当前同款新品标价；curve[0] 恒为 1，curve[n] 是第 n 年。
// band = 历史波动幅度，用于稳健性检验（曲线整体上下浮动该比例）。
(function (root) {
  const lux = (level, drift, n) => [1, ...Array.from({ length: n }, (_, i) => +(level * Math.pow(1 - drift, i)).toFixed(3))];

  const DATA = {
    updated: '2026-11-11',
    currency: 'RM',
    defaults: { rate: 3.5, usedPremium: 3 },

    presets: {
      iphone_pro: { group: '手机', name: 'iPhone Pro / Pro Max', curve: [1, .64, .49, .42, .34, .25, .17, .11], band: .15, life: 7, maxUsed: 2, sellFee: 5, runPct: 0, ageGrowth: 0, refurb: 450, refurbAge: 3, hours: 1800, tax: 'ict',
        basis: '回收价口径：16 Pro Max 一年 56.4%（SellCell）；历代全系列首年跌幅 13 系 40%、14 系 48%、15 系 56%、16 系 45%（Compare and Recycle）；澳洲市场价 14 Pro Max 一年 63%、两年 45%（Phonebot）。私人成交价高于回收价，取 64%。' },
      android_flag: { group: '手机', name: '安卓旗舰', curve: [1, .47, .33, .23, .15, .10], band: .2, life: 5, maxUsed: 2, sellFee: 5, runPct: 0, ageGrowth: 0, refurb: 350, refurbAge: 3, hours: 1800, tax: 'ict',
        basis: '回收价口径一年：三星约 39.5%、行业平均约 44.7%（SellCell），私人成交略上调。' },
      foldable: { group: '手机', name: '折叠屏', curve: [1, .40, .27, .18, .12, .08], band: .2, life: 5, maxUsed: 2, sellFee: 5, runPct: 1, ageGrowth: 0, refurb: 0, refurbAge: 0, hours: 1800, tax: 'ict',
        basis: '回收价口径一年约 35.4%（SellCell），私人成交略上调。' },
      macbook: { group: '电脑', name: 'MacBook', curve: [1, .66, .56, .47, .38, .28, .20, .14], band: .2, life: 7, maxUsed: 3, sellFee: 5, runPct: 0, ageGrowth: 0, refurb: 900, refurbAge: 5, hours: 1500, tax: 'ict',
        basis: '来源分歧大：回收商口径首年约 50%（MacFinder），其他估算首年跌 17%–31%。取中间值并按私人成交口径。' },
      win_laptop: { group: '电脑', name: 'Windows 笔记本', curve: [1, .58, .42, .31, .22, .15, .10], band: .2, life: 6, maxUsed: 3, sellFee: 5, runPct: 0, ageGrowth: 0, refurb: 500, refurbAge: 4, hours: 1500, tax: 'ict',
        basis: '主流机型约每年跌 30%（Swappa），首年更陡。' },
      car_keep: { group: '汽车', name: '保值型（Perodua / Honda / Toyota 入门）', curve: [1, .88, .82, .76, .71, .66, .60, .55, .49, .43, .38, .33, .28], band: .1, life: 12, maxUsed: 5, sellFee: 4, runPct: 5, ageGrowth: 10, refurb: 0, refurbAge: 0, hours: 400, tax: 'car',
        basis: 'Vios / City 五年约 68%（Carsome 数据，WapCar 引述）；十年约 30%–40%（iCarData）。' },
      car_proton: { group: '汽车', name: 'Proton 平均', curve: [1, .888, .787, .688, .611, .537, .47, .41, .36, .31, .27, .23, .20], band: .1, life: 12, maxUsed: 5, sellFee: 4, runPct: 5, ageGrowth: 10, refurb: 0, refurbAge: 0, hours: 400, tax: 'car',
        basis: '前五年为 iCarData 品牌平均（2020）；第 6 年起为推算。' },
      car_avg: { group: '汽车', name: '市场平均 / 欧系偏向', curve: [1, .80, .71, .63, .54, .45, .39, .33, .28, .24, .20, .17, .14], band: .15, life: 12, maxUsed: 5, sellFee: 4, runPct: 6, ageGrowth: 12, refurb: 0, refurbAge: 0, hours: 400, tax: 'car',
        basis: '大马燃油车三年跌 30%–40%、五年跌 50%–60%（Motorist 2026）。' },
      bag_hermes: { group: '包', name: 'Hermès Birkin / Kelly', curve: lux(1.10, 0, 15), band: .2, life: 15, maxUsed: 5, sellFee: 20, runPct: .5, ageGrowth: 0, refurb: 0, refurbAge: 0, hours: 300, tax: 'none',
        basis: '二手价常高于零售（Rebag：2025 年平均 138%，早年 90%–110%），取保守 110%。前提是能按零售价买到。' },
      bag_classic: { group: '包', name: 'Chanel / LV 经典款', curve: lux(.85, .01, 15), band: .15, life: 15, maxUsed: 5, sellFee: 20, runPct: .5, ageGrowth: 0, refurb: 0, refurbAge: 0, hours: 300, tax: 'none',
        basis: 'Rebag：Chanel 约 92%、LV 约 88%，早年 75%–80%。取 85% 并逐年缓降。' },
      bag_other: { group: '包', name: '一般设计师品牌', curve: lux(.50, .07, 15), band: .3, life: 15, maxUsed: 5, sellFee: 20, runPct: .5, ageGrowth: 0, refurb: 0, refurbAge: 0, hours: 300, tax: 'none',
        basis: '假设值：多数品牌一出店即大幅折价，无可靠分年数据。' },
      watch_rolex: { group: '手表', name: 'Rolex 钢款', curve: lux(1.02, 0, 20), band: .15, life: 20, maxUsed: 5, sellFee: 12, runPct: 1.5, ageGrowth: 0, refurb: 0, refurbAge: 0, hours: 4000, tax: 'none',
        basis: '二手均价约高于零售 6.7%（WatchCharts，2026 年 1 月），取 102%。前提是能按零售价买到。' },
      watch_tier2: { group: '手表', name: 'Omega / Cartier / Tudor', curve: lux(.68, .02, 20), band: .2, life: 20, maxUsed: 5, sellFee: 12, runPct: 1.5, ageGrowth: 0, refurb: 0, refurbAge: 0, hours: 4000, tax: 'none',
        basis: '假设值：公认低于 Rolex 一档，无统一百分比来源。' },
      watch_other: { group: '手表', name: '其他奢侈品牌', curve: lux(.50, .03, 20), band: .3, life: 20, maxUsed: 5, sellFee: 12, runPct: 1.5, ageGrowth: 0, refurb: 0, refurbAge: 0, hours: 4000, tax: 'none',
        basis: '假设值。' }
    },

    // 信用卡类型的默认回报。回扣卡普遍有每月封顶，大额消费实际只拿到封顶额。
    cards: {
      none: { name: '没有信用卡', rate: 0, cap: 0 },
      cashback: { name: '现金回扣卡', rate: 5, cap: 30 },
      points: { name: '积分卡', rate: 0.5, cap: 0 },
      miles: { name: '里程卡', rate: 1, cap: 0 }
    },
    instalmentOptions: [0, 6, 12, 24, 36],

    // 马来西亚 2026 课税年
    tax: {
      personalBrackets: [
        { upTo: 5000, rate: 0 }, { upTo: 20000, rate: 1 }, { upTo: 35000, rate: 3 }, { upTo: 50000, rate: 6 },
        { upTo: 70000, rate: 11 }, { upTo: 100000, rate: 19 }, { upTo: 400000, rate: 25 }, { upTo: 600000, rate: 26 },
        { upTo: 2000000, rate: 28 }, { upTo: Infinity, rate: 30 }
      ],
      lifestyleReliefCap: 2500,                 // 手机、电脑、平板，与书籍和网费共用
      companyRates: [15, 17, 24],               // 中小企业首 RM150k 15%，至 RM600k 17%，其余 24%
      ca: {
        ict: { sched: [.6, .2, .2] },           // 初始 40% + 年度 20%
        car: { sched: [.4, .2, .2, .2], qeNewCap: 100000, qeNewPriceLimit: 150000, qeOtherCap: 50000 }
      },
      clawbackYears: 2                          // 两年内处置，资本津贴被追回（Schedule 3 第 71 段）
    }
  };

  if (typeof module !== 'undefined') module.exports = DATA; else root.HC_DATA = DATA;
})(typeof window !== 'undefined' ? window : globalThis);
