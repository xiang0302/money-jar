/* ============ 汇率管理系统 ============ */

const RATES_KEY = 'moneyjar_rates_v2';
const RATES_METADATA_KEY = 'moneyjar_rates_metadata';

const RATE_SOURCES = {
  MANUAL: 'manual',           // 手动输入（如从moomoo复制）
  LIVE_API: 'live_api',       // 实时API（open.er-api.com）
  MOOMOO: 'moomoo',           // Moomoo应用转换率
  DEFAULT: 'default'          // 默认硬编码
};

// 汇率来源配置
const RATE_SOURCE_CONFIG = {
  [RATE_SOURCES.MANUAL]: {
    name: '手动设置（Moomoo/其他）',
    icon: '✏️',
    refreshable: false,
    description: '从Moomoo或其他交易平台复制的真实转换率'
  },
  [RATE_SOURCES.LIVE_API]: {
    name: '实时汇率（Open ER API）',
    icon: '📡',
    refreshable: true,
    description: '来自 open.er-api.com 的市场汇率（约15分钟延迟）'
  },
  [RATE_SOURCES.MOOMOO]: {
    name: 'Moomoo官方汇率',
    icon: '🇺🇸',
    refreshable: false,
    description: '从Moomoo应用直接导入的转换率'
  },
  [RATE_SOURCES.DEFAULT]: {
    name: '默认汇率',
    icon: '⚙️',
    refreshable: false,
    description: '应用默认的参考汇率（可能过期）'
  }
};

// 硬编码的默认汇率（MYR为基准）
const DEFAULT_RATES = {
  MYR: 1.0,
  CNY: 0.65,
  USD: 4.40,
  SGD: 3.30,
  EUR: 4.70,
  HKD: 0.56,
  JPY: 0.029
};

/**
 * 汇率数据结构
 * {
 *   rates: { MYR: 1.0, CNY: 0.65, ... },
 *   source: 'manual' | 'live_api' | 'moomoo' | 'default',
 *   timestamp: '2024-08-21T12:00:00Z',
 *   expiresAt: '2024-08-22T12:00:00Z',
 *   note: '从Moomoo复制 - USD兑MYR 4.42'
 * }
 */

/**
 * 从 localStorage 加载汇率
 */
function loadRates() {
  try {
    const stored = localStorage.getItem(RATES_KEY);
    if (!stored) return getDefaultRatesData();
    
    const data = JSON.parse(stored);
    
    // 验证数据完整性
    if (!data.rates || typeof data.rates !== 'object') {
      console.warn('⚠️ 汇率数据格式错误，使用默认值');
      return getDefaultRatesData();
    }
    
    return data;
  } catch (e) {
    console.error('❌ 汇率加载失败:', e);
    return getDefaultRatesData();
  }
}

/**
 * 获取默认汇率数据对象
 */
function getDefaultRatesData() {
  return {
    rates: { ...DEFAULT_RATES },
    source: RATE_SOURCES.DEFAULT,
    timestamp: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 24 * 3600000).toISOString(), // 30天过期
    note: '应用默认汇率'
  };
}

/**
 * 保存汇率到 localStorage
 * @param {Object} ratesData - 汇率数据对象
 * @param {string} source - 数据来源
 * @param {string} note - 用户注释（可选）
 */
function saveRates(ratesData, source = RATE_SOURCES.MANUAL, note = '') {
  try {
    const data = {
      rates: ratesData,
      source: source,
      timestamp: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 3600000).toISOString(),
      note: note || `由 ${RATE_SOURCE_CONFIG[source].name} 设置`
    };
    
    localStorage.setItem(RATES_KEY, JSON.stringify(data));
    console.log(`✅ 汇率已保存 (来源: ${RATE_SOURCE_CONFIG[source].name})`);
    return true;
  } catch (e) {
    console.error('❌ 汇率保存失败:', e);
    alert('无法保存汇率，本地存储可能已满');
    return false;
  }
}

/**
 * 检查汇率是否已过期
 */
function isRatesExpired(ratesData) {
  if (!ratesData || !ratesData.expiresAt) return true;
  return new Date(ratesData.expiresAt) < new Date();
}

/**
 * 获取汇率过期天数（负数表示已过期）
 */
function getDaysUntilExpire(ratesData) {
  if (!ratesData || !ratesData.expiresAt) return -1;
  const expiresAt = new Date(ratesData.expiresAt);
  const now = new Date();
  const days = (expiresAt - now) / (1000 * 60 * 60 * 24);
  return Math.ceil(days);
}

