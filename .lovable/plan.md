

# V2 四季分类引擎重写计划

## 目标
按照上传的 V2 技术规格文档，重写 `src/lib/stockClassifier.ts`，使评分逻辑、门控规则、confidence 公式等完全匹配文档定义。

## 当前代码 vs V2 规格的主要差异

| 模块 | 当前实现 | V2 规格要求 |
|------|---------|------------|
| **均线排列** | 仅布尔 bullAlignment/bearAlignment | 需要 0-3 评分体系（3=多头，2=部分多头，1=部分空头，0=空头） |
| **MA 金死叉** | 仅 MA5/14，lookback=5 | 需增加 MA5/20 金死叉，lookback 改为 10 |
| **TREND 评分** | 缺少 MACD 柱正负、均线排列=2/1 的分值 | 需加入 MACD柱>0 → summer+2、≤0 → winter+2、部分多头/空头分值 |
| **TURN 评分** | 缺少 MA5/20 金死叉项；RSI/KDJ 逻辑不同 | RSI<30 根据 turn_count 分给 spring 或 winter；KDJ J<20/J>80 各+1；增加 MA5/20 |
| **EXTENSION 评分** | 缺少 %B 50 分界、BIAS60>15、日内涨跌幅项 | 需加入 %B<50→spring+1、≥50→summer+1；BIAS60>15→autumn+2（无需 turn_count）；日内涨跌幅多档 |
| **春/秋压制** | 直接设为 -Infinity | 应降到亚军分数（让出第一，但保留排名参与） |
| **Confidence** | 结果在 0-1 但无 ×100 取整 | 公式：`round((0.5×strength + 0.5×separation) × 100) / 100` |
| **Season Score** | 不存在 | 需加入 0-100 温度映射（winter=10, spring=40, summer=80, autumn=60） |
| **连续涨跌** | 用 close vs close[i-1] | V2 用 close vs open 判断 |
| **量比** | volume[i] / avg(volume[i-4..i]) | V2 用 volume[0] / avg(volume[1..5])，即当日比前5日均值 |
| **Turn count** | 包含 kdjRecover/kdjFall | V2 前端版只用 MA金死叉+MACD金死叉+价格穿越MA20，共3项 |
| **强趋势优先** | 有特殊逻辑 | V2 无此逻辑，纯靠分数+门控 |

## 实施计划

### 文件：`src/lib/stockClassifier.ts` — 完全重写

保留现有类型接口（微调），重写核心逻辑：

**1. 类型更新**
- `TurnSignals` 增加 `ma520Golden`、`ma520Dead` 字段
- `IndicatorSnapshot` 增加 `maAlignmentScore`（0-3）、`consecutiveUpDays`、`consecutiveDownDays`（改用 close vs open）
- `ClassificationResult` 增加 `seasonScore: number`（0-100 温度值）

**2. 指标计算调整**
- 均线排列改为 0-3 评分函数
- MA 金死叉 lookback 改为 10
- 增加 MA5/20 金死叉检测
- 连续涨跌改为 close > open 判断
- 量比改为 当日量 / 前5日均量

**3. Turn Count 重算**
- 前端版仅用 3 项：MA5/14 金死叉、MACD 金死叉、价格穿越 MA20
- 移除 RSI 和 KDJ 的 turn count 贡献

**4. 评分表完全按 V2 文档重写**
- **TREND**：加入均线排列=2/1分值、MACD柱正负判断
- **TURN**：加入 MA5/20 金死叉（spring+2/autumn+2）；RSI<30 按 turn_count 分配给 spring 或 winter；KDJ J<20→spring+1、J>80→autumn+1
- **EXTENSION**：加入 %B 50 分界线、BIAS60>15→autumn+2、日内涨跌幅多档（≥3%、≥1%、≤-3%、≤-1%）
- **WEEKLY**：周线 MACD 柱改为比较 3 周前 vs 当前的正负翻转（需≥35周数据）

**5. 春/秋门控压制**
- 不再设为 -Infinity，改为降到亚军分数

**6. Confidence + Season Score**
- Confidence 公式加 `×100 / 100` 取整
- 新增 `seasonScore` 计算：加权温度映射

**7. 移除强趋势优先逻辑**
- V2 不需要此规则

**8. 状态机保持不变**
- `updatePersistenceState` 逻辑与 V2 §10 一致，保留现有实现

