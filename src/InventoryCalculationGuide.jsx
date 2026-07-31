const INVENTORY_CALCULATION_SOURCES = [
  {
    name: 'FBA库存',
    file: 'FBA库存报表',
    fields: 'SKU、仓库名称、库存筛选、期末库存(含移仓)-数量',
    filters: '仅库存筛选=全部；期末库存(含移仓)-数量为0、空值或非法值不进入映射与汇总',
    mapping: 'SKU → Dim-领星SKU对应物料编码-产品管理的识别码（物料编码）；仓库名称 → Dim-领星FBA仓库&金蝶仓库 → 主体+金蝶仓库+物料编码 → 仓库与物料对照表 → 事业部',
    quantity: '期末库存(含移仓)-数量',
    value: '期末库存(含移仓)-数量 × 商品分类维度的不含税结算价'
  },
  {
    name: 'FBM库存',
    file: 'FBM库存报表',
    fields: '识别码、仓库名称、实际总量',
    filters: '实际总量为0、空值或非法值不进入映射与汇总；排除默认仓库、US-FBA移除中转虚拟仓、虚拟仓库--仅用于测试',
    mapping: '识别码=物料编码；仓库名称 → 维度表库“仓库名称”取得主体；主体+仓库名称+物料编码 → 仓库与物料对照表 → 事业部',
    quantity: '实际总量',
    value: '实际总量 × 商品分类维度的不含税结算价'
  },
  {
    name: 'WFS库存',
    file: 'WFS库存报表',
    fields: 'SKU、仓库名称、总库存数量',
    filters: '总库存数量为0、空值或非法值不进入映射与汇总',
    mapping: 'SKU → Dim-领星SKU对应物料编码-产品管理的识别码（物料编码）；仓库名称 → Dim-领星FBA仓库&金蝶仓库 → 主体+金蝶仓库+物料编码 → 仓库与物料对照表 → 事业部',
    quantity: '总库存数量',
    value: '总库存数量 × 商品分类维度的不含税结算价'
  },
  {
    name: '国内在库',
    file: '国内在库报表',
    fields: '使用组织/库存组织、仓库名称、物料编码、库存量(主单位)',
    filters: '库存量(主单位)为0、空值或非法值不进入映射与汇总；映射后仅保留国内事业部',
    mapping: '使用组织=主体=库存组织；主体+仓库名称+物料编码 → 仓库与物料对照表 → 事业部；物料编码直接匹配商品分类',
    quantity: '库存量(主单位)',
    value: '库存量(主单位) × 商品分类维度的不含税结算价'
  },
  {
    name: '京东在库',
    file: '京东在库报表',
    fields: 'SKU/京东ID、全国现货库存',
    filters: '全国现货库存为0、空值或非法值不进入映射与汇总；全部有效数据均纳入',
    mapping: 'SKU/京东ID → Dim-京东ID与品号匹配 → 物料编码；事业部固定为国内事业部',
    quantity: '全国现货库存',
    value: '全国现货库存 × 商品分类维度的不含税结算价'
  },
  {
    name: 'FBA在途',
    file: 'FBA在途报表',
    fields: '店铺、SKU、货件状态、发货数量、已发货、签收量',
    filters: '拆分并向下填充全部合并单元格；仅保留 RECEIVING、READY_TO_SHIP、CLOSED、IN_TRANSIT、WORKING、SHIPPED、DELIVERED；发货数量=0时排除',
    mapping: 'SKU → Dim-领星SKU对应物料编码-产品管理；店铺 → Dim-领星FBA在途&金蝶仓库 → 主体+金蝶仓库+物料编码 → 仓库与物料对照表 → 事业部',
    quantity: '逐行 MAX(已发货-签收量, 0)，再按事业部+物料编码汇总',
    value: '在途数量 × 商品分类维度的不含税结算价'
  },
  {
    name: 'FBM在途',
    file: 'FBM在途报表',
    fields: 'SKU、收货仓库、备货数量、收货数量',
    filters: '读取“备货单详情”工作表；全部数据纳入，负数结果保留',
    mapping: 'SKU → Dim-领星SKU对应物料编码-产品管理；收货仓库 → 维度表库“仓库名称”取得主体；主体+收货仓库+物料编码 → 仓库与物料对照表 → 事业部',
    quantity: '逐行备货数量-收货数量，再按事业部+物料编码汇总',
    value: '在途数量 × 商品分类维度的不含税结算价'
  },
  {
    name: '京东在途',
    file: '京东在途',
    fields: '物料编码、在途数量',
    filters: '文件必须且只能有一个工作表；全部数据纳入；零数和负数保留；空值、短横线或非法值按0并进入数据诊断',
    mapping: '物料编码直接匹配商品分类；事业部固定为国内事业部；库存主体固定为浙江迈德斯特医疗器械科技有限公司',
    quantity: '逐行读取在途数量，再按国内事业部+物料编码汇总',
    value: '在途数量 × 商品分类维度的不含税结算价；商品分类未匹配时货值按0'
  },
  {
    name: '销售数据',
    file: '销售数据报表',
    fields: '日期、事业部、物料编码、销售数量、销售金额',
    filters: '全部数据纳入；日期统一转换为 YYYY-MM 并保留月份',
    mapping: '事业部直接取报表字段；物料编码直接匹配商品分类',
    quantity: '销售数量；按 YYYY-MM+事业部+物料编码汇总',
    value: '销售金额直接取报表字段，不使用结算价重算'
  },
  {
    name: '采购未交付',
    file: '采购跟单情况',
    fields: '下单月份、事业部、物料编码、备货剩余数量、完工未发产品、已下单未备料未生产、已备料未生产、生产中产品、是否需正常交货',
    filters: '是否需正常交货为“是”或“否”时计入；其他值显示为无未交付，采购数量按0处理；全部月份保留',
    mapping: '事业部和物料编码直接取报表字段；物料编码直接匹配商品分类',
    quantity: '未交付数量=备货剩余数量；生产阶段数量分别取对应原字段',
    value: '未交付及各生产阶段数量 × 商品分类维度的不含税结算价'
  }
];