/**
 * 从实时API获取汇率
 * 数据来源: open.er-api.com (免费，约15分钟延迟)
 */
async function fetchLiveRates() {
  try {
    console.log('📡 正在获取实时汇率...');
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8秒超时
    
    const response = await fetch('https://open.er-api.com/v6/latest/MYR', {
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`API 错误: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.rates || typeof data.rates !== 'object') {
      throw new Error('API 返回数据格式错误');
    }
    
    // 提取并验证汇率
    const ratesData = {};
    const CURRENCIES = ['MYR', 'CNY', 'USD', 'SGD', 'EUR', 'HKD', 'JPY'];
    
    for (const code of CURRENCIES) {
      if (code === 'MYR') {
        ratesData[code] = 1.0;
      } else if (data.rates[code]) {
        const rate = parseFloat(data.rates[code]);
        
        // 验证汇率有效性
        if (!isNaN(rate) && rate > 0 && rate < 1000) {
          // MYR为基准，反向计算
          ratesData[code] = parseFloat((1 / rate).toFixed(4));
        } else {
          throw new Error(`无效的汇率数据: ${code}=${rate}`);
        }
      }
    }
    
    // 保存到本地
    saveRates(ratesData, RATE_SOURCES.LIVE_API, '实时市场汇率（API）');
    
    console.log('✅ 实时汇率获取成功', ratesData);
    return {
      success: true,
      rates: ratesData,
      source: RATE_SOURCES.LIVE_API
    };
    
  } catch (err) {
    console.error('❌ 实时汇率获取失败:', err.message);
    return {
      success: false,
      error: err.message,
      source: RATE_SOURCES.LIVE_API
    };
  }
}

/**
 * 从Moomoo导入汇率
 * 用户需要手动从Moomoo应用复制转换率信息
 * 例如: "USD 1 = ¥ 7.30 (Moomoo汇率)"
 */
function importMoomooRates(moomooText) {
  try {
    console.log('📥 正在解析Moomoo汇率信息...');
    
    // 示例: "USD 1 = ¥ 7.30" 或 "1 USD = 7.30 CNY"
    const regex = /(\w{3})\s*1?\s*=\s*[\$¥€₹]?\s*([\d.]+)\s*(\w{3})?/gi;
    const matches = [...moomooText.matchAll(regex)];
    
    if (matches.length === 0) {
      throw new Error('无法识别汇率格式。请复制: "USD 1 = 7.30 CNY"');
    }
    
    const ratesData = { MYR: 1.0 };
    const parsedInfo = [];
    
    // 首先确定基准货币
    let baseAmount = null;
    const CURRENCIES = ['MYR', 'CNY', 'USD', 'SGD', 'EUR', 'HKD', 'JPY'];
    
    for (const match of matches) {
      const fromCurr = match[1].toUpperCase();
      const amount = parseFloat(match[2]);
      const toCurr = match[3]?.toUpperCase() || 'CNY'; // 默认CNY
      
      if (!CURRENCIES.includes(fromCurr) || !CURRENCIES.includes(toCurr)) {
        console.warn(`⚠️ 不支持的货币: ${fromCurr} 或 ${toCurr}`);
        continue;
      }
      
      if (isNaN(amount) || amount <= 0) {
        console.warn(`⚠️ 无效的汇率: ${amount}`);
        continue;
      }
      
      // 如果都不是MYR，先临时存储
      if (fromCurr === 'MYR') {
        ratesData[toCurr] = parseFloat(amount.toFixed(4));
      } else if (toCurr === 'MYR') {
        ratesData[fromCurr] = parseFloat((1 / amount).toFixed(4));
      } else {
        // 两个都不是MYR，后续处理
        ratesData[`_temp_${fromCurr}_${toCurr}`] = amount;
      }
      
      parsedInfo.push(`${fromCurr} → ${toCurr}: ${amount}`);
    }
    
    // 验证至少有一些汇率数据
    const validRates = Object.keys(ratesData).filter(k => !k.startsWith('_temp_'));
    if (validRates.length < 2) {
      throw new Error('无足够的汇率信息');
    }
    
    // 清理临时数据
    Object.keys(ratesData).forEach(key => {
      if (key.startsWith('_temp_')) delete ratesData[key];
    });
    
    const note = `从Moomoo导入 - ${parsedInfo.join('; ')}`;
    saveRates(ratesData, RATE_SOURCES.MOOMOO, note);
    
    return {
      success: true,
      rates: ratesData,
      source: RATE_SOURCES.MOOMOO,
      parsedCount: validRates.length,
      note: note
    };
    
  } catch (err) {
    console.error('❌ Moomoo汇率导入失败:', err.message);
    return {
      success: false,
      error: err.message,
      source: RATE_SOURCES.MOOMOO
    };
  }
}

/**
 * 手动设置单个汇率
 * @param {string} fromCurr - 源货币
 * @param {string} toCurr - 目标货币（通常是MYR）
 * @param {number} rate - 汇率
 */
function setManualRate(fromCurr, toCurr, rate) {
  try {
    rate = parseFloat(rate);
    
    if (isNaN(rate) || rate <= 0) {
      throw new Error('汇率必须是正数');
    }
    
    const current = loadRates();
    const ratesData = current.rates || { ...DEFAULT_RATES };
    
    // 如果是对标USD，需要转换
    if (toCurr !== 'MYR') {
      // 从USD或其他基准转换到MYR
      const baseRate = ratesData[toCurr] || 1.0;
      ratesData[fromCurr] = parseFloat((rate * baseRate).toFixed(4));
    } else {
      ratesData[fromCurr] = parseFloat(rate.toFixed(4));
    }
    
    const note = `手动设置: 1 ${fromCurr} = ${rate} ${toCurr}`;
    saveRates(ratesData, RATE_SOURCES.MANUAL, note);
    
    return {
      success: true,
      rate: ratesData[fromCurr],
      note: note
    };
    
  } catch (err) {
    console.error('❌ 手动设置汇率失败:', err.message);
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * 转换金额
 * @param {number} amount - 金额
 * @param {string} fromCurr - 源货币
 * @param {string} toCurr - 目标货币
 * @param {Object} ratesData - 汇率数据（可选，默认加载）
 */
function convertAmount(amount, fromCurr, toCurr, ratesData = null) {
  if (fromCurr === toCurr) return amount;
  
  if (!ratesData) {
    ratesData = loadRates();
  }
  
  const rates = ratesData.rates || {};
  const rateFrom = rates[fromCurr] || 1.0;
  const rateTo = rates[toCurr] || 1.0;
  
  if (rateTo === 0) return 0;
  if (rateFrom === 0) return 0;
  
  const result = (amount * rateFrom) / rateTo;
  
  // 根据目标货币设置小数位
  const decimals = toCurr === 'JPY' ? 0 : 2;
  return parseFloat(result.toFixed(decimals));
}

/**
 * 获取汇率状态信息（用于UI显示）
 */
function getRatesStatus(ratesData) {
  if (!ratesData) {
    ratesData = loadRates();
  }
  
  const source = ratesData.source || RATE_SOURCES.DEFAULT;
  const config = RATE_SOURCE_CONFIG[source];
  const daysLeft = getDaysUntilExpire(ratesData);
  const isExpired = isRatesExpired(ratesData);
  
  let statusText = '';
  let statusColor = '';
  
  if (isExpired) {
    statusText = `⚠️ 已过期 (${Math.abs(daysLeft)}天前) - ${config.name}`;
    statusColor = 'red';
  } else if (daysLeft <= 3) {
    statusText = `⏰ 即将过期 (${daysLeft}天) - ${config.name}`;
    statusColor = 'orange';
  } else {
    statusText = `✅ 有效 (${daysLeft}天后过期) - ${config.name}`;
    statusColor = 'green';
  }
  
  return {
    text: statusText,
    color: statusColor,
    isExpired: isExpired,
    daysLeft: daysLeft,
    source: source,
    sourceConfig: config,
    note: ratesData.note,
    timestamp: ratesData.timestamp,
    rates: ratesData.rates
  };
}

/**
 * 导出汇率历史（用于调试）
 */
function exportRatesHistory() {
  try {
    const current = loadRates();
    return {
      current: current,
      defaultRates: DEFAULT_RATES,
      sources: RATE_SOURCES,
    };
  } catch (e) {
    return null;
  }
}

// 导出所有函数供HTML使用
if (typeof window !== 'undefined') {
  window.RatesManager = {
    loadRates,
    saveRates,
    fetchLiveRates,
    importMoomooRates,
    setManualRate,
    convertAmount,
    getRatesStatus,
    exportRatesHistory,
    isRatesExpired,
    getDaysUntilExpire,
    RATE_SOURCES,
    RATE_SOURCE_CONFIG
  };
}