const INVENTORY_CALCULATION_FORMULAS = [
  ['跨境在库', 'FBA库存 + FBM库存 + WFS库存'],
  ['国内在库', '国内在库报表 + 京东在库报表'],
  ['在库量', '跨境在库 + 国内在库'],
  ['在途量', 'FBA在途 + FBM在途 + 京东在途'],
  ['采购未交付', '采购跟单情况中的备货剩余数量'],
  ['库存规模合计', '在库量 + 在途量 + 采购未交付']
];

export default function InventoryCalculationGuide({ onBack }) {
  return (
    <section className="inventory-methodology">
      <header className="inventory-methodology-header">
        <button type="button" className="ghost compact-button inventory-methodology-back" onClick={onBack}>← 返回销售与库存看板</button>
        <div>
          <span className="section-kicker">CALCULATION LOGIC</span>
          <h2>库存计算口径说明</h2>
          <p>说明当前系统实际使用的文件、字段、筛选条件、映射链路和汇总公式。</p>
        </div>
      </header>

      <section className="inventory-methodology-section">
        <div className="inventory-methodology-section-head">
          <h3>分层计算公式</h3>
          <span>数量与货值使用同一分层结构</span>
        </div>
        <div className="inventory-formula-grid">
          {INVENTORY_CALCULATION_FORMULAS.map(([label, formula]) => (
            <article className="inventory-formula-card" key={label}>
              <strong>{label}</strong>
              <span>{formula}</span>
            </article>
          ))}
        </div>
        <p className="inventory-methodology-note">除销售金额外，货值统一按“对应数量 × 商品分类维度的不含税结算价”逐行计算后汇总；页面显示万元，Excel导出保留原始元。</p>
      </section>

      <section className="inventory-methodology-section">
        <div className="inventory-methodology-section-head">
          <h3>数据来源与取数字段</h3>
          <span>横向滚动可查看完整映射链路</span>
        </div>
        <div className="inventory-methodology-table-wrap">
          <table className="inventory-methodology-table">
            <thead>
              <tr>
                <th>指标</th>
                <th>来源文件</th>
                <th>使用字段</th>
                <th>筛选与取数范围</th>
                <th>物料与事业部映射</th>
                <th>数量计算</th>
                <th>货值计算</th>
              </tr>
            </thead>
            <tbody>
              {INVENTORY_CALCULATION_SOURCES.map((row) => (
                <tr key={row.name}>
                  <th scope="row">{row.name}</th>
                  <td>{row.file}</td>
                  <td>{row.fields}</td>
                  <td>{row.filters}</td>
                  <td>{row.mapping}</td>
                  <td>{row.quantity}</td>
                  <td>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="inventory-methodology-section">
        <div className="inventory-methodology-section-head">
          <h3>公共映射与异常处理</h3>
          <span>所有事实数据最终按事业部+物料编码归集</span>
        </div>
        <div className="inventory-rule-grid">
          <article>
            <strong>商品分类映射</strong>
            <p>物料编码匹配“商品分类”，取得 SKU、物料名称、销售产品线、销售系列和不含税结算价。</p>
          </article>
          <article>
            <strong>仓库事业部映射</strong>
            <p>先取得主体和金蝶仓库，再使用“主体+仓库名称+物料编码”匹配“仓库与物料对照表”取得事业部。</p>
          </article>
          <article>
            <strong>缺失与冲突</strong>
            <p>维度缺失或同一键存在多个结果时标记映射冲突并进入诊断。国内在库仅纳入明确映射为国内事业部的记录。</p>
          </article>
          <article>
            <strong>数量清洗</strong>
            <p>数量支持逗号分隔。库存数量为0时直接剔除且不生成维度提醒；京东在途例外，零数和负数保留，空值、短横线或非法值按0并进入数据诊断。</p>
          </article>
        </div>
      </section>

      <section className="inventory-methodology-section">
        <div className="inventory-methodology-section-head">
          <h3>ABC分类与看板口径</h3>
          <span>销量ABC与销售额ABC相互独立</span>
        </div>
        <div className="inventory-methodology-copy">
          <p><strong>销量ABC：</strong>各事业部内按销售数量合计降序计算累计贡献，累计占比≤80%为A，80%＜累计占比≤90%为B，累计占比＞90%为C；销售数量合计≤0归为C。</p>
          <p><strong>销售额ABC：</strong>各事业部内按销售金额合计降序独立计算，边界规则与销量ABC一致；销售金额合计≤0归为C。</p>
          <p><strong>相同值处理：</strong>相同销量或销售额采用同一累计边界并归入相同等级。看板筛选后的卡片、图表和表格均基于同一批汇总行计算。</p>
        </div>
      </section>
    </section>
  );
}
